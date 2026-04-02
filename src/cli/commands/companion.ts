import type { Command } from 'commander';
import { sendRequest } from '../client.js';
import { renderCompanion } from '../../shared/companion-render.js';
import { ACHIEVEMENTS } from '../../shared/companion-types.js';
import type { CompanionState } from '../../shared/companion-types.js';
import { createBadgeGallery, renderBadgeCard } from '../../shared/companion-badges.js';

const CATEGORY_LABELS: Record<string, string> = {
  milestone: 'Milestone',
  session: 'Session',
  time: 'Time',
  behavioral: 'Behavioral',
};

export function registerCompanion(program: Command): void {
  program
    .command('companion')
    .description('Show companion profile and stats')
    .option('--name <name>', 'Set companion name')
    .option('--badges', 'Show badge gallery')
    .action(async (opts: { name?: string; badges?: boolean }) => {
      const res = await sendRequest({ type: 'companion', name: opts.name });
      if (!res.ok) {
        console.error(res.error);
        process.exit(1);
      }
      const companion = res.data as unknown as CompanionState;

      // Header: face + identity
      const face = renderCompanion(companion, ['face', 'boulder'], { color: true });
      const displayName = companion.name !== null ? companion.name : '(unnamed)';
      console.log();
      console.log(`  ${face}`);
      console.log();
      console.log(`  ${displayName}  ·  Level ${companion.level} ${companion.title}`);
      console.log(`  Mood: ${companion.mood}  ·  XP: ${companion.xp}`);
      console.log();

      // Stats
      const s = companion.stats;
      const endH = Math.floor(s.endurance / 3_600_000);
      console.log('  Stats');
      console.log(`    Strength   ${s.strength} sessions`);
      console.log(`    Endurance  ${endH}h total active`);
      console.log(`    Wisdom     ${s.wisdom} efficient sessions`);
      console.log(`    Patience   ${s.patience} persistence score`);
      console.log();

      if (opts.badges) {
        // Full badge gallery
        const gallery = createBadgeGallery(companion.achievements);
        console.log(`  Badges  ${companion.achievements.length}/${ACHIEVEMENTS.length} earned`);
        console.log();

        for (let i = 0; i < gallery.total; i++) {
          const def = gallery.achievements[i]!;
          const unlock = gallery.unlocked.get(def.id) ?? null;
          const card = renderBadgeCard(def, unlock);
          for (const line of card.lines) {
            console.log(`    ${line}`);
          }
          console.log();
        }
      } else {
        // Compact achievement list
        const unlocked = new Set(companion.achievements.map(a => a.id));
        const byCategory = new Map<string, typeof ACHIEVEMENTS>();
        for (const def of ACHIEVEMENTS) {
          const group = byCategory.get(def.category) ?? [];
          group.push(def);
          byCategory.set(def.category, group);
        }

        console.log(`  Achievements  ${companion.achievements.length}/${ACHIEVEMENTS.length}  (use --badges for gallery)`);
        for (const [category, defs] of byCategory) {
          const label = CATEGORY_LABELS[category] ?? category;
          const unlockedCount = defs.filter(d => unlocked.has(d.id)).length;
          console.log(`    ${label} (${unlockedCount}/${defs.length})`);
          for (const def of defs) {
            const icon = unlocked.has(def.id) ? '✓' : '·';
            console.log(`      ${icon} ${def.name} — ${def.description}`);
          }
        }
        console.log();
      }

      // Repos
      const repos = Object.entries(companion.repos);
      if (repos.length > 0) {
        repos.sort(([, a], [, b]) => b.visits - a.visits);
        console.log('  Repositories');
        for (const [path, mem] of repos.slice(0, 10)) {
          const nick = mem.nickname ? ` "${mem.nickname}"` : '';
          const parts = [`${mem.visits} visits`, `${mem.completions} completions`];
          if (mem.crashes > 0) parts.push(`${mem.crashes} crashes`);
          console.log(`    ${path}${nick}`);
          console.log(`      ${parts.join('  ·  ')}`);
        }
        if (repos.length > 10) {
          console.log(`    … and ${repos.length - 10} more`);
        }
        console.log();
      }

      // Commentary
      if (companion.lastCommentary) {
        console.log(`  "${companion.lastCommentary.text}"`);
        console.log();
      }
    });
}
