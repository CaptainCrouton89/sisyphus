import type { MessageSource, UploadStatus } from './types.js';

export type Request =
  | { type: 'start'; task: string; context?: string; cwd: string; name?: string; effort?: 'low' | 'medium' | 'high' | 'xhigh' }
  | { type: 'spawn'; sessionId: string; agentType: string; name: string; instruction: string; repo?: string }
  | { type: 'submit'; sessionId: string; agentId: string; report: string }
  | { type: 'report'; sessionId: string; agentId: string; content: string }
  | { type: 'yield'; sessionId: string; agentId: string; nextPrompt?: string; mode?: string }
  | { type: 'await'; sessionId: string; agentId: string }
  | { type: 'complete'; sessionId: string; report: string }
  | { type: 'clone'; sessionId: string; goal: string; context?: string; name?: string; strategy?: boolean }
  | { type: 'continue'; sessionId: string }
  | { type: 'status'; sessionId?: string; cwd?: string }
  | { type: 'list'; cwd: string; all?: boolean }
  | { type: 'resume'; sessionId: string; cwd: string; message?: string }
  | { type: 'clear-orphan'; sessionId: string; cwd: string }
  | { type: 'kill'; sessionId: string }
  | { type: 'kill-agent'; sessionId: string; agentId: string }
  | { type: 'restart-agent'; sessionId: string; agentId: string }
  | { type: 'pane-exited'; paneId: string }
  | { type: 'message'; sessionId: string; content: string; source?: MessageSource; agentId?: string }
  | { type: 'tell'; sessionId: string; target: { kind: 'orchestrator' } | { kind: 'agent'; agentId: string }; text: string; submit: boolean; source?: MessageSource }
  | { type: 'update-task'; sessionId: string; task: string }
  | { type: 'set-effort'; sessionId: string; effort: 'low' | 'medium' | 'high' | 'xhigh' }
  | { type: 'set-upload-status'; sessionId: string; cwd: string; status: UploadStatus; storageKey?: string; error?: string }
  | { type: 'rollback'; sessionId: string; cwd: string; toCycle: number }
  | { type: 'delete'; sessionId: string; cwd: string }
  | { type: 'reopen-window'; sessionId: string; cwd: string }
  | { type: 'reconnect'; sessionId: string; cwd: string }
  | { type: 'companion'; name?: string }
  | { type: 'register-segment'; id: string; side: 'left' | 'right'; priority: number; bg: string; content: string }
  | { type: 'update-segment'; id: string; content: string }
  | { type: 'unregister-segment'; id: string }
  | { type: 'ask-generate-visual'; sessionId: string; askId: string; qid: string; cols: number; force?: boolean }
  // Response: { ok: true, data: { items: AggregateInboxItem[] } }
  | { type: 'inbox-list' };

export type Response =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };
