import type { MessageSource } from './types.js';

export type Request =
  | { type: 'start'; task: string; context?: string; cwd: string; name?: string }
  | { type: 'spawn'; sessionId: string; agentType: string; name: string; instruction: string; worktree?: boolean }
  | { type: 'submit'; sessionId: string; agentId: string; report: string }
  | { type: 'report'; sessionId: string; agentId: string; content: string }
  | { type: 'yield'; sessionId: string; agentId: string; nextPrompt?: string; mode?: string }
  | { type: 'complete'; sessionId: string; report: string }
  | { type: 'continue'; sessionId: string }
  | { type: 'status'; sessionId?: string; cwd?: string }
  | { type: 'list'; cwd: string; all?: boolean }
  | { type: 'resume'; sessionId: string; cwd: string; message?: string }
  | { type: 'register_claude_session'; sessionId: string; agentId: string; claudeSessionId: string }
  | { type: 'kill'; sessionId: string }
  | { type: 'kill-agent'; sessionId: string; agentId: string }
  | { type: 'restart-agent'; sessionId: string; agentId: string }
  | { type: 'pane-exited'; paneId: string }
  | { type: 'message'; sessionId: string; content: string; source?: MessageSource }
  | { type: 'update-task'; sessionId: string; task: string }
  | { type: 'rollback'; sessionId: string; cwd: string; toCycle: number }
  | { type: 'delete'; sessionId: string; cwd: string }
  | { type: 'reopen-window'; sessionId: string; cwd: string };

export type Response =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };
