import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatElapsed } from './format.js';

test('ETA remains explicitly approximate', () => {
  assert.equal(formatDuration(0), '~0s');
  assert.equal(formatDuration(59.1), '~1m 0s');
  assert.equal(formatDuration(3661), '~1h 1m');
  assert.equal(formatDuration(null), 'Calculating remaining time…');
  assert.equal(formatDuration(-1), 'Calculating remaining time…');
});

test('completed build duration is shown as measured elapsed time', () => {
  assert.equal(formatElapsed(0), '0s');
  assert.equal(formatElapsed(5.4), '5s');
  assert.equal(formatElapsed(59.6), '1m 00s');
  assert.equal(formatElapsed(248), '4m 08s');
  assert.equal(formatElapsed(3661), '1h 01m');
  assert.equal(formatElapsed(Number.NaN), '—');
  assert.equal(formatElapsed(-1), '—');
});
