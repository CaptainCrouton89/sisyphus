// Hardcoded monthly cost estimates (USD) for the instance types sisyphus
// deploy provisions. Verified against provider list pricing on the date
// below; users should treat the figure as informational, not authoritative.
//
// Bump LAST_VERIFIED whenever you re-check the table.
export const LAST_VERIFIED = '2026-05-06';

interface Price {
  monthlyUsd: number;
  arch: 'arm' | 'x86';
}

const TABLE: Record<string, Price> = {
  // Hetzner Cloud — list pricing in EUR converted at ~1.08 USD/EUR.
  // EU-only (cax = ARM, cx = Intel x86):
  'hetzner:cax11': { monthlyUsd: 4.00, arch: 'arm' },
  'hetzner:cax21': { monthlyUsd: 7.00, arch: 'arm' },
  'hetzner:cx22':  { monthlyUsd: 4.50, arch: 'x86' },
  'hetzner:cx32':  { monthlyUsd: 8.00, arch: 'x86' },
  // US (ash / hil) — AMD x86 only (cpx series):
  'hetzner:cpx11': { monthlyUsd: 4.85, arch: 'x86' },
  'hetzner:cpx21': { monthlyUsd: 8.85, arch: 'x86' },

  // AWS EC2 us-east-1, on-demand, 730h/mo.
  'aws:t4g.medium': { monthlyUsd: 24.40, arch: 'arm' },
  'aws:t4g.large':  { monthlyUsd: 48.91, arch: 'arm' },
  'aws:t3.medium':  { monthlyUsd: 30.37, arch: 'x86' },
  'aws:t3.large':   { monthlyUsd: 60.74, arch: 'x86' },
};

export function lookupMonthlyCost(provider: string, instanceType: string): number | null {
  const entry = TABLE[`${provider}:${instanceType}`];
  return entry ? entry.monthlyUsd : null;
}

export function formatCostLine(provider: string, instanceType: string): string {
  const cost = lookupMonthlyCost(provider, instanceType);
  if (cost === null) {
    return `Estimated cost: unknown for ${provider}:${instanceType} (not in pricing table). Verify against your bill.`;
  }
  return `Estimated cost: ~$${cost.toFixed(2)}/mo (pricing last verified ${LAST_VERIFIED}; verify against your bill for current rates).`;
}
