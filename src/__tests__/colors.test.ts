import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTmuxColor, getNextColor, resetColors } from '../daemon/colors.js';

describe('normalizeTmuxColor', () => {
  it('maps orange to colour208', () => {
    assert.equal(normalizeTmuxColor('orange'), 'colour208');
  });

  it('maps teal to colour6', () => {
    assert.equal(normalizeTmuxColor('teal'), 'colour6');
  });

  it('passes through standard tmux colors unchanged', () => {
    assert.equal(normalizeTmuxColor('blue'), 'blue');
    assert.equal(normalizeTmuxColor('red'), 'red');
    assert.equal(normalizeTmuxColor('green'), 'green');
    assert.equal(normalizeTmuxColor('cyan'), 'cyan');
  });

  it('passes through unknown colors unchanged', () => {
    assert.equal(normalizeTmuxColor('colour42'), 'colour42');
    assert.equal(normalizeTmuxColor('#ff0000'), '#ff0000');
  });
});

describe('getNextColor', () => {
  const SESSION = 'color-test-session';

  beforeEach(() => {
    resetColors(SESSION);
  });

  it('returns colors from the palette in order', () => {
    const expected = ['blue', 'green', 'magenta', 'cyan', 'red', 'white'];
    for (const color of expected) {
      assert.equal(getNextColor(SESSION), color);
    }
  });

  it('cycles back to the beginning after exhausting palette', () => {
    // Exhaust the 6-color palette
    for (let i = 0; i < 6; i++) {
      getNextColor(SESSION);
    }
    // Should cycle
    assert.equal(getNextColor(SESSION), 'blue');
  });

  it('maintains independent counters per session', () => {
    const s1 = 'session-a';
    const s2 = 'session-b';
    resetColors(s1);
    resetColors(s2);

    assert.equal(getNextColor(s1), 'blue');
    assert.equal(getNextColor(s1), 'green');
    assert.equal(getNextColor(s2), 'blue'); // independent
  });
});

describe('resetColors', () => {
  it('resets color index for a session', () => {
    const SESSION = 'reset-test';
    resetColors(SESSION);

    getNextColor(SESSION); // blue
    getNextColor(SESSION); // green
    resetColors(SESSION);
    assert.equal(getNextColor(SESSION), 'blue'); // starts over
  });
});
