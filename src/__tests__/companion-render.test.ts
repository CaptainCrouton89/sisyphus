import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getBaseForm,
  getMoodFace,
  getStatCosmetics,
  getBoulderForm,
  composeLine,
  renderCompanion,
} from '../shared/companion-render.js';
import { createDefaultCompanion } from '../daemon/companion.js';
import type { CompanionState } from '../shared/companion-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompanion(overrides: Partial<CompanionState> = {}): CompanionState {
  return { ...createDefaultCompanion(), ...overrides };
}

// ---------------------------------------------------------------------------
// getBaseForm
// ---------------------------------------------------------------------------

describe('getBaseForm', () => {
  it('all forms contain FACE placeholder', () => {
    for (const level of [1, 3, 5, 8, 12, 15, 20, 30]) {
      const form = getBaseForm(level);
      assert.ok(form.includes('FACE'), `Expected FACE in level ${level} form "${form}"`);
    }
  });

  it('all forms contain {BOULDER} placeholder (no literal boulder chars)', () => {
    for (const level of [1, 3, 5, 8, 12, 15, 20, 30]) {
      const form = getBaseForm(level);
      assert.ok(form.includes('{BOULDER}'), `Expected {BOULDER} in level ${level} form "${form}"`);
    }
  });

  it('level 1 → base form with no arms', () => {
    assert.equal(getBaseForm(1), '(FACE) {BOULDER}');
  });

  it('level 2 → same form as level 1', () => {
    assert.equal(getBaseForm(2), getBaseForm(1));
  });

  it('level 3 → arm suffix form', () => {
    assert.equal(getBaseForm(3), '(FACE)/ {BOULDER}');
  });

  it('level 8 → backslash arm form', () => {
    assert.equal(getBaseForm(8), '\\(FACE)/ {BOULDER}');
  });

  it('level 12 → flexing arm form (was buggy — OO mismatch)', () => {
    assert.equal(getBaseForm(12), 'ᕦ(FACE)ᕤ {BOULDER}');
  });

  it('level 15 → same flexing arm form as 12', () => {
    assert.equal(getBaseForm(15), getBaseForm(12));
  });

  it('level 20 → crowned ascended form', () => {
    const form = getBaseForm(20);
    assert.ok(form.includes('♛'), `Expected ♛ in "${form}"`);
    assert.ok(form.includes('ᕦ'), `Expected ᕦ in "${form}"`);
    assert.ok(!form.includes('@'), `Must not embed literal @ in "${form}"`);
  });

  it('level 30 → same form as level 20', () => {
    assert.equal(getBaseForm(30), getBaseForm(20));
  });
});

// ---------------------------------------------------------------------------
// getMoodFace
// ---------------------------------------------------------------------------

describe('getMoodFace', () => {
  // Mild intensity (score < 30, default)
  it('happy mild → "^.^"',       () => assert.equal(getMoodFace('happy'), '^.^'));
  it('grinding mild → ">.<"',    () => assert.equal(getMoodFace('grinding', 10), '>.<'));
  it('frustrated mild → ">.<#"', () => assert.equal(getMoodFace('frustrated', 29), '>.<#'));
  it('zen mild → "‾.‾"',         () => assert.equal(getMoodFace('zen'), '‾.‾'));
  it('sleepy mild → "-.-)zzZ"',  () => assert.equal(getMoodFace('sleepy', 0), '-.-)zzZ'));
  it('excited mild → "*o*"',     () => assert.equal(getMoodFace('excited', 15), '*o*'));
  it('existential mild → "◉_◉"', () => assert.equal(getMoodFace('existential'), '◉_◉'));

  // Moderate intensity (score 30–70)
  it('happy moderate → "^‿^"',       () => assert.equal(getMoodFace('happy', 30), '^‿^'));
  it('grinding moderate → ">_<"',    () => assert.equal(getMoodFace('grinding', 45), '>_<'));
  it('frustrated moderate → "ಠ_ಠ"',  () => assert.equal(getMoodFace('frustrated', 70), 'ಠ_ಠ'));
  it('zen moderate → "‾‿‾"',         () => assert.equal(getMoodFace('zen', 40), '‾‿‾'));
  it('sleepy moderate → "-_-)zzZ"',  () => assert.equal(getMoodFace('sleepy', 50), '-_-)zzZ'));
  it('excited moderate → "*◡*"',     () => assert.equal(getMoodFace('excited', 35), '*◡*'));
  it('existential moderate → "⊙_⊙"', () => assert.equal(getMoodFace('existential', 55), '⊙_⊙'));

  // Intense (score > 70)
  it('happy intense → "✧‿✧"',       () => assert.equal(getMoodFace('happy', 71), '✧‿✧'));
  it('grinding intense → "ò.ó"',    () => assert.equal(getMoodFace('grinding', 80), 'ò.ó'));
  it('frustrated intense → "ಠ益ಠ"',  () => assert.equal(getMoodFace('frustrated', 105), 'ಠ益ಠ'));
  it('zen intense → "˘‿˘"',         () => assert.equal(getMoodFace('zen', 75), '˘‿˘'));
  it('sleepy intense → "˘.˘)zzZ"',  () => assert.equal(getMoodFace('sleepy', 71), '˘.˘)zzZ'));
  it('excited intense → "✦◡✦"',     () => assert.equal(getMoodFace('excited', 90), '✦◡✦'));
  it('existential intense → "◉‸◉"', () => assert.equal(getMoodFace('existential', 100), '◉‸◉'));

  it('unknown mood throws', () => {
    assert.throws(() => getMoodFace('unknown' as never), /Unknown mood/);
  });
});

// ---------------------------------------------------------------------------
// getStatCosmetics
// ---------------------------------------------------------------------------

describe('getStatCosmetics', () => {
  it('returns empty for all-zero stats', () => {
    assert.deepEqual(
      getStatCosmetics({ strength: 0, endurance: 0, wisdom: 0, patience: 0 }),
      [],
    );
  });

  it('wisdom > 5 → includes "wisps"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 0, wisdom: 6, patience: 0 });
    assert.ok(cs.includes('wisps'), `Got ${JSON.stringify(cs)}`);
  });

  it('wisdom exactly 5 → does NOT include "wisps"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 0, wisdom: 5, patience: 0 });
    assert.ok(!cs.includes('wisps'));
  });

  it('endurance > 36_000_000 → includes "trail"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 36_000_001, wisdom: 0, patience: 0 });
    assert.ok(cs.includes('trail'), `Got ${JSON.stringify(cs)}`);
  });

  it('endurance exactly 36_000_000 → does NOT include "trail"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 36_000_000, wisdom: 0, patience: 0 });
    assert.ok(!cs.includes('trail'));
  });

  it('patience > 50 → includes "zen-prefix"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 0, wisdom: 0, patience: 51 });
    assert.ok(cs.includes('zen-prefix'), `Got ${JSON.stringify(cs)}`);
  });

  it('patience exactly 50 → does NOT include "zen-prefix"', () => {
    const cs = getStatCosmetics({ strength: 0, endurance: 0, wisdom: 0, patience: 50 });
    assert.ok(!cs.includes('zen-prefix'));
  });

  it('multiple high stats → all cosmetics present', () => {
    const cs = getStatCosmetics({
      strength: 0,
      endurance: 36_000_001,
      wisdom: 6,
      patience: 51,
    });
    assert.ok(cs.includes('wisps'));
    assert.ok(cs.includes('trail'));
    assert.ok(cs.includes('zen-prefix'));
  });
});

// ---------------------------------------------------------------------------
// getBoulderForm
// ---------------------------------------------------------------------------

describe('getBoulderForm', () => {
  it('agentCount undefined → "."', () => assert.equal(getBoulderForm(), '.'));
  it('agentCount 0 → "."',        () => assert.equal(getBoulderForm(0), '.'));
  it('agentCount 1 → "o"',        () => assert.equal(getBoulderForm(1), 'o'));
  it('agentCount 2 → "O"',        () => assert.equal(getBoulderForm(2), 'O'));
  it('agentCount 4 → "O"',        () => assert.equal(getBoulderForm(4), 'O'));
  it('agentCount 5 → "◉"',        () => assert.equal(getBoulderForm(5), '◉'));
  it('agentCount 9 → "◉"',        () => assert.equal(getBoulderForm(9), '◉'));
  it('agentCount 10 → "@"',       () => assert.equal(getBoulderForm(10), '@'));
  it('agentCount 20 → "@"',       () => assert.equal(getBoulderForm(20), '@'));
  it('agentCount 21 → "@@"',      () => assert.equal(getBoulderForm(21), '@@'));
  it('agentCount 50 → "@@"',      () => assert.equal(getBoulderForm(50), '@@'));

  it('with nickname → includes quoted nickname', () => {
    const form = getBoulderForm(0, 'myrepo');
    assert.ok(form.includes('"myrepo"'), `Expected quoted nickname in "${form}"`);
  });

  it('with nickname, larger boulder still starts with boulder char', () => {
    const form = getBoulderForm(10, 'big-project');
    assert.ok(form.startsWith('@'), `Expected @ prefix in "${form}"`);
    assert.ok(form.includes('"big-project"'));
  });
});

// ---------------------------------------------------------------------------
// composeLine
// ---------------------------------------------------------------------------

describe('composeLine', () => {
  it('no cosmetics → substitutes {BOULDER} placeholder', () => {
    assert.equal(composeLine('(^.^) {BOULDER}', [], '.'), '(^.^) .');
  });

  it('wisps wraps boulder with ~', () => {
    const result = composeLine('(^.^) {BOULDER}', ['wisps'], '.');
    assert.ok(result.includes('~.~'), `Expected ~.~ in "${result}"`);
    assert.equal(result, '(^.^) ~.~');
  });

  it('trail appends " ..." after boulder', () => {
    const result = composeLine('(^.^) {BOULDER}', ['trail'], '.');
    assert.equal(result, '(^.^) . ...');
  });

  it('zen-prefix prepends "☯ "', () => {
    const result = composeLine('(^.^) {BOULDER}', ['zen-prefix'], '.');
    assert.ok(result.startsWith('☯ '), `Expected "☯ " prefix in "${result}"`);
  });

  it('multiple cosmetics (wisps + trail) both applied', () => {
    const result = composeLine('(^.^) {BOULDER}', ['wisps', 'trail'], '.');
    assert.equal(result, '(^.^) ~.~ ...');
  });

  it('multi-char boulder (@ from 10+ agents) correctly substituted', () => {
    const result = composeLine('ᕦ(^.^)ᕤ {BOULDER}', [], '@');
    assert.equal(result, 'ᕦ(^.^)ᕤ @');
  });

  it('boulder with nickname substituted in full', () => {
    const result = composeLine('ᕦ(^.^)ᕤ {BOULDER}', [], '. "myrepo"');
    assert.equal(result, 'ᕦ(^.^)ᕤ . "myrepo"');
  });
});

// ---------------------------------------------------------------------------
// renderCompanion
// ---------------------------------------------------------------------------

describe('renderCompanion', () => {
  it('renders without error and returns non-empty string', () => {
    const result = renderCompanion(createDefaultCompanion(), ['face', 'level', 'title']);
    assert.ok(typeof result === 'string' && result.length > 0);
  });

  it('field mask ["face"] renders mood face characters', () => {
    const c = createDefaultCompanion(); // mood: 'sleepy'
    const result = renderCompanion(c, ['face']);
    // getMoodFace('sleepy') = '-.-)zzZ', embedded in base form
    assert.ok(result.includes('-.-)zzZ'), `Expected sleepy face in "${result}"`);
  });

  it('field mask ["level", "title"] renders level and title', () => {
    const c = createDefaultCompanion();
    const result = renderCompanion(c, ['level', 'title']);
    assert.ok(result.includes('Lv 1'), `Expected "Lv 1" in "${result}"`);
    assert.ok(result.includes('Boulder Intern'), `Expected title in "${result}"`);
  });

  it('field mask ["mood"] renders bracketed mood', () => {
    const c = makeCompanion({ mood: 'happy' });
    const result = renderCompanion(c, ['mood']);
    assert.equal(result, '[happy]');
  });

  it('field mask ["stats"] renders stat summary with STR:', () => {
    const result = renderCompanion(createDefaultCompanion(), ['stats']);
    assert.ok(result.includes('STR:'), `Expected STR: in "${result}"`);
  });

  it('field mask ["achievements"] renders count', () => {
    const result = renderCompanion(createDefaultCompanion(), ['achievements']);
    assert.ok(result.includes('0 achievements'), `Expected "0 achievements" in "${result}"`);
  });

  it('field mask ["commentary"] renders lastCommentary text', () => {
    const c = makeCompanion({
      lastCommentary: { text: 'hello world', event: 'session-complete', timestamp: new Date().toISOString() },
    });
    const result = renderCompanion(c, ['commentary']);
    assert.ok(result.includes('hello world'), `Expected commentary in "${result}"`);
  });

  it('maxWidth truncates output to at most maxWidth chars', () => {
    const c = makeCompanion({
      lastCommentary: {
        text: 'A'.repeat(100),
        event: 'session-complete',
        timestamp: new Date().toISOString(),
      },
    });
    const result = renderCompanion(c, ['face', 'commentary'], { maxWidth: 50 });
    assert.ok(result.length <= 50, `Expected length <= 50, got ${result.length}: "${result}"`);
  });

  it('maxWidth: result shorter than full when commentary is truncated', () => {
    const c = makeCompanion({
      lastCommentary: {
        text: 'A'.repeat(100),
        event: 'session-complete',
        timestamp: new Date().toISOString(),
      },
    });
    const full = renderCompanion(c, ['face', 'commentary']);
    const truncated = renderCompanion(c, ['face', 'commentary'], { maxWidth: 50 });
    assert.ok(truncated.length < full.length, 'Truncated should be shorter than full');
  });

  it('color: true wraps face in ANSI escape codes', () => {
    const c = makeCompanion({ mood: 'happy' });
    const result = renderCompanion(c, ['face'], { color: true });
    assert.ok(result.includes('\x1b['), `Expected ANSI code in result`);
  });

  it('tmuxFormat: true uses #[fg=...] format', () => {
    const c = makeCompanion({ mood: 'happy' });
    const result = renderCompanion(c, ['face'], { tmuxFormat: true });
    assert.ok(result.includes('#[fg='), `Expected tmux format in result`);
  });

  it('no color by default (no ANSI codes)', () => {
    const result = renderCompanion(createDefaultCompanion(), ['face', 'level']);
    assert.ok(!result.includes('\x1b['), 'Expected no ANSI codes by default');
    assert.ok(!result.includes('#[fg='), 'Expected no tmux codes by default');
  });

  it('boulder field without face renders boulder standalone', () => {
    const result = renderCompanion(createDefaultCompanion(), ['boulder']);
    assert.ok(result.length > 0 && !result.includes('FACE'));
  });

  it('repoPath with known nickname includes nickname in boulder', () => {
    const c = makeCompanion({
      repos: {
        '/my/repo': {
          visits: 1, completions: 0, crashes: 0, totalActiveMs: 0, moodAvg: 0,
          nickname: 'cool-proj', firstSeen: '', lastSeen: '',
        },
      },
    });
    const result = renderCompanion(c, ['face'], { repoPath: '/my/repo' });
    assert.ok(result.includes('"cool-proj"'), `Expected nickname in "${result}"`);
  });

  // --- Cross-level / boulder regression tests (HIGH bug #1) ---
  // Previously getBaseForm embedded literal boulders (OO at 12-19, @ at 20+).
  // splitBodyAndBoulder discarded them via lastIndexOf, which worked by accident
  // but broke when dynamic boulder didn't match. These tests lock in correct
  // {BOULDER} substitution at every level tier.

  it('level 15, 0 agents → flexing body with small boulder .', () => {
    const c = makeCompanion({ level: 15, mood: 'happy' });
    const result = renderCompanion(c, ['face'], { agentCount: 0 });
    assert.ok(result.includes('ᕦ'), `Expected flex body at level 15: "${result}"`);
    assert.ok(result.includes('.'), `Expected small boulder at 0 agents: "${result}"`);
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });

  it('level 15, 1 agent → flexing body with o boulder', () => {
    const c = makeCompanion({ level: 15, mood: 'happy' });
    const result = renderCompanion(c, ['face'], { agentCount: 1 });
    assert.ok(result.includes('ᕦ'), `Expected flex body at level 15: "${result}"`);
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });

  it('level 15, 6 agents with wisps cosmetic → boulder wrapped in ~', () => {
    // wisdom > 5 triggers wisps cosmetic
    const c = makeCompanion({
      level: 15,
      mood: 'happy',
      stats: { strength: 0, endurance: 0, wisdom: 6, patience: 0 },
    });
    const result = renderCompanion(c, ['face'], { agentCount: 6 });
    assert.ok(result.includes('ᕦ'), `Expected flex body: "${result}"`);
    assert.ok(result.includes('~'), `Expected wisps ~ wrapping in "${result}"`);
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });

  it('level 20, 0 agents → flexing body with . (not embedded @)', () => {
    const c = makeCompanion({ level: 20, mood: 'happy' });
    const result = renderCompanion(c, ['face'], { agentCount: 0 });
    assert.ok(result.includes('ᕦ'), `Expected flex body at level 20: "${result}"`);
    assert.ok(result.includes('.'), `Expected small boulder at 0 agents: "${result}"`);
    // The old bug: level 20 getBaseForm returned 'ᕦ(FACE)ᕤ @' — if agentCount=0
    // gives boulder='.', splitBodyAndBoulder would discard '@' and output '.' correctly
    // by accident. With placeholder design this is explicitly correct.
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });

  it('level 20, 10+ agents → large @ boulder substituted', () => {
    const c = makeCompanion({ level: 20, mood: 'happy' });
    const result = renderCompanion(c, ['face'], { agentCount: 10 });
    assert.ok(result.includes('ᕦ'), `Expected flex body at level 20: "${result}"`);
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });

  it('level 5, 0 agents → arm body with small boulder', () => {
    const c = makeCompanion({ level: 5, mood: 'happy' });
    const result = renderCompanion(c, ['face'], { agentCount: 0 });
    assert.ok(result.includes('/'), `Expected arm at level 5: "${result}"`);
    assert.ok(!result.includes('{BOULDER}'), `Placeholder must not appear in output: "${result}"`);
  });
});
