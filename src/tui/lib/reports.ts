import { readFileSync } from 'node:fs';
import type { AgentReport } from '../../shared/types.js';

export interface ReportBlock {
  type: 'update' | 'final';
  timestamp: string;
  content: string;
  summary: string;
}

function loadReportContent(report: AgentReport): string {
  try {
    return readFileSync(report.filePath, 'utf-8');
  } catch {
    return report.summary;
  }
}

export function resolveReports(reports: AgentReport[]): ReportBlock[] {
  return [...reports].reverse().map((r) => ({
    type: r.type as 'update' | 'final',
    timestamp: r.timestamp,
    content: loadReportContent(r),
    summary: r.summary,
  }));
}
