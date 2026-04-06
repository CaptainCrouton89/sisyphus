import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  globalDir,
  socketPath,
  globalConfigPath,
  daemonLogPath,
  daemonPidPath,
  daemonUpdatingPath,
  projectDir,
  projectConfigPath,
  projectOrchestratorPromptPath,
  sessionsDir,
  sessionDir,
  statePath,
  reportsDir,
  reportFilePath,
  messagesDir,
  promptsDir,
  contextDir,
  roadmapPath,
  goalPath,
  initialPromptPath,
  strategyPath,
  digestPath,
  logsDir,
  cycleLogPath,
  legacyLogsPath,
  snapshotsDir,
  snapshotDir,
  tuiScratchDir,
  tmuxSessionName,
  sessionsManifestPath,
  sessionsManifestTsvPath,
  companionPath,
  historyBaseDir,
  historySessionDir,
  historyEventsPath,
  historySessionSummaryPath,
  isSisyphusSession,
  tmuxSessionDisplayName,
} from '../shared/paths.js';

const HOME = homedir();

// ---------------------------------------------------------------------------
// Global paths
// ---------------------------------------------------------------------------
describe('global paths', () => {
  it('globalDir points to ~/.sisyphus', () => {
    assert.equal(globalDir(), join(HOME, '.sisyphus'));
  });

  it('socketPath is inside globalDir', () => {
    assert.equal(socketPath(), join(HOME, '.sisyphus', 'daemon.sock'));
  });

  it('globalConfigPath is config.json inside globalDir', () => {
    assert.equal(globalConfigPath(), join(HOME, '.sisyphus', 'config.json'));
  });

  it('daemonLogPath is daemon.log inside globalDir', () => {
    assert.equal(daemonLogPath(), join(HOME, '.sisyphus', 'daemon.log'));
  });

  it('daemonPidPath is daemon.pid inside globalDir', () => {
    assert.equal(daemonPidPath(), join(HOME, '.sisyphus', 'daemon.pid'));
  });

  it('daemonUpdatingPath is updating inside globalDir', () => {
    assert.equal(daemonUpdatingPath(), join(HOME, '.sisyphus', 'updating'));
  });

  it('sessionsManifestPath is sessions-manifest.json', () => {
    assert.equal(sessionsManifestPath(), join(HOME, '.sisyphus', 'sessions-manifest.json'));
  });

  it('sessionsManifestTsvPath is sessions-manifest.tsv', () => {
    assert.equal(sessionsManifestTsvPath(), join(HOME, '.sisyphus', 'sessions-manifest.tsv'));
  });

  it('companionPath is companion.json', () => {
    assert.equal(companionPath(), join(HOME, '.sisyphus', 'companion.json'));
  });

  it('historyBaseDir is history inside globalDir', () => {
    assert.equal(historyBaseDir(), join(HOME, '.sisyphus', 'history'));
  });
});

// ---------------------------------------------------------------------------
// Project paths
// ---------------------------------------------------------------------------
describe('project paths', () => {
  const cwd = '/my/project';

  it('projectDir is .sisyphus under cwd', () => {
    assert.equal(projectDir(cwd), join(cwd, '.sisyphus'));
  });

  it('projectConfigPath is config.json under projectDir', () => {
    assert.equal(projectConfigPath(cwd), join(cwd, '.sisyphus', 'config.json'));
  });

  it('projectOrchestratorPromptPath is orchestrator.md under projectDir', () => {
    assert.equal(projectOrchestratorPromptPath(cwd), join(cwd, '.sisyphus', 'orchestrator.md'));
  });
});

// ---------------------------------------------------------------------------
// Session paths
// ---------------------------------------------------------------------------
describe('session paths', () => {
  const cwd = '/my/project';
  const sid = 'abc-123';

  it('sessionsDir is under projectDir', () => {
    assert.equal(sessionsDir(cwd), join(cwd, '.sisyphus', 'sessions'));
  });

  it('sessionDir includes sessionId', () => {
    assert.equal(sessionDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid));
  });

  it('statePath is state.json inside sessionDir', () => {
    assert.equal(statePath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'state.json'));
  });

  it('reportsDir is reports inside sessionDir', () => {
    assert.equal(reportsDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'reports'));
  });

  it('reportFilePath includes agentId and suffix', () => {
    assert.equal(
      reportFilePath(cwd, sid, 'agent-001', 'final'),
      join(cwd, '.sisyphus', 'sessions', sid, 'reports', 'agent-001-final.md'),
    );
  });

  it('messagesDir is messages inside sessionDir', () => {
    assert.equal(messagesDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'messages'));
  });

  it('promptsDir is prompts inside sessionDir', () => {
    assert.equal(promptsDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'prompts'));
  });

  it('contextDir is context inside sessionDir', () => {
    assert.equal(contextDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'context'));
  });

  it('roadmapPath is roadmap.md', () => {
    assert.equal(roadmapPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'roadmap.md'));
  });

  it('goalPath is goal.md', () => {
    assert.equal(goalPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'goal.md'));
  });

  it('initialPromptPath is initial-prompt.md', () => {
    assert.equal(initialPromptPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'initial-prompt.md'));
  });

  it('strategyPath is strategy.md', () => {
    assert.equal(strategyPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'strategy.md'));
  });

  it('digestPath is digest.json', () => {
    assert.equal(digestPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'digest.json'));
  });

  it('logsDir is logs inside sessionDir', () => {
    assert.equal(logsDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'logs'));
  });

  it('cycleLogPath zero-pads cycle number', () => {
    assert.equal(
      cycleLogPath(cwd, sid, 3),
      join(cwd, '.sisyphus', 'sessions', sid, 'logs', 'cycle-003.md'),
    );
    assert.equal(
      cycleLogPath(cwd, sid, 42),
      join(cwd, '.sisyphus', 'sessions', sid, 'logs', 'cycle-042.md'),
    );
  });

  it('legacyLogsPath is logs.md inside sessionDir', () => {
    assert.equal(legacyLogsPath(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'logs.md'));
  });

  it('snapshotsDir is snapshots inside sessionDir', () => {
    assert.equal(snapshotsDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, 'snapshots'));
  });

  it('snapshotDir includes cycle number', () => {
    assert.equal(
      snapshotDir(cwd, sid, 5),
      join(cwd, '.sisyphus', 'sessions', sid, 'snapshots', 'cycle-5'),
    );
  });

  it('tuiScratchDir is .tui inside sessionDir', () => {
    assert.equal(tuiScratchDir(cwd, sid), join(cwd, '.sisyphus', 'sessions', sid, '.tui'));
  });
});

// ---------------------------------------------------------------------------
// History paths
// ---------------------------------------------------------------------------
describe('history paths', () => {
  const sid = 'session-xyz';

  it('historySessionDir is under historyBaseDir', () => {
    assert.equal(historySessionDir(sid), join(HOME, '.sisyphus', 'history', sid));
  });

  it('historyEventsPath is events.jsonl', () => {
    assert.equal(historyEventsPath(sid), join(HOME, '.sisyphus', 'history', sid, 'events.jsonl'));
  });

  it('historySessionSummaryPath is session.json', () => {
    assert.equal(historySessionSummaryPath(sid), join(HOME, '.sisyphus', 'history', sid, 'session.json'));
  });
});

// ---------------------------------------------------------------------------
// tmuxSessionName
// ---------------------------------------------------------------------------
describe('tmuxSessionName', () => {
  it('uses basename of cwd and label with ssyph_ prefix', () => {
    assert.equal(tmuxSessionName('/home/user/myproject', 'task-1'), 'ssyph_myproject_task-1');
  });

  it('handles nested paths correctly', () => {
    assert.equal(tmuxSessionName('/a/b/c/deep-project', 'run'), 'ssyph_deep-project_run');
  });
});

// ---------------------------------------------------------------------------
// isSisyphusSession
// ---------------------------------------------------------------------------
describe('isSisyphusSession', () => {
  it('returns true for ssyph_ prefixed names', () => {
    assert.equal(isSisyphusSession('ssyph_myproject_task'), true);
  });

  it('returns false for non-prefixed names', () => {
    assert.equal(isSisyphusSession('my-session'), false);
    assert.equal(isSisyphusSession(''), false);
  });
});

// ---------------------------------------------------------------------------
// tmuxSessionDisplayName
// ---------------------------------------------------------------------------
describe('tmuxSessionDisplayName', () => {
  it('strips ssyph_ prefix and project name', () => {
    assert.equal(tmuxSessionDisplayName('ssyph_myproject_task-1'), 'task-1');
  });

  it('handles names with underscores in label', () => {
    assert.equal(tmuxSessionDisplayName('ssyph_proj_my_task'), 'my_task');
  });

  it('returns full string when no ssyph_ prefix', () => {
    assert.equal(tmuxSessionDisplayName('other-session'), 'other-session');
  });
});
