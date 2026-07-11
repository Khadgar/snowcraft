// Interaction smoke test for Milestone 2: verifies that clicking a unit selects
// it and that a right-click move order actually moves the unit. Uses the system
// browser via puppeteer-core against the running dev server.
//   node scripts/interaction.mjs
import puppeteer from 'puppeteer-core';

const url = process.env.SMOKE_URL || 'http://localhost:5173/';
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

const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await wait(1000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /start battle/i.test(x.textContent || ''),
    );
    if (b) b.click();
  });
  await wait(800);

  // Compute the screen position of a player-team unit.
  const info = await page.evaluate(() => {
    const g = window.game;
    const THREE = window.THREE;
    const cam = g.renderer.camera;
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const unit = g.world.players.find((p) => p.team === 'player' && p.alive);
    const v = new THREE.Vector3(unit.position.x, 0.5, unit.position.y);
    v.project(cam);
    return {
      id: unit.id,
      sx: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      sy: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
      before: { x: unit.position.x, y: unit.position.y },
    };
  });

  // Tap to select.
  await page.mouse.click(info.sx, info.sy);
  await wait(200);
  const selected = await page.evaluate(() =>
    window.game.world.players.filter((p) => p.selected).map((p) => p.id),
  );

  // Right-click to the right of the unit to issue a move order.
  await page.mouse.click(info.sx + 140, info.sy, { button: 'right' });
  await wait(1400);
  const after = await page.evaluate((id) => {
    const p = window.game.world.players.find((x) => x.id === id);
    return { x: p.position.x, y: p.position.y };
  }, info.id);

  const moved = Math.hypot(after.x - info.before.x, after.y - info.before.y);
  const isSelected = selected.includes(info.id);

  console.log(
    'RESULT',
    JSON.stringify({ selected, isSelected, before: info.before, after, moved: Number(moved.toFixed(2)) }),
  );
  if (errors.length) console.log('ERRORS', JSON.stringify(errors, null, 2));

  await browser.close();

  if (errors.length) process.exit(1);
  if (!isSelected) {
    console.log('INTERACTION FAILED: unit was not selected by click');
    process.exit(2);
  }
  if (!(moved > 0.3)) {
    console.log('INTERACTION FAILED: unit did not move on right-click order');
    process.exit(3);
  }
  console.log('INTERACTION OK');
} catch (err) {
  console.error('INTERACTION ERROR', err);
  await browser.close();
  process.exit(4);
}
