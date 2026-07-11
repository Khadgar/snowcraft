// Captures a live combat screenshot: starts the match, pulls the squads into
// range, waits for the fight, then screenshots.  node scripts/shot-gameplay.mjs <out>
import puppeteer from 'puppeteer-core';

const url = process.env.SMOKE_URL || 'http://localhost:5173/';
const out = process.argv[2] || 'gameplay.png';
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
  await wait(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /start battle/i.test(x.textContent || ''),
    );
    if (b) b.click();
    const g = window.game;
    const ys = [-5, 0, 5];
    let pi = 0;
    let ei = 0;
    for (const p of g.world.players) {
      if (p.team === 'player') {
        p.position.x = -6;
        p.position.y = ys[pi++ % 3];
      } else {
        p.position.x = 6;
        p.position.y = ys[ei++ % 3];
      }
    }
    // Select the player squad so selection rings + HUD cards show.
    for (const p of g.world.players) if (p.team === 'player') p.selected = true;
  });
  await wait(2200);
  await page.screenshot({ path: out });
  console.log('SAVED', out);
} finally {
  await browser.close();
}
