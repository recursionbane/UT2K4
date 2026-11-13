// Exercise the fresh-visitor and blocked-storage paths without requiring browser storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(
  path.join(__dirname, '../delivery/launch.js'),
  'utf8',
);

async function checkFreshVisit(storageAvailable) {
  const elements = new Map();
  const navigations = [];
  const page = new URL('https://recursionbane.github.io/UT2K4/');
  page.assign = page.replace = (url) => navigations.push(url);
  const document = {
    getElementById(id) {
      if (!elements.has(id))
        elements.set(id, { href: 'https://unrealcollection.games/ut2004/' });
      return elements.get(id);
    },
  };
  await vm.runInNewContext(source, {
    document,
    location: page,
    URL,
    URLSearchParams,
    nativeClientReady: async () => {
      if (!storageAvailable) throw Error('Storage unavailable');
      return false;
    },
    mediaGet: async () => null,
  });
  assert.deepEqual(navigations, []);
  assert.match(elements.get('boot-status').textContent, /Mac|storage/);
}
(async () => {
  await checkFreshVisit(true);
  await checkFreshVisit(false);
  console.log(
    'Fresh visits stay on the deployment with and without browser storage.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
