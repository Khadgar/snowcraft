// Headless smoke test: loads the running dev server in the system browser,
// captures console/runtime errors, and asserts the game booted (canvas, world,
// players, and a ticking simulation clock). Run with the dev server up:
//   node scripts/smoke.mjs
import puppeteer from 'puppeteer-core';

const url = process.env.SMOKE_URL || 'http://localhost:5173/';
const executablePath =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) =>
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`),
  );

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 800));
  // Dismiss the main menu to begin the battle.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /start battle/i.test(x.textContent || ''),
    );
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2500));

  const state = await page.evaluate(() => {
    const g = window.game;
    const canvas = document.querySelector('canvas');
    return {
      hasCanvas: !!canvas,
      canvasW: canvas?.width ?? 0,
      canvasH: canvas?.height ?? 0,
      hasGame: !!g,
      players: g?.world?.players?.length ?? null,
      obstacles: g?.world?.arena?.obstacles?.length ?? null,
      fps: g?.loopStats?.fps ?? null,
      time: g?.world?.time ?? null,
    };
  });

  console.log('STATE', JSON.stringify(state));
  if (errors.length) {
    console.log('ERRORS', JSON.stringify(errors, null, 2));
  }

  await browser.close();

  if (errors.length) process.exit(1);
  if (!state.hasCanvas || !state.hasGame || !state.players || !(state.time > 0)) {
    console.log('SMOKE FAILED: game did not boot as expected');
    process.exit(2);
  }
  console.log('SMOKE OK');
} catch (err) {
  console.error('SMOKE ERROR', err);
  await browser.close();
  process.exit(3);
}
