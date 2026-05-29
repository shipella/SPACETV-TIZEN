const { chromium } = require('playwright');
const https = require('https');

async function testHeaders() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' });
  const page = await context.newPage();

  let m3u8Url = null;
  let m3u8Content = null;
  let requestHeaders = null;
  let responseHeaders = null;

  // Capture the actual request that fetches the M3U8
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('.m3u8')) {
      requestHeaders = req.headers();
      console.log('M3U8 Request headers:', JSON.stringify(requestHeaders, null, 2));
    }
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('.m3u8') && !m3u8Url) {
      m3u8Url = url;
      responseHeaders = resp.headers();
      console.log('M3U8 Response headers:', JSON.stringify(responseHeaders, null, 2));
      try {
        m3u8Content = await resp.text();
        console.log('\n=== M3U8 Content (full) ===');
        console.log(m3u8Content);
      } catch(e) {
        console.log('Failed to read response:', e.message);
      }
    }
    // Also capture video segment requests
    if (url.includes('.ts') || url.includes('.m4s')) {
      console.log(`\nSegment URL: ${url.substring(0, 120)}...`);
      console.log(`Segment status: ${resp.status()}`);
    }
  });

  await page.goto('https://vidking.net/embed/movie/550', { waitUntil: 'domcontentloaded', timeout: 25000 });
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (m3u8Content) break; }
  
  if (!m3u8Content) {
    console.log('M3U8 content not captured via response. Trying direct fetch with browser cookies...');
    // Get cookies from browser context
    const cookies = await context.cookies();
    console.log('Cookies:', cookies.map(c => `${c.name}=${c.value}`).join('; '));
  }

  await browser.close();
}

testHeaders();
