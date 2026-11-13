#!/usr/bin/env node
/* Read-only browser QA for the exact local Unreal Collection mirror.
 * npm install playwright, or set PLAYWRIGHT_MODULE to an installed package.
 * node tools/test-collection-browser.cjs --url http://127.0.0.1:8789/ut2004/
 * Uses ordinary Start/canvas/mouse/W/Space inputs. No game-state injection.
 * The final screenshot requires visual review to confirm the owned-pawn HUD.
 */
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const args = process.argv.slice(2);
function option(name, fallback) {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
}
if (args.includes('--help')) {
  console.log(
    'test-collection-browser.cjs [--url URL] [--output DIRECTORY] [--timeout-ms 240000] [--chrome EXECUTABLE] [--catalog PINNED_CATALOG] [--headed] [--no-metal]',
  );
  process.exit(0);
}
let pw;
for (const name of [
  process.env.PLAYWRIGHT_MODULE,
  'playwright',
  '/usr/local/lib/node_modules/playwright',
].filter(Boolean)) {
  try {
    pw = require(name);
    break;
  } catch {}
}
if (!pw) throw Error('Install playwright or set PLAYWRIGHT_MODULE.');
const target = new URL(option('--url', 'http://127.0.0.1:8789/ut2004/'));
if (!target.searchParams.has('map'))
  target.searchParams.set('map', 'DM-Rankin');
if (!target.searchParams.has('game'))
  target.searchParams.set('game', 'XGame.xDeathMatch');
if (!target.searchParams.has('NumBots'))
  target.searchParams.set('NumBots', '3');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
  throw Error('This offline QA tool requires a loopback mirror URL.');
const output = path.resolve(
    option(
      '--output',
      path.join(os.tmpdir(), 'ut2k4-collection-qa-' + Date.now()),
    ),
  ),
  timeout = Number(option('--timeout-ms', '240000'));
fs.mkdirSync(output, { recursive: true });
(async () => {
  const chrome = option(
    '--chrome',
    process.env.CHROME_PATH ||
      (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined),
  );
  // The dead proxy is defense in depth for worker/WebSocket requests, which old
  // Playwright versions may not route. Only loopback bypasses it. Non-proxied
  // WebRTC UDP is also disabled. Context routing enforces the exact origin.
  const flags = [
    '--proxy-server=http://127.0.0.1:9',
    '--proxy-bypass-list=127.0.0.1;localhost;[::1]',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];
  if (process.platform === 'darwin' && !args.includes('--no-metal'))
    flags.push('--use-angle=metal');
  const browser = await pw.chromium.launch({
    headless: !args.includes('--headed'),
    ...(chrome ? { executablePath: chrome } : {}),
    args: flags,
  });
  const browserCDP = await browser.newBrowserCDPSession();
  const gpu = await browserCDP
    .send('SystemInfo.getInfo')
    .then((info) => ({
      renderer: info.gpu?.auxAttributes?.glRenderer,
      vendor: info.gpu?.auxAttributes?.glVendor,
      devices: info.gpu?.devices,
    }))
    .catch(() => null);
  const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    blocked = [],
    failures = [],
    httpErrors = [],
    pageErrors = [],
    csp = [],
    socketAttempts = [],
    actions = [],
    timeline = [],
    statuses = [];
  let networkBytes = 0,
    responses = 0,
    mapLoadedAt,
    firstReadyAt,
    startClicked = false;
  const started = Date.now(),
    elapsed = () => Date.now() - started;
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      url.origin !== target.origin
    ) {
      blocked.push({
        ms: elapsed(),
        url: url.href,
        type: request.resourceType(),
      });
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e) => {
    networkBytes += e.encodedDataLength;
    responses++;
  });
  context.on('response', (response) => {
    if (response.status() >= 400) {
      const failure = {
        ms: elapsed(),
        status: response.status(),
        url: response.url(),
      };
      httpErrors.push(failure);
      console.log('HTTP_ERROR', JSON.stringify(failure));
    }
  });
  context.on('requestfailed', (r) =>
    failures.push({
      ms: elapsed(),
      url: r.url(),
      error: r.failure()?.errorText,
    }),
  );
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('websocket', (socket) =>
    socketAttempts.push({ ms: elapsed(), url: socket.url() }),
  );
  page.on('console', (message) => {
    const text = message.text();
    fs.appendFileSync(
      path.join(output, 'console.log'),
      `[${elapsed()} ms] ${text}\n`,
    );
    if (
      /content.security.policy|violates.*directive|refused to connect|connect-src/i.test(
        text,
      )
    )
      csp.push(text);
    if (mapLoadedAt === undefined && /Bringing Level DM-Rankin\./i.test(text)) {
      mapLoadedAt = elapsed();
      timeline.push({ phase: 'rankin-native-map-load', ms: mapLoadedAt });
    }
  });
  let completed = false,
    error;
  try {
    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.screenshot({ path: path.join(output, 'first-visit.png') });
    while (elapsed() < timeout && mapLoadedAt === undefined) {
      await page.waitForTimeout(1000);
      const text = (await page.locator('body').innerText()).slice(0, 1800);
      if (firstReadyAt === undefined && /\bReady\b/.test(text)) {
        firstReadyAt = elapsed();
        timeline.push({ phase: 'shell-ready', ms: firstReadyAt });
      }
      if (!startClicked) {
        const button = page
          .getByRole('button', { name: /^Start (to menu|in )/ })
          .first();
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          startClicked = true;
          actions.push({ action: 'normal-start-button', ms: elapsed() });
        }
      }
      if (!statuses.length || elapsed() - statuses.at(-1).ms > 10000) {
        const status = {
          ms: elapsed(),
          url: page.url(),
          bytes: networkBytes,
          text,
        };
        statuses.push(status);
        console.log(JSON.stringify(status));
      }
    }
    if (mapLoadedAt === undefined)
      throw Error('Timed out before native DM-Rankin map load.');
    async function assertNoDownloadFailure() {
      const dialog = page.locator('#download-failure');
      if (await dialog.isVisible().catch(() => false))
        throw Error('Native download failure: ' + (await dialog.innerText()));
    }
    // Match countdown and the initial texture/geometry upload can outlive LoadMap.
    await page.waitForTimeout(12000);
    await assertNoDownloadFailure();
    await page.screenshot({ path: path.join(output, 'before-join.png') });
    const canvas = page.locator('canvas').first();
    await canvas.click({ force: true });
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(6500);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await assertNoDownloadFailure();
    await page.screenshot({ path: path.join(output, 'after-join.png') });
    actions.push({
      action: 'canvas-focus-and-fire-join-with-countdown-retry',
      ms: elapsed(),
    });
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    actions.push({ action: 'W-held-900ms', ms: elapsed() });
    await page.keyboard.down('Space');
    await page.waitForTimeout(150);
    await page.keyboard.up('Space');
    actions.push({ action: 'Space-held-150ms', ms: elapsed() });
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    actions.push({ action: 'fire-held-300ms', ms: elapsed() });
    await page.waitForTimeout(1200);
    await assertNoDownloadFailure();
    await page.screenshot({ path: path.join(output, 'after-inputs.png') });
    completed = true;
  } catch (e) {
    error = String(e);
    await page
      .screenshot({ path: path.join(output, 'failure.png') })
      .catch(() => {});
  }
  const servedShellHashes = [];
  const catalogPath = option(
    '--catalog',
    path.resolve(__dirname, '../.local-runtime/collection/catalog.json'),
  );
  if (fs.existsSync(catalogPath)) {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).files;
    const selected = [
      'index.html',
      'SDLLaunch.js',
      'SDLLaunch.wasm',
      Object.keys(catalog).find((name) =>
        /^assets\/index-[^/]+\.js$/.test(name),
      ),
    ].filter(Boolean);
    for (const file of selected) {
      const response = await page.request.get(new URL(file, target).href);
      const actual = crypto
        .createHash('sha256')
        .update(await response.body())
        .digest('hex');
      const expected = catalog[file]?.sha256;
      servedShellHashes.push({
        file,
        expected,
        actual,
        matches: actual === expected,
      });
    }
    if (servedShellHashes.some((entry) => !entry.matches)) {
      completed = false;
      error = 'Served shell differs from pinned Collection catalog';
    }
  }
  const documentResponse = await page.request
    .get(target.href)
    .catch(() => null);
  const evidence = {
    target: target.href,
    origin: target.origin,
    freshContext: true,
    noExistingFiles: true,
    gpu,
    externalNetworkPolicy:
      'Exact-origin HTTP routing; dead proxy for non-loopback worker/WebSocket requests; non-proxied WebRTC UDP disabled',
    completed,
    servedShellHashes,
    controlledPawnNeedsVisualReview: true,
    elapsedMs: elapsed(),
    mapLoadedAt,
    firstReadyAt,
    networkBytes,
    pageCDPByteScope: 'Page target only; worker transfers may be omitted',
    responses,
    actions,
    timeline,
    statuses,
    blockedExternalRequests: blocked,
    webSocketAttempts: socketAttempts,
    requestFailures: failures,
    httpErrors,
    pageErrors,
    cspMessages: csp,
    documentSecurityHeaders: documentResponse
      ? Object.fromEntries(
          Object.entries(documentResponse.headers()).filter(([key]) =>
            /content-security-policy|cross-origin|x-frame-options/.test(key),
          ),
        )
      : null,
    error,
    screenshots: [
      'first-visit.png',
      'before-join.png',
      'after-join.png',
      'after-inputs.png',
    ].map((file) => path.join(output, file)),
  };
  fs.writeFileSync(
    path.join(output, 'proof.json'),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    'RESULT',
    JSON.stringify({
      output,
      completed,
      elapsedMs: evidence.elapsedMs,
      mapLoadedAt,
      networkBytes,
      blocked: blocked.length,
      cspMessages: csp.length,
      pageErrors,
      error,
    }),
  );
  await browser.close();
  if (!completed) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
