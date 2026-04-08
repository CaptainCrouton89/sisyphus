import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planSendKeys, type PaneState } from '../daemon/tmux.js';

// ---------------------------------------------------------------------------
// planSendKeys: pure decision logic for sendKeys preflight.
//
// Reproduces the failure mode from 2026-04-08: orchestrator respawn hung for
// 30s and emitted "not in a mode" errors because the target pane was wedged
// in copy-mode (user had entered visual selection in a sibling pane). Without
// preflight, sendKeys blindly fires `tmux send-keys` and either (a) hangs on
// a dead pane, or (b) routes characters through the copy-mode key table so
// the underlying shell never sees the command.
// ---------------------------------------------------------------------------

describe('planSendKeys', () => {
  it('aborts when the pane does not exist', () => {
    const state: PaneState = { exists: false, dead: false, inMode: false };
    assert.equal(planSendKeys(state).action, 'abort');
  });

  it('aborts when the pane process is dead', () => {
    const state: PaneState = { exists: true, dead: true, inMode: false };
    assert.equal(planSendKeys(state).action, 'abort');
  });

  it('cancels mode before sending when pane is in copy-mode', () => {
    const state: PaneState = { exists: true, dead: false, inMode: true };
    assert.equal(planSendKeys(state).action, 'cancel-then-send');
  });

  it('sends directly when the pane is alive and not in a mode', () => {
    const state: PaneState = { exists: true, dead: false, inMode: false };
    assert.equal(planSendKeys(state).action, 'send');
  });

  it('treats dead-but-in-mode as abort (dead wins)', () => {
    // Defensive: if tmux ever reports both, the pane is unusable.
    const state: PaneState = { exists: true, dead: true, inMode: true };
    assert.equal(planSendKeys(state).action, 'abort');
  });
});
