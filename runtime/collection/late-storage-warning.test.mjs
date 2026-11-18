import test from 'node:test';
import assert from 'node:assert/strict';
import { installMenuStartup } from './startup-policy.mjs';

test('autostart acknowledges a late storage warning once and preserves mixed warnings', () => {
  let observeChanges, timer, dialog;
  let starts = 0;
  let acknowledgements = 0;
  const warning = (...names) => ({
    querySelectorAll: () => names.map(name => ({ getAttribute: () => name })),
  });
  const scope = {
    document: {
      documentElement: {},
      getElementById(id) {
        if (id === 'start-btn') return {
          getBoundingClientRect: () => ({ width: 100 }),
          click: () => { starts++; },
        };
        if (id === 'capability-dialog') return dialog;
        if (id === 'capability-continue') return {
          click: () => { acknowledgements++; },
        };
      },
    },
    MutationObserver: class {
      constructor(callback) { observeChanges = callback; }
      observe() {}
    },
    ufrontConfig: { launchState: { ready: true } },
    setInterval(callback) { timer = callback; return 1; },
    clearInterval() {},
  };

  installMenuStartup(scope, []);
  timer();
  assert.equal(starts, 1);
  dialog = warning('indexedDb', 'webgl2');
  observeChanges();
  assert.equal(acknowledgements, 0);

  dialog = warning('indexedDb');
  observeChanges();
  observeChanges();
  assert.equal(acknowledgements, 1);
  assert.equal(scope.__privateStartupPolicy.storageAcknowledgements, 1);
});
