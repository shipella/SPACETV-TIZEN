// Test the VidKing proxy server
// In production, this would be a standalone service
const express = require('express');
const { chromium } = require('playwright');
const http = require('http');

async function testResolve(tmdbId, type = 'movie') {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  let m3u8Url = null;
  let apiUrl = null;
  let encryptedResponse = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('.m3u8') && !m3u8Url) {
      m3u8Url = url;
    }
    if (url.includes('sources-with-title') && !apiUrl) {
      apiUrl = url;
      try { encryptedResponse = await response.text(); } catch(e) {}
    }
  });

  const embedUrl = `https://vidking.net/embed/${type}/${tmdbId}`;
  console.log(`Loading: ${embedUrl}`);

  await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  
  // Wait up to 20s for M3U8
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (m3u8Url) break;
  }

  if (m3u8Url) {
    console.log('\n✅ M3U8 URL FOUND!');
    console.log(m3u8Url);
    
    // Test if the M3U8 is accessible
    console.log('\nTesting M3U8 accessibility...');
    const testResult = await testM3U8Access(m3u8Url);
    console.log(`Accessible: ${testResult}`);
  } else {
    console.log('\n❌ No M3U8 URL found');

    // Check the page for clues
    const pageInfo = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      iframes: document.querySelectorAll('iframe').length,
      iframeSrcs: Array.from(document.querySelectorAll('iframe')).map(i => i.src),
      scripts: document.querySelectorAll('script').length,
      errorMessages: Array.from(document.querySelectorAll('[class*="error"], [class*="alert"]')).map(e => e.textContent),
    }));
    console.log('Page info:', JSON.stringify(pageInfo, null, 2));
  }

  await browser.close();
  return m3u8Url;
}

function testM3U8Access(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 10000 }, (res) => {
      resolve(`Status ${res.statusCode}, Content-Type: ${res.headers['content-type']}`);
    });
    req.on('error', (e) => resolve(`Error: ${e.message}`));
    req.on('timeout', () => { req.destroy(); resolve('Timeout'); });
  });
}

// Test with Fight Club
console.log('=== Testing VidKing Resolver ===\n');
testResolve('550', 'movie').then(url => {
  console.log('\n=== Done ===');
});
