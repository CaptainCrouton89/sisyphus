import type { Command } from 'commander';
import { isTmuxInstalled } from '../tmux.js';

export function registerGettingStarted(program: Command): void {
  program
    .command('getting-started')
    .description('Show a complete guide to using sisyphus effectively')
    .action(() => {
      const hasTmux = isTmuxInstalled();
      const inTmux = !!process.env['TMUX'];

      const lines = [
        '',
        '  ╔══════════════════════════════════════════╗',
        '  ║        Getting Started with Sisyphus     ║',
        '  ╚══════════════════════════════════════════╝',
        '',
        '  Sisyphus is a multi-agent orchestration daemon for Claude Code.',
        '  It breaks large tasks into subtasks, spawns parallel Claude agents,',
        '  and coordinates their work across multiple cycles — autonomously.',
        '',
        '  ─── Tmux ───────────────────────────────────',
        '',
      ];

      if (!hasTmux) {
        lines.push(
          '  ⚠  tmux is not installed. Sisyphus requires tmux.',
          '     Install it:  brew install tmux  (macOS)',
          '                  apt install tmux   (Linux)',
          '',
        );
      } else if (!inTmux) {
        lines.push(
          '  ⚠  You are not inside a tmux session.',
          '     Sisyphus spawns agent panes inside tmux, so you should',
          '     start a tmux session before running sisyphus:',
          '',
          '       tmux new-session',
          '',
        );
      } else {
        lines.push(
          '  ✓  You are inside tmux. Good to go.',
          '',
        );
      }

      lines.push(
        '  ─── What Makes a Good Sisyphus Task ────────',
        '',
        '  Sisyphus is built for BIG tasks — the kind that would take',
        '  multiple cycles of orchestration and parallel agent work.',
        '  If you could do it with a single Claude Code session in plan',
        '  mode, it\'s too small for sisyphus.',
        '',
        '  Good tasks:',
        '    • "Implement this feature" @path/to/spec.md',
        '    • "Do a deep dive on all SEO/AEO optimizations and',
        '       systematically apply them across the site"',
        '    • Large-scale refactors spanning dozens of files',
        '    • Full feature builds from a written spec',
        '',
        '  Too small for sisyphus:',
        '    • "Add these 3 UI components to the page"',
        '    • "Fix this bug in auth.ts"',
        '    • Anything a single Claude session handles comfortably',
        '',
        '  Tasks don\'t need to be hyper-specific — broad but meaningful',
        '  tasks work great because the orchestrator will plan the approach.',
        '  What matters is SCALE, not specificity.',
        '',
        '  For best results, write a spec and reference it directly:',
        '',
        '    sisyphus start "Implement this @path/to/spec.md"',
        '',
        '  ─── How It Works ───────────────────────────',
        '',
        '  1. You run:  sisyphus start "task description"',
        '  2. An orchestrator Claude reviews the task and creates a roadmap',
        '  3. It spawns agent Claude instances in parallel tmux panes',
        '  4. Agents work independently, then submit reports when done',
        '  5. The orchestrator respawns with fresh context, reviews progress,',
        '     and kicks off the next cycle of work',
        '  6. This repeats until the orchestrator marks the task complete',
        '',
        '  The orchestrator is stateless — it gets killed after each cycle',
        '  and respawned fresh with the full session state. This means it',
        '  never runs out of context, no matter how many cycles a task takes.',
        '',
        '  ─── Monitoring (Important!) ────────────────',
        '',
        '  Sisyphus sessions should be actively monitored. Agents can get',
        '  stuck waiting for input, fail to submit reports, or take the',
        '  roadmap in a direction you don\'t want. The dashboard is your',
        '  primary tool for staying on top of things:',
        '',
        '    sisyphus dashboard',
        '',
        '  Key dashboard actions:',
        '    m  — Message the orchestrator to steer direction',
        '    w  — Jump directly into the sisyphus tmux session',
        '         to see exactly what agents are doing',
        '',
        '  Use `m` to course-correct from the dashboard, and `w` when you',
        '  need the most granular view of agent activity.',
        '',
        '  ─── Commands ───────────────────────────────',
        '',
        '  Start & monitor:',
        '    sisyphus start "task"               Start a session',
        '    sisyphus start "task @spec.md"      Start referencing a spec',
        '    sisyphus status [id]                Show session status',
        '    sisyphus list                       List all sessions',
        '    sisyphus dashboard                  Open TUI dashboard',
        '',
        '  Control:',
        '    sisyphus resume <id> "instructions" Resume with new direction',
        '    sisyphus kill <id>                  Stop a session',
        '',
        '  Health:',
        '    sisyphus doctor                     Check installation health',
        '    tail -f ~/.sisyphus/daemon.log      Watch daemon logs',
        '',
        '  ─── Next Steps ─────────────────────────────',
        '',
        '  1. Run `sisyphus doctor` to check your setup',
        '  2. Start a tmux session: `tmux new-session`',
        '  3. Try it: `sisyphus start "your task description"`',
        '',
      );

      console.log(lines.join('\n'));
    });
}
