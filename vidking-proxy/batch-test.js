const { chromium } = require('playwright');
const https = require('https');
const http = require('http');

const TMDB_IDS = [
  { id: '550', title: 'Fight Club', type: 'movie' },
  { id: '27205', title: 'Inception', type: 'movie' },
  { id: '680', title: 'Pulp Fiction', type: 'movie' },
  { id: '155', title: 'The Dark Knight', type: 'movie' },
];

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function resolveMovie(tmdb, type) {
  console.log(`\n=== Resolving ${type}/${tmdb} ===`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  const page = await context.newPage();

  let m3u8Url = null;
  let allRequests = [];

  page.on('response', (r) => {
    const url = r.url();
    allRequests.push(url);
    if (url.includes('.m3u8') && !m3u8Url) m3u8Url = url;
  });

  try {
    const embedUrl = `https://vidking.net/embed/${type}/${tmdb}`;
    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (m3u8Url) break; }
  } catch (e) {}

  await browser.close();

  if (m3u8Url) {
    console.log(`✅ M3U8: ${m3u8Url.substring(0, 100)}...`);
    
    // Fetch the M3U8 content
    try {
      console.log('Fetching M3U8 playlist...');
      const result = await fetchUrl(m3u8Url);
      if (result.status === 200) {
        console.log(`\n--- M3U8 Playlist (first 2000 chars) ---`);
        console.log(result.data.substring(0, 2000));
        console.log(`\n--- Headers ---`);
        console.log(JSON.stringify(result.headers, null, 2));
      } else {
        console.log(`❌ HTTP ${result.status}: ${result.data.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`❌ Fetch error: ${e.message}`);
    }
  } else {
    console.log(`❌ No M3U8 found`);
    console.log(`Last 10 requests: ${allRequests.slice(-10).join('\n  ')}`);
  }

  return m3u8Url;
}

(async () => {
  console.log('=== Batch M3U8 Extraction Test ===\n');
  for (const m of TMDB_IDS) {
    try {
      await resolveMovie(m.id, m.type);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
  console.log('\n=== Done ===');
})();
