import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, checkForUpdate, getCurrentVersion } from '../daemon/updater.js';

describe('isNewer', () => {
  it('detects newer major', () => {
    assert.equal(isNewer('2.0.0', '1.0.0'), true);
  });

  it('detects newer minor', () => {
    assert.equal(isNewer('1.2.0', '1.1.0'), true);
  });

  it('detects newer patch', () => {
    assert.equal(isNewer('1.1.2', '1.1.1'), true);
  });

  it('returns false for same version', () => {
    assert.equal(isNewer('1.1.1', '1.1.1'), false);
  });

  it('returns false for older version', () => {
    assert.equal(isNewer('1.0.0', '1.1.0'), false);
  });

  it('handles mismatched segment counts', () => {
    assert.equal(isNewer('1.1.0.1', '1.1.0'), true);
    assert.equal(isNewer('1.1.0', '1.1.0.1'), false);
  });
});

describe('getCurrentVersion', () => {
  it('reads version from package.json', () => {
    const version = getCurrentVersion();
    assert.match(version, /^\d+\.\d+\.\d+$/);
  });
});

describe('checkForUpdate', () => {
  it('returns null or update object (live registry hit)', async () => {
    const result = await checkForUpdate();
    // Either null (we're up to date) or an object with current/latest
    if (result !== null) {
      assert.ok(result.current);
      assert.ok(result.latest);
      assert.equal(isNewer(result.latest, result.current), true);
    }
  });
});
