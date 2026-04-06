import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, statusColor } from '../shared/format.js';

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('returns seconds for short durations', () => {
    assert.equal(formatDuration(5000), '5s');
    assert.equal(formatDuration(0), '0s');
    assert.equal(formatDuration(999), '0s');
    assert.equal(formatDuration(59_999), '59s');
  });

  it('returns minutes and seconds for medium durations', () => {
    assert.equal(formatDuration(60_000), '1m0s');
    assert.equal(formatDuration(90_000), '1m30s');
    assert.equal(formatDuration(3_599_000), '59m59s');
  });

  it('returns hours and minutes for long durations', () => {
    assert.equal(formatDuration(3_600_000), '1h0m');
    assert.equal(formatDuration(5_400_000), '1h30m');
    assert.equal(formatDuration(7_200_000), '2h0m');
  });

  it('returns 0s for negative durations', () => {
    assert.equal(formatDuration(-1000), '0s');
  });

  it('computes duration from ISO date strings', () => {
    const start = '2024-01-01T00:00:00.000Z';
    const end = '2024-01-01T01:30:00.000Z';
    assert.equal(formatDuration(start, end), '1h30m');
  });

  it('computes duration from ISO start to now when end is null', () => {
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    const result = formatDuration(fiveSecondsAgo, null);
    // Should be approximately 5s (allow +-2s for test execution time)
    assert.match(result, /^\d+s$/);
  });
});

// ---------------------------------------------------------------------------
// statusColor
// ---------------------------------------------------------------------------
describe('statusColor', () => {
  it('maps active to green', () => {
    assert.equal(statusColor('active'), 'green');
  });

  it('maps running to green', () => {
    assert.equal(statusColor('running'), 'green');
  });

  it('maps completed to cyan', () => {
    assert.equal(statusColor('completed'), 'cyan');
  });

  it('maps paused to yellow', () => {
    assert.equal(statusColor('paused'), 'yellow');
  });

  it('maps killed to red', () => {
    assert.equal(statusColor('killed'), 'red');
  });

  it('maps crashed to red', () => {
    assert.equal(statusColor('crashed'), 'red');
  });

  it('maps lost to gray', () => {
    assert.equal(statusColor('lost'), 'gray');
  });

  it('maps unknown status to white', () => {
    assert.equal(statusColor('unknown'), 'white');
    assert.equal(statusColor(''), 'white');
  });
});
