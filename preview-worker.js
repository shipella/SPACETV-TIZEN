// SPACE TV - Gateway Worker
// Endpoints: /preview, /stream, /vidking, /youtube, /proxy, /image

var TMDB_API_KEY = '5ec171c6bf26c707ac208ba4bb5b88b5';
var YOUTUBE_API_KEY = 'AIzaSyDSTF603p3F5IPSjNztkCVIpAH-stIyDzQ';
var TMDB_BASE = 'https://api.themoviedb.org/3';
var IMG_BASE = 'https://image.tmdb.org/t/p';
var VIDKING_BASE = 'https://vidking.net';

var CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*'
};

var VIDKING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://vidking.net',
  'Referer': 'https://vidking.net/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
};

// ─── /stream — Resolve stream URL from VidKing ──────────────────────────────
async function handleStream(request) {
  var url = new URL(request.url);
  var tmdbId = url.searchParams.get('tmdbId');
  var mediaType = url.searchParams.get('mediaType') || 'movie';
  var season = url.searchParams.get('season') || '1';
  var episode = url.searchParams.get('episode') || '1';
  var language = url.searchParams.get('language') || 'en';

  if (!tmdbId) return jsonResponse({ error: 'Missing tmdbId' }, 400);

  try {
    // Build VidKing API URL
    var apiUrl;
    if (mediaType === 'tv') {
      apiUrl = VIDKING_BASE + '/api/tv/' + encodeURIComponent(tmdbId) + '/' + encodeURIComponent(season) + '/' + encodeURIComponent(episode);
      if (language) apiUrl += '?lang=' + encodeURIComponent(language);
    } else {
      apiUrl = VIDKING_BASE + '/api/movie/' + encodeURIComponent(tmdbId);
      if (language) apiUrl += '?lang=' + encodeURIComponent(language);
    }

    var vkResp = await fetch(apiUrl, { headers: VIDKING_HEADERS });
    if (!vkResp.ok) return jsonResponse({ error: 'VidKing API failed: ' + vkResp.status, url: apiUrl }, 502);

    var vkText = await vkResp.text();
    var contentType = (vkResp.headers.get('content-type') || '').toLowerCase();

    // VidKing returns HTML (embed page) instead of JSON — return embed URL as fallback
    if (contentType.indexOf('html') > -1 || vkText.trim().indexOf('<!DOCTYPE') === 0) {
      var embedUrl = VIDKING_BASE + '/embed/';
      if (mediaType === 'tv') {
        embedUrl += 'tv/' + encodeURIComponent(tmdbId) + '/' + encodeURIComponent(season) + '/' + encodeURIComponent(episode);
      } else {
        embedUrl += 'movie/' + encodeURIComponent(tmdbId);
      }
      if (language) embedUrl += '?lang=' + encodeURIComponent(language);
      return jsonResponse({ ok: true, type: 'embed', url: embedUrl, source: 'vidking' });
    }

    var vkData = JSON.parse(vkText);

    // Extract stream URLs from VidKing response
    var streams = [];
    function walk(value) {
      if (typeof value === 'string') {
        var lower = value.toLowerCase();
        if (lower.indexOf('.m3u8') > -1 || lower.indexOf('.mp4') > -1 || lower.indexOf('.mpd') > -1) {
          streams.push(value);
          return;
        }
      }
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (value && typeof value === 'object') { Object.keys(value).forEach(function(k) { walk(value[k]); }); }
    }
    walk(vkData);

    if (!streams.length) return jsonResponse({ error: 'No stream URLs found in VidKing response', raw: vkData }, 404);

    // Sort by quality (prefer 1080p, then 720p)
    streams.sort(function(a, b) {
      var aw = (a.indexOf('1080') > -1 || a.indexOf('1920') > -1) ? 3 : (a.indexOf('720') > -1 || a.indexOf('1280') > -1) ? 2 : 1;
      var bw = (b.indexOf('1080') > -1 || b.indexOf('1920') > -1) ? 3 : (b.indexOf('720') > -1 || b.indexOf('1280') > -1) ? 2 : 1;
      return bw - aw;
    });

    return jsonResponse({ ok: true, url: streams[0], all: streams, source: 'vidking' });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── /vidking — Direct VidKing API proxy ────────────────────────────────────
async function handleVidKing(request) {
  var url = new URL(request.url);
  var path = url.searchParams.get('path') || '';
  var language = url.searchParams.get('lang') || 'en';

  if (!path) return jsonResponse({ error: 'Missing path parameter' }, 400);

  try {
    var apiUrl = VIDKING_BASE + '/' + path;
    if (apiUrl.indexOf('?') > -1) {
      apiUrl += '&lang=' + encodeURIComponent(language);
    } else {
      apiUrl += '?lang=' + encodeURIComponent(language);
    }

    var resp = await fetch(apiUrl, { headers: VIDKING_HEADERS });
    if (!resp.ok) return new Response('VidKing API error: ' + resp.status, { status: resp.status, headers: CORS_HEADERS });

    var data = await resp.json();
    return jsonResponse(data);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── /youtube — Resolve YouTube trailer from TMDB ───────────────────────────
async function handleYouTube(request) {
  var url = new URL(request.url);
  var tmdbId = url.searchParams.get('tmdbId');
  var mediaType = url.searchParams.get('mediaType') || 'movie';

  if (!tmdbId) return jsonResponse({ error: 'Missing tmdbId' }, 400);

  try {
    // Fetch videos from TMDB
    var videosUrl = TMDB_BASE + '/' + mediaType + '/' + tmdbId + '/videos?api_key=' + TMDB_API_KEY;
    var videosResp = await fetch(videosUrl, { headers: { 'Accept': 'application/json' } });

    if (!videosResp.ok) return jsonResponse({ error: 'TMDB API failed: ' + videosResp.status }, 502);

    var videosData = await videosResp.json();
    var results = videosData.results || [];

    // Find YouTube trailer
    var trailer = null;
    for (var i = 0; i < results.length; i++) {
      var video = results[i];
      if (video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser')) {
        trailer = video;
        break;
      }
    }

    // Fallback: use any YouTube video
    if (!trailer) {
      for (var j = 0; j < results.length; j++) {
        if (results[j].site === 'YouTube') {
          trailer = results[j];
          break;
        }
      }
    }

    if (!trailer) return jsonResponse({ error: 'No trailer found', tmdbId: tmdbId, mediaType: mediaType }, 404);

    // Build YouTube embed URL
    var embedUrl = 'https://www.youtube.com/embed/' + trailer.key + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';

    return jsonResponse({
      ok: true,
      youtubeId: trailer.key,
      name: trailer.name,
      type: trailer.type,
      embedUrl: embedUrl,
      site: trailer.site
    });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── /youtube-player — YouTube iframe player page ───────────────────────────
async function handleYouTubePlayer(request) {
  var url = new URL(request.url);
  var videoId = url.searchParams.get('id') || '';
  var autoplay = url.searchParams.get('autoplay') || '1';

  if (!videoId) return new Response('Missing video ID', { status: 400, headers: CORS_HEADERS });

  var html = '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>SPACE TV - Trailer</title>' +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;}' +
    'iframe{width:100%;height:100%;border:none;}</style></head>' +
    '<body><iframe src="https://www.youtube.com/embed/' + videoId + '?autoplay=' + autoplay + '&rel=0&modestbranding=1&playsinline=1" ' +
    'allow="autoplay;fullscreen;encrypted-media" allowfullscreen></iframe></body></html>';

  return new Response(html, {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'text/html' }, CORS_HEADERS)
  });
}

// ─── /preview — Smart Hub Preview JSON ──────────────────────────────────────
async function handlePreview() {
  var sections = [];
  var tileIndex = 0;

  try {
    var movieData = await fetchJson(TMDB_BASE + '/trending/movie/day?api_key=' + TMDB_API_KEY);
    var movies = (movieData && movieData.results) || [];
    var tvData = await fetchJson(TMDB_BASE + '/trending/tv/day?api_key=' + TMDB_API_KEY);
    var shows = (tvData && tvData.results) || [];

    var movieTiles = [];
    for (var mi = 0; mi < Math.min(movies.length, 20); mi++) {
      if (movies[mi].backdrop_path) movieTiles.push(buildTile(movies[mi], 'movie', tileIndex++));
    }
    if (movieTiles.length) sections.push({ title: 'Trending Movies', tiles: movieTiles });

    var tvTiles = [];
    for (var ti = 0; ti < Math.min(shows.length, 20); ti++) {
      if (shows[ti].backdrop_path) tvTiles.push(buildTile(shows[ti], 'tv', tileIndex++));
    }
    if (tvTiles.length) sections.push({ title: 'Trending TV Shows', tiles: tvTiles });
  } catch (e) {
    return jsonResponse({ error: 'Failed to fetch preview data' }, 500);
  }

  return jsonResponse({
    sections: sections,
    expires: Math.floor(Date.now() / 1000) + 3600
  });
}

function buildTile(item, mediaType, index) {
  var title = item.title || item.name || 'Untitled';
  var year = (item.release_date || item.first_air_date || '').split('-')[0] || '';
  return {
    title: title,
    subtitle: year ? (year + ' \u2022 ' + (mediaType === 'movie' ? 'Movie' : 'TV')) : (mediaType === 'movie' ? 'Movie' : 'TV'),
    image_url: IMG_BASE + '/w780' + item.backdrop_path,
    image_ratio: '16by9',
    action_data: JSON.stringify({ id: item.id, media_type: mediaType, title: title }),
    is_playable: false,
    position: index
  };
}

// ─── /proxy — Generic proxy with header injection ───────────────────────────
async function handleProxy(request) {
  var url = new URL(request.url);
  var targetUrl = url.searchParams.get('url');
  var referer = url.searchParams.get('referer') || '';
  var origin = url.searchParams.get('origin') || '';

  if (!targetUrl) return new Response('Missing url', { status: 400 });

  var headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || targetUrl,
    'Origin': origin || (referer ? referer.replace(/\/+$/, '') : 'https://vidlink.pro'),
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site'
  };

  try {
    var resp = await fetch(targetUrl, { headers: headers });
    var newHeaders = new Headers(resp.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    var ct = (resp.headers.get('content-type') || '').toLowerCase();
    
    // Only rewrite if it's an M3U8 stream manifest (not an M3U playlist for channels)
    if (targetUrl.indexOf('.m3u8') > -1 || ct.indexOf('mpegurl') > -1) {
      var text = await resp.text();
      var lines = text.split('\n');
      var baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      var proxyBase = request.url.substring(0, request.url.indexOf('?'));

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        var resolved = line.startsWith('http') ? line : baseUrl + line;
        lines[i] = proxyBase + '?url=' + encodeURIComponent(resolved) + '&referer=' + encodeURIComponent(referer || targetUrl);
      }
      newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      return new Response(lines.join('\n'), { status: resp.status, headers: newHeaders });
    }

    return new Response(resp.body, { status: resp.status, headers: newHeaders });
  } catch (e) {
    return new Response('Proxy error: ' + e.message, { status: 500, headers: CORS_HEADERS });
  }
}

// ─── /image — Image proxy ───────────────────────────────────────────────────
async function handleImage(request) {
  var imageUrl = new URL(request.url).searchParams.get('url');
  if (!imageUrl) return new Response('Missing url', { status: 400 });
  var resp = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  var h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Cache-Control', 'public, max-age=86400');
  return new Response(resp.body, { status: resp.status, headers: h });
}

// ─── /tmdb-image — Resolve TMDB image URL by type/size ─────────────────────
async function handleTmdbImage(request) {
  var url = new URL(request.url);
  var tmdbId = url.searchParams.get('id');
  var mediaType = url.searchParams.get('type') || 'movie';
  var size = url.searchParams.get('size') || 'original';
  if (!tmdbId) return jsonResponse({ error: 'Missing id' }, 400);

  try {
    if (size === 'logo') {
      var imgResp = await fetch(TMDB_BASE + '/' + mediaType + '/' + tmdbId + '/images?api_key=' + TMDB_API_KEY + '&include_image_language=en,null', { headers: { 'Accept': 'application/json' } });
      if (!imgResp.ok) return jsonResponse({ error: 'TMDB images API failed: ' + imgResp.status }, 502);
      var imgData = await imgResp.json();
      var logos = imgData.logos;
      if (logos && logos.length > 0) {
        var enLogo = logos.filter(function(l) { return l.iso_639_1 === 'en'; });
        var logo = (enLogo.length > 0 ? enLogo[0] : logos[0]);
        return jsonResponse({ url: IMG_BASE + '/original' + logo.file_path });
      }
      return jsonResponse({ error: 'No logo found' }, 404);
    }

    var detailResp = await fetch(TMDB_BASE + '/' + mediaType + '/' + tmdbId + '?api_key=' + TMDB_API_KEY, { headers: { 'Accept': 'application/json' } });
    if (!detailResp.ok) return jsonResponse({ error: 'TMDB detail API failed: ' + detailResp.status }, 502);
    var detail = await detailResp.json();
    var imagePath = detail.backdrop_path || detail.poster_path;
    if (!imagePath) return jsonResponse({ error: 'No image found' }, 404);
    return jsonResponse({ url: IMG_BASE + '/' + size + imagePath });

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function fetchJson(url) {
  var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) return null;
  return resp.json();
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS)
  });
}

// ─── Router ─────────────────────────────────────────────────────────────────
async function handleRequest(request) {
  if (request.method === 'OPTIONS') return new Response('', { headers: CORS_HEADERS });
  var path = new URL(request.url).pathname;

  if (path === '/stream' || path === '/stream/' || path === '/resolve') return handleStream(request);
  if (path === '/vidking' || path === '/vidking/') return handleVidKing(request);
  if (path === '/youtube' || path === '/youtube/') return handleYouTube(request);
  if (path === '/youtube-player' || path === '/youtube-player/') return handleYouTubePlayer(request);
  if (path === '/preview' || path === '/preview/') return handlePreview();
  if (path === '/proxy' || path === '/proxy/') return handleProxy(request);
  if (path === '/image' || path === '/image/') return handleImage(request);
  if (path === '/tmdb-image' || path === '/tmdb-image/') return handleTmdbImage(request);

  return new Response('SPACE TV Gateway', { headers: CORS_HEADERS });
}

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});
