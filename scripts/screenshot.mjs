// Saves a screenshot of the running game for visual verification.
//   node scripts/screenshot.mjs <outputPath>
import puppeteer from 'puppeteer-core';

const url = process.env.SMOKE_URL || 'http://localhost:5173/';
const out = process.argv[2] || 'shot.png';
const executablePath =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--window-size=1280,800',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await wait(1500);
  await page.screenshot({ path: out });
  console.log('SAVED', out);
} finally {
  await browser.close();
}
