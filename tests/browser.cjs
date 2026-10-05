// Optional development tool only: npm package playwright (not shipped to players).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const puzzles = require('../game.js').puzzles;
const results = require('./selected-results.json');
const { key } = require('../storage.js');
const root = path.resolve(__dirname, '..');
const accessMode = process.env.ACCESS_LOGGING_MODE || 'success';
assert.ok(['success', 'failure', 'throw'].includes(accessMode));
const expectedAccess = {
  url: 'https://script.google.com/macros/s/AKfycbxssCIHsD-N97SHxNC_GN0ihYeC0qy-lb-EY0KmSs6Gnztaph1sITMerLVEnNWOGkYc/exec?app=knight-tour-puzzle',
  method: 'GET', mode: 'no-cors', cache: 'no-store', credentials: 'omit', keepalive: true
};
const served = new Set(['index.html', 'style.css', 'game.js', 'storage.js', 'app.js']);
const server = http.createServer((request, response) => {
  const name = request.url.replace(/^\/knight-tour-puzzle\//, '').split('?')[0] || 'index.html';
  if (!served.has(name)) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  response.end(fs.readFileSync(path.join(root, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/knight-tour-puzzle/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'knight-browser-test-'));
  const launch = { headless: true, viewport: { width: 390, height: 844 }, hasTouch: true,
    ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}) };
  const errors = [];
  let context;
  let documentLoads = 0;
  let networkRequests = 0;
  const checkAccess = async page => {
    assert.deepEqual(await page.evaluate(() => window.accessTestCalls), [expectedAccess], 'Exactly one access fetch per document with the required options');
  };
  const reload = async page => {
    await page.reload();
    documentLoads++;
    await checkAccess(page);
  };
  const open = async () => {
    context = await chromium.launchPersistentContext(profile, launch);
    // Intercept before navigation: tests never write to the production counter.
    await context.route('https://script.google.com/**', async route => {
      networkRequests++;
      assert.equal(route.request().url(), expectedAccess.url);
      assert.equal(route.request().method(), 'GET');
      if (accessMode === 'failure') await route.abort('failed');
      else await route.fulfill({ status: 204, body: '' });
    });
    await context.addInitScript(mode => {
      const originalFetch = window.fetch.bind(window);
      window.accessTestCalls = [];
      window.fetch = (url, options) => {
        window.accessTestCalls.push({ url: String(url), ...options });
        if (mode === 'throw') throw new Error('Simulated synchronous fetch failure');
        return originalFetch(url, options);
      };
    }, accessMode);
    const page = context.pages()[0];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    documentLoads++;
    await checkAccess(page);
    return page;
  };
  try {
    let page = await open();
    const choose = async id => page.locator(`[data-puzzle="${id}"]`).click();
    const play = async route => { for (const cell of route.slice(1)) await page.locator(`[data-cell="${cell}"]`).tap(); };
    const baseline = process.env.KNIGHT_BASELINE ? JSON.parse(fs.readFileSync(process.env.KNIGHT_BASELINE, 'utf8')) : null;
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (baseline) assert.deepEqual(await page.locator('#board').boundingBox(), baseline[width], 'Puzzle 1 board geometry must not change');
    }
    assert.equal(await page.locator('.cell').count(), 12);
    assert.equal(await page.locator('.current').getAttribute('data-cell'), '0');
    assert.equal(await page.locator('#next').isVisible(), false);
    assert.equal(await page.locator('#closed-rule').isVisible(), false);
    await page.locator('[data-cell="1"]').dispatchEvent('click');
    assert.equal(await page.locator('#count').textContent(), '1');
    await page.locator('.available').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#count').textContent(), '2');
    await page.locator('#undo').click();
    for (const puzzle of puzzles) {
      assert.equal(await page.locator('#puzzle-number').textContent(), `PUZZLE 0${puzzle.id}`);
      assert.equal(await page.locator('.cell').count(), puzzle.total);
      assert.equal(await page.locator('.board-gap').count(), puzzle.blocked.length);
      assert.equal(await page.locator('#closed-rule').isVisible(), puzzle.closed);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow: puzzle ${puzzle.id} at ${width}`);
        const box = await page.locator('.cell').first().boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, 'Touch target too small');
        const board = await page.locator('#board').boundingBox();
        assert.ok(board.height < 600, 'Board must fit in mobile viewport height');
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const result = results.find(row => row.id === puzzle.id);
      // Full but non-closing Puzzle 5 path must stay uncleared and survive reload.
      if (puzzle.closed) {
        await play(result.nonClosingPath);
        assert.match(await page.locator('#status').textContent(), /戻れません/);
        assert.equal(await page.locator('[data-puzzle="5"]').getAttribute('class'), 'puzzle-choice');
        await reload(page);
        assert.equal(await page.locator('#count').textContent(), String(puzzle.total));
        assert.match(await page.locator('#status').textContent(), /戻れません/);
        await page.locator('#undo').click();
        assert.equal(await page.locator('#count').textContent(), String(puzzle.total - 1));
        await page.locator('#restart').click();
      }
      // Every puzzle: dead-end messaging and recovery before replaying its solution.
      await play(result.deadPath);
      assert.match(await page.locator('#status').textContent(), /ひと休み/);
      await page.locator('#undo').click();
      assert.ok(await page.locator('.available').count() > 0);
      await page.locator('#restart').click();
      assert.equal(await page.locator('#count').textContent(), '1');
      assert.equal(await page.locator('#undo').isDisabled(), true);
      await play(result.solution);
      assert.equal(await page.locator('#count').textContent(), String(puzzle.total));
      assert.match(await page.locator('#status').textContent(), /クリア！/);
      assert.match(await page.locator(`[data-puzzle="${puzzle.id}"]`).getAttribute('aria-label'), /クリア済み/);
      await page.locator('#undo').click();
      assert.doesNotMatch(await page.locator('#status').textContent(), /クリア！/);
      assert.equal(await page.locator('#next').isVisible(), false);
      await page.locator(`[data-cell="${result.solution.at(-1)}"]`).tap();
      if (puzzle.id < 5) { assert.equal(await page.locator('#next').isVisible(), true); await page.locator('#next').click(); }
      else assert.equal(await page.locator('#next').isVisible(), false);
      await checkAccess(page);
      console.log(`PASS browser Puzzle ${puzzle.id}: full solution, dead end, undo, restart, responsive layout`);
    }
    assert.equal(await page.locator('#all-clear').isVisible(), true);
    await page.locator('#previous').click();
    assert.equal(await page.locator('#puzzle-number').textContent(), 'PUZZLE 04');
    assert.equal(await page.locator('#count').textContent(), '18');
    await choose(3);
    await page.locator('#restart').click();
    await play(results[2].solution.slice(0, 4));
    await context.close();
    // Reopen a real disk-backed browser profile, not just the same page.
    page = await open();
    assert.equal(await page.locator('#puzzle-number').textContent(), 'PUZZLE 03');
    assert.equal(await page.locator('#count').textContent(), '4');
    assert.equal(await page.locator('.puzzle-choice.cleared').count(), 5);
    await choose(1);
    assert.equal(await page.locator('#count').textContent(), '12');
    await page.locator('#restart').click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'knight-puzzle1.png'), fullPage: true });
    await choose(3); await page.locator('#restart').click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'knight-puzzle3.png'), fullPage: true });
    await choose(5); await page.locator('#restart').click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'knight-puzzle5.png'), fullPage: true });
    await page.evaluate(key => localStorage.setItem(key, '{invalid'), key);
    await reload(page);
    assert.equal(await page.locator('#puzzle-number').textContent(), 'PUZZLE 01');
    assert.equal(await page.locator('#count').textContent(), '1');
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, currentId: 5, cleared: [0, 99, '1'], paths: { 5: [4, 4], 2: [5, 0] } })), key);
    await reload(page);
    assert.equal(await page.locator('#count').textContent(), '1');
    assert.equal(await page.locator('.puzzle-choice.cleared').count(), 0);
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled by browser'); } }));
    await reload(page);
    assert.match(await page.locator('#save-note').textContent(), /保存できません/);
    await page.locator('.available').first().tap();
    assert.equal(await page.locator('#count').textContent(), '2');
    await checkAccess(page);
    assert.equal(networkRequests, accessMode === 'throw' ? 0 : documentLoads, 'Exactly one network request per load, no retries or interaction-triggered requests');
    assert.deepEqual(errors, []);
    console.log(`PASS access logging (${accessMode}): ${documentLoads} document loads, ${networkRequests} requests; no additional fetch on puzzle changes, undo, restart, or clear`);
    console.log('PASS: next/previous/select, browser close/reopen persistence, corrupted storage, storage disabled, keyboard, static subpath hosting, no JS errors');
    if (baseline) console.log('PASS: Puzzle 1 board positions and dimensions exactly match the original at all 4 widths');
  } finally {
    if (context) await context.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
