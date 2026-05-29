const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3456;
const CACHE_FILE = path.join(__dirname, 'cache.json');

let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch(e) {}
}
setInterval(() => {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2)); } catch(e) {}
}, 30000);

app.get('/reset-cache', (req, res) => {
  cache = {};
  try { fs.writeFileSync(CACHE_FILE, '{}'); } catch(e) {}
  res.json({ ok: true });
});

// Resolve M3U8 URL from VidLink embed (replaces broken VidKing)
app.get('/resolve', async (req, res) => {
  const { tmdb, type = 'movie', season, episode, force } = req.query;
  if (!tmdb) return res.status(400).json({ error: 'tmdb required' });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  const cacheKey = type === 'tv' ? `${type}:${tmdb}:S${season || 1}E${episode || 1}` : `${type}:${tmdb}`;
  if (!force && cache[cacheKey] && cache[cacheKey].url) {
    const age = Date.now() - cache[cacheKey].ts;
    if (age < 3600000) return res.json({ ok: true, url: cache[cacheKey].url, type: 'hls', cached: true });
  }

  console.log(`[${new Date().toISOString()}] Resolve ${type}/${tmdb} S${season||'?'}E${episode||'?'}`);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
    const page = await context.newPage();

    let m3u8Url = null;
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('.m3u8') && u.includes('vodvidl') && !m3u8Url) {
        m3u8Url = u;
      }
    });

    let embedUrl;
    if (type === 'tv') {
      embedUrl = `https://vidlink.pro/tv/${tmdb}/${season || 1}/${episode || 1}?player=jw&autoplay=false`;
    } else {
      embedUrl = `https://vidlink.pro/movie/${tmdb}?player=jw&autoplay=false`;
    }
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      if (m3u8Url) break;
    }

    await page.waitForTimeout(1000);
    await browser.close(); browser = null;

    if (m3u8Url) {
      cache[cacheKey] = { url: m3u8Url, ts: Date.now() };
      console.log(`[${new Date().toISOString()}] OK`);
      return res.json({ ok: true, url: m3u8Url, type: 'hls' });
    }
    return res.json({ ok: false, error: 'No stream found' });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

// Fetch M3U8 playlist with browser headers and rewrite segments to absolute URLs
app.get('/playlist', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  try {
    const m3u8Url = decodeURIComponent(url);
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

    const resp = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vidlink.pro/',
        'Origin': 'https://vidlink.pro',
      }
    });

    if (!resp.ok) {
      return res.json({ ok: false, error: `HTTP ${resp.status}`, status: resp.status });
    }

    let playlist = await resp.text();
    // Rewrite relative segment URLs to absolute
    playlist = playlist.split('\n').map(line => {
      if (line && !line.startsWith('#') && !line.startsWith('http')) {
        return baseUrl + line;
      }
      return line;
    }).join('\n');

    return res.json({ ok: true, playlist, headers: Object.fromEntries(resp.headers) });
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
});

// Return M3U8 playlist with segments rewritten to proxy (for AVPlay)
app.get('/playlist-m3u8', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('url required');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  try {
    const m3u8Url = decodeURIComponent(url);
    const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
    const proxyBase = req.protocol + '://' + req.get('host') + '/segment?url=';
    const resp = await fetch(m3u8Url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vidlink.pro/',
        'Origin': 'https://vidlink.pro',
      }
    });
    if (!resp.ok) return res.status(resp.status).send('Playlist fetch failed');
    let playlist = await resp.text();
    playlist = playlist.split('\n').map(line => {
      if (line && !line.startsWith('#') && !line.startsWith('http')) {
        return proxyBase + encodeURIComponent(baseUrl + line);
      }
      return line;
    }).join('\n');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlist);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Proxy TS segments through node (with proper headers)
app.get('/segment', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const segUrl = decodeURIComponent(url);
    const resp = await fetch(segUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vidlink.pro/',
      }
    });

    if (!resp.ok) return res.status(resp.status).send('Fetch failed');

    const buffer = await resp.arrayBuffer();
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'video/MP2T');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/', (req, res) => {
  res.json({
    service: 'VidLink Resolver',
    endpoints: { resolve: '/resolve?tmdb=ID', 'playlist-m3u8': '/playlist-m3u8?url=URL', segment: '/segment?url=URL', 'playlist': '/playlist?url=URL' },
    cacheSize: Object.keys(cache).length,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VidKing resolver on http://0.0.0.0:${PORT}`);
  console.log(`PC IP: ${Object.values(require('os').networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'unknown'}`);
  console.log(`Cache: ${Object.keys(cache).length} entries`);
});
