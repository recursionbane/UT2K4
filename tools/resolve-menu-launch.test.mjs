import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMenuLaunch } from './resolve-menu-launch.mjs';

test('sealed launch keeps the lightweight native menu bootstrap and mount', () => {
  const query = '?map=NoIntro&Mutator=MenuProfile.MenuProfileBootstrap';
  for (const prefix of ['/ut2004/', '/v/ut2004/']) {
    assert.equal(resolveMenuLaunch({ launch: prefix + query }), '/v/ut2004/' + query);
  }
  for (const launch of ['//different.invalid/ut2004/' + query,
    '/ut2004/' + query + '&Game=xGame.xDeathMatch', '/ut2004/?map=DM-Rankin']) {
    assert.throws(() => resolveMenuLaunch({ launch }));
  }
});
