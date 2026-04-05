// ─── Design Walkthrough JSON Schema ──────────────────────────────────────────

export interface DesignMeta {
  title: string;
  subtitle?: string;
  summary: string;
  version: number;
  lastModified: string;
  draft: number;
  reviewStartedAt?: string;
  reviewCompletedAt?: string;
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

export interface DesignDecision {
  proposal: {
    title: string;
    description: string;
  };
  alternatives: Array<{
    title: string;
    description: string;
  }>;
  lenses: Record<string, string>;
}

export interface DesignItem {
  id: string;
  title: string;
  description: string;
  content: string;
  decision?: DesignDecision;
  agentNotes: string;
  status: 'draft' | 'approved' | 'rejected' | 'deferred';
  userNotes: string;
  reviewAction?: 'agree' | 'pick-alt' | 'comment';
  selectedAlternative?: number;
  userComment?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DesignSection {
  id: string;
  name: string;
  goal: string;
  context: string;
  items: DesignItem[];
  openQuestions?: OpenQuestion[];
}

export interface DesignData {
  meta: DesignMeta;
  sections: DesignSection[];
}

// ─── Walkthrough State Machine ───────────────────────────────────────────────

export type DesignPhase =
  | { kind: 'overview' }
  | { kind: 'section-intro'; sectionIndex: number }
  | { kind: 'item-walkthrough'; sectionIndex: number; itemIndex: number; selectedAction: number }
  | { kind: 'section-questions'; sectionIndex: number; questionIndex: number; selectedOption: number }
  | { kind: 'final' };

export type DesignInputMode =
  | null
  | { kind: 'comment'; pendingAlt?: number }
  | { kind: 'custom-answer' };

export interface DesignState {
  rows: number;
  cols: number;
  data: DesignData;
  filePath: string;
  phase: DesignPhase;
  scroll: number;
  dirty: boolean;
  inputMode: DesignInputMode;
  inputBuffer: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function totalItems(data: DesignData): number {
  return data.sections.reduce((sum, s) => sum + s.items.length, 0);
}

export function totalReviewed(data: DesignData): number {
  let count = 0;
  for (const s of data.sections) {
    for (const item of s.items) {
      if (item.status === 'approved' || item.reviewAction) count++;
    }
  }
  return count;
}

export function sectionProgress(section: DesignSection): { total: number; reviewed: number; decisions: number; agreed: number } {
  let reviewed = 0;
  let decisions = 0;
  let agreed = 0;
  for (const item of section.items) {
    if (item.status === 'approved' || item.reviewAction) reviewed++;
    if (item.decision) {
      decisions++;
      if (item.reviewAction === 'agree' || item.reviewAction === 'pick-alt') agreed++;
    }
  }
  return { total: section.items.length, reviewed, decisions, agreed };
}
