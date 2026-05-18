import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cwdFromDir, sessionIdFromDir, askIdFromDir } from '../shared/inbox-types.js';
import { askEntryDir } from '../shared/paths.js';

describe('inbox dir coordinate derivation', () => {
  const cwd = '/Users/x/proj';
  const sessionId = '4792653e-bfde-45fe-870d-c9c869001f6b';
  const askId = '01KRTJW4DRS277J4Z29TKRGAX7';
  // The exact dir scanInbox yields: <cwd>/.sisyphus/sessions/<sid>/context/ask/<askId>
  const dir = askEntryDir(cwd, sessionId, askId);

  it('round-trips cwd (regression: cwdFromDir was off by one dirname)', () => {
    assert.equal(cwdFromDir(dir), cwd);
  });

  it('round-trips sessionId', () => {
    assert.equal(sessionIdFromDir(dir), sessionId);
  });

  it('round-trips askId', () => {
    assert.equal(askIdFromDir(dir), askId);
  });
});
