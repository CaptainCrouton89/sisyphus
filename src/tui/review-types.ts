// ─── Requirements JSON Schema ────────────────────────────────────────────────

export interface RequirementsMeta {
  title: string;
  subtitle?: string;
  summary: string;
  version: number;
  lastModified: string;
  draft: number;
  reviewStartedAt?: string;
  reviewCompletedAt?: string;
  stage?: 'stage-2-in-progress' | 'stage-2-done' | 'stage-3-done';
  nextSectionId?: string;
  bounceIterations?: Record<string, number>;
}

export interface QuestionOption {
  title: string;
  description: string;
}

export interface OpenQuestion {
  id: string;
  question: string;
  options: QuestionOption[];
  response: string;
  selectedOption?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface RequirementQuestion {
  id: string;
  question: string;
  response: string;
}

export interface Criterion {
  text: string;
  checked: boolean;
}

export interface EarsClause {
  when?: string;
  while?: string;
  if?: string;
  where?: string;
  shall: string;
}

export type EarsKeyword = 'when' | 'while' | 'if' | 'where';

export interface Requirement {
  id: string;
  title: string;
  ears: EarsClause;
  criteria: Criterion[];
  status: 'draft' | 'question' | 'approved' | 'rejected' | 'deferred';
  agentNotes: string;
  userNotes: string;
  questions: RequirementQuestion[];
  reviewAction?: 'approve' | 'comment' | 'bounce-to-design';
  userComment?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RequirementsGroup {
  id: string;
  name: string;
  description: string;
  context?: string;
  requirements: Requirement[];
  safeAssumptions?: Requirement[];
  openQuestions?: OpenQuestion[];
}

export interface RequirementsData {
  meta: RequirementsMeta;
  groups: RequirementsGroup[];
}

// ─── Review State Machine ────────────────────────────────────────────────────

export type Phase =
  | { kind: 'overview' }
  | { kind: 'group-intro'; groupIndex: number }
  | { kind: 'item-review'; groupIndex: number; reqIndex: number; expanded: boolean; selectedAction: number; bucket: 'requirements' | 'safeAssumptions' }
  | { kind: 'group-questions'; groupIndex: number; questionIndex: number; selectedOption: number }
  | { kind: 'final' };

export type InputMode =
  | null
  | { kind: 'comment'; action: 'approve' | 'comment' | 'bounce-to-design' }
  | { kind: 'custom-answer' };

export interface ReviewState {
  rows: number;
  cols: number;
  data: RequirementsData;
  filePath: string;
  phase: Phase;
  scroll: number;
  dirty: boolean;
  inputMode: InputMode;
  inputBuffer: string;
  safeAssumptionsExpanded: boolean;
}

// ─── EARS Helpers ────────────────────────────────────────────────────────────

export const EARS_KEYWORDS: EarsKeyword[] = ['when', 'while', 'if', 'where'];

export function resolveEarsKeyword(ears: EarsClause): EarsKeyword | null {
  for (const kw of EARS_KEYWORDS) {
    if (ears[kw]) return kw;
  }
  return null;
}

export function getEarsCondition(ears: EarsClause): string {
  const kw = resolveEarsKeyword(ears);
  return kw ? (ears[kw] ?? '') : '';
}

/** Get pending (non-approved) requirements for a group */
export function pendingRequirements(group: RequirementsGroup): Requirement[] {
  return group.requirements.filter(r => r.status !== 'approved');
}

/** Get pending (non-approved) safe assumptions for a group */
export function pendingSafeAssumptions(group: RequirementsGroup): Requirement[] {
  return (group.safeAssumptions ?? []).filter(r => r.status !== 'approved');
}

/** True if every safe assumption is approved (empty/undefined → true) */
export function safeAssumptionsApproved(group: RequirementsGroup): boolean {
  const sa = group.safeAssumptions;
  if (!sa || sa.length === 0) return true;
  return sa.every(r => r.status === 'approved');
}

/** Count total pending items across all groups */
export function totalPending(data: RequirementsData): number {
  return data.groups.reduce((sum, g) => sum + pendingRequirements(g).length + pendingSafeAssumptions(g).length, 0);
}

/** Count total items across all groups */
export function totalRequirements(data: RequirementsData): number {
  return data.groups.reduce((sum, g) => sum + g.requirements.length + (g.safeAssumptions?.length ?? 0), 0);
}

/** Count items that have been reviewed (approved status or reviewAction set) */
export function totalReviewed(data: RequirementsData): number {
  let count = 0;
  for (const g of data.groups) {
    for (const r of g.requirements) {
      if (r.status === 'approved' || r.reviewAction) count++;
    }
    for (const r of g.safeAssumptions ?? []) {
      if (r.status === 'approved' || r.reviewAction) count++;
    }
  }
  return count;
}
