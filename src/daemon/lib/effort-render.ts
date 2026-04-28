export type EffortTier = 'low' | 'medium' | 'high' | 'xhigh';

const VALID_TIERS = new Set<string>(['low', 'medium', 'high', 'xhigh']);

// Matches <!--EFFORT:T1[,T2,...]-->...<!--/EFFORT--> blocks (non-greedy, multiline).
// Group 1: comma-separated tier list. Group 2: inner content.
const EFFORT_BLOCK_RE = /<!--EFFORT:([^-][^>]*)-->([\s\S]*?)<!--\/EFFORT-->/g;

// Detects an unmatched open marker (open without close, or another open before close)
const UNMATCHED_OPEN_RE = /<!--EFFORT:[^>]*-->/;

export function renderEffortMarkers(text: string, tier: EffortTier | string): string {
  const resolvedTier: EffortTier = VALID_TIERS.has(tier) ? (tier as EffortTier) : 'high';

  let warnedUnmatched = false;

  const rendered = text.replace(EFFORT_BLOCK_RE, (_match, tiersRaw: string, inner: string) => {
    // Check for nested open marker inside the captured inner content
    if (UNMATCHED_OPEN_RE.test(inner)) {
      if (!warnedUnmatched) {
        console.warn(`renderEffortMarkers: unbalanced or nested <!--EFFORT:...--> marker detected — leaving fragment untouched`);
        warnedUnmatched = true;
      }
      return _match;
    }

    const tiers = tiersRaw.split(',').map(t => t.trim().toLowerCase());
    // Unknown tier names: block dropped (fail closed)
    const allKnown = tiers.every(t => VALID_TIERS.has(t));
    if (!allKnown) return '';
    return tiers.includes(resolvedTier) ? inner : '';
  });

  // Warn once if there are any remaining unmatched open markers after substitution
  if (!warnedUnmatched && UNMATCHED_OPEN_RE.test(rendered)) {
    console.warn(`renderEffortMarkers: unbalanced <!--EFFORT:...--> marker detected (no closing <!--/EFFORT-->) — leaving fragment untouched`);
  }

  return rendered;
}
