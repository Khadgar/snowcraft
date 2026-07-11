// Combat end-to-end test (Milestones 3-5): starts a match, moves the two squads
// into engagement range, lets the AI fight, and verifies the full combat loop
// (throw → projectile → collision → damage) actually happens: snowballs are
// thrown, hits register, and total squad health drops — with no runtime errors.
//   node scripts/combat.mjs
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
  // Start the battle.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) =>
      /start battle/i.test(x.textContent || ''),
    );
    if (b) b.click();
  });

  // Set up counters and pull the squads into engagement range for a fast fight.
  const before = await page.evaluate(() => {
    const g = window.game;
    const w = globalThis;
    w.__thrown = 0;
    w.__hits = 0;
    g.events.on('SnowballThrown', () => (w.__thrown += 1));
    g.events.on('PlayerHit', () => (w.__hits += 1));
    const ys = [-5, 0, 5];
    let pi = 0;
    let ei = 0;
    for (const p of g.world.players) {
      if (p.team === 'player') {
        p.position.x = -7;
        p.position.y = ys[pi++ % 3];
      } else {
        p.position.x = 7;
        p.position.y = ys[ei++ % 3];
      }
    }
    return { totalHealth: g.world.players.reduce((s, p) => s + p.health, 0) };
  });

  await wait(9000);

  const after = await page.evaluate(() => {
    const g = window.game;
    return {
      thrown: globalThis.__thrown,
      hits: globalThis.__hits,
      totalHealth: g.world.players.reduce((s, p) => s + p.health, 0),
      living: {
        player: g.world.countLiving('player'),
        enemy: g.world.countLiving('enemy'),
      },
    };
  });

  console.log('RESULT', JSON.stringify({ before, after }));
  if (errors.length) console.log('ERRORS', JSON.stringify(errors, null, 2));

  await browser.close();

  if (errors.length) process.exit(1);
  if (!(after.thrown >= 1)) {
    console.log('COMBAT FAILED: no snowballs thrown');
    process.exit(2);
  }
  if (!(after.hits >= 1) || !(after.totalHealth < before.totalHealth)) {
    console.log('COMBAT FAILED: no damage dealt during the fight');
    process.exit(3);
  }
  console.log('COMBAT OK');
} catch (err) {
  console.error('COMBAT ERROR', err);
  await browser.close();
  process.exit(4);
}
