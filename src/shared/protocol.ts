export type Request =
  | { type: 'start'; task: string; cwd: string; tmuxSession: string; tmuxWindow: string }
  | { type: 'spawn'; sessionId: string; agentType: string; name: string; instruction: string }
  | { type: 'submit'; sessionId: string; agentId: string; report: string }
  | { type: 'report'; sessionId: string; agentId: string; content: string }
  | { type: 'yield'; sessionId: string; agentId: string; nextPrompt?: string }
  | { type: 'complete'; sessionId: string; report: string }
  | { type: 'status'; sessionId?: string }
  | { type: 'tasks_add'; sessionId: string; description: string; status?: string }
  | { type: 'tasks_update'; sessionId: string; taskId: string; status?: string; description?: string }
  | { type: 'tasks_list'; sessionId: string }
  | { type: 'list'; cwd: string; all?: boolean }
  | { type: 'resume'; sessionId: string; cwd: string; tmuxSession: string; tmuxWindow: string; message?: string }
  | { type: 'register_claude_session'; sessionId: string; agentId: string; claudeSessionId: string }
  | { type: 'kill'; sessionId: string };

export type Response =
  | { ok: true; data?: Record<string, unknown> }
  | { ok: false; error: string };
