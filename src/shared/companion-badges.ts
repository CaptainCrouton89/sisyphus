import type { AchievementId, AchievementDef, UnlockedAchievement } from './companion-types.js';
import { ACHIEVEMENTS } from './companion-types.js';

// ---------------------------------------------------------------------------
// Badge art — large-format ASCII art for achievement cards
// Each art block is an array of strings, rendered centered in the card.
// ---------------------------------------------------------------------------

const BADGE_ART: Record<AchievementId, string[]> = {
  // ── Milestone ─────────────────────────────────────────────────────────────
  'first-blood': [
    '        ╱╲        ',
    '       ╱  ╲       ',
    '      ╱ ◆◆ ╲      ',
    '     ╱  ◆◆  ╲     ',
    '    ╱   ◆◆   ╲    ',
    '   ╱    ◆◆    ╲   ',
    '  ╱─────◆◆─────╲  ',
    '  ╲     ◆◆     ╱  ',
    '   ╲    ◆◆    ╱   ',
    '    ╲───◆◆───╱    ',
    '        ││        ',
    '      ══╪╪══      ',
  ],
  'centurion': [
    '    ┌──═════──┐    ',
    '    │  ╔═══╗  │    ',
    '   ╱│  ║100║  │╲   ',
    '  ╱ │  ╚═══╝  │ ╲  ',
    ' ╱  └─────────┘  ╲ ',
    ' ╲   ┌───────┐   ╱ ',
    '  ╲  │ ★ ★ ★ │  ╱  ',
    '   ╲ └───────┘ ╱   ',
    '    ╲─────────╱    ',
  ],
  'thousand-boulder': [
    '       ╭━━━╮       ',
    '     ╭━┫1K ┣━╮     ',
    '   ╭━┫ ╰━━━╯ ┣━╮   ',
    '   ┃  ◉◉◉◉◉◉   ┃   ',
    '   ┃ ◉◉◉◉◉◉◉◉  ┃   ',
    '   ┃  ◉◉◉◉◉◉   ┃   ',
    '   ╰━┫       ┣━╯   ',
    '     ╰━┫   ┣━╯     ',
    '       ╰━━━╯       ',
  ],
  'cartographer': [
    '        N         ',
    '        △         ',
    '   ╭────┼────╮    ',
    '   │ ·  │  · │    ',
    '  W┼····+····┼E   ',
    '   │ ·  │  · │    ',
    '   ╰────┼────╯    ',
    '        ▽         ',
    '        S         ',
  ],
  'world-traveler': [
    '      ╭──────╮      ',
    '   ╭──┤      ├──╮   ',
    '  ╱  ·│ ◠◡◠  │·  ╲  ',
    ' │ ·  │◠    ◡│  · │ ',
    ' │  · │ ◡◠◡  │ ·  │ ',
    '  ╲  ·│      │·  ╱  ',
    '   ╰──┤      ├──╯   ',
    '      ╰──────╯      ',
  ],
  'hive-mind': [
    '     ╱╲  ╱╲  ╱╲     ',
    '    ╱◆◆╲╱◆◆╲╱◆◆╲    ',
    '    ╲◆◆╱╲◆◆╱╲◆◆╱    ',
    '   ╱╲╱╱◆╲╱╱◆╲╲╱╲   ',
    '  ╱◆◆╲╲◆◆╲╲◆◆╱◆◆╲  ',
    '  ╲◆◆╱╱◆◆╱╱◆◆╲◆◆╱  ',
    '   ╲╱╲╲◆╱╲╲◆╱╱╲╱   ',
    '    ╲◆◆╱╲◆◆╱╲◆◆╱    ',
    '     ╲╱  ╲╱  ╲╱     ',
  ],
  'old-growth': [
    '        ╱╲         ',
    '       ╱╱╲╲        ',
    '      ╱╱  ╲╲       ',
    '     ╱╱╱╲╱╲╲╲      ',
    '    ╱╱╱    ╲╲╲     ',
    '   ╱╱╱╱╲╱╲╱╲╲╲╲    ',
    '       ║║║         ',
    '       ║║║         ',
    '    ═══╩╩╩═══      ',
  ],
  'ancient': [
    '    ┌─┬─────┬─┐    ',
    '    │ │ ◉ ◉ │ │    ',
    '    │ │  ▽  │ │    ',
    '  ╔═╧═╧═════╧═╧═╗  ',
    '  ║ A N C I E N ║  ',
    '  ║     T       ║  ',
    '  ╚═════════════╝  ',
    '   ╱╱╱╱╱╱╱╱╱╱╱╱╱   ',
    '   ▔▔▔▔▔▔▔▔▔▔▔▔▔   ',
  ],
  'regular': [
    '      ╭─────╮      ',
    '    ╭─┤  10 ├─╮    ',
    '   ╱  ╰─────╯  ╲   ',
    '  │   ╭─────╮   │  ',
    '  │   │  ◉  │   │  ',
    '  │   ╰─────╯   │  ',
    '   ╲            ╱   ',
    '    ╰───────────╯   ',
  ],
  'veteran': [
    '   ╔═══════════╗   ',
    '   ║  ╔═════╗  ║   ',
    '   ║  ║  V  ║  ║   ',
    '   ║  ║ 500 ║  ║   ',
    '   ║  ╚═════╝  ║   ',
    '   ║ ★ ★ ★ ★ ★ ║   ',
    '   ╚═══════════╝   ',
    '    ╱╱╱╱╱╱╱╱╱╱╱    ',
    '    ▔▔▔▔▔▔▔▔▔▔▔    ',
  ],
  'swarm-starter': [
    '                    ',
    '   ◆  ◆  ◆  ◆  ◆   ',
    '  ◆  ◆  ◆  ◆  ◆    ',
    '   ◆  ◆  ◆  ◆  ◆   ',
    '  ◆  ◆  ◆  ◆  ◆    ',
    '   ◆  ◆  ◆  ◆  ◆   ',
    '                    ',
    '     · 50 out ·     ',
  ],
  'legion': [
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
    '  ◆◆◆  2K  ◆◆◆◆◆   ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆◆   ',
  ],
  'army-of-thousands': [
    ' ················· ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆ ',
    ' ················· ',
    ' ·◆·◆·5K·◆·◆·◆·◆· ',
    ' ················· ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆ ',
    ' ················· ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆ ',
    ' ················· ',
  ],
  'singularity': [
    '  ╲  │  ╱  ─  ·   ',
    '   ╲ │ ╱           ',
    '    ╲│╱            ',
    ' ────◆────         ',
    '    ╱│╲            ',
    '   ╱ │ ╲           ',
    '  ╱  │  ╲  ─  ·   ',
    '   10000 agents    ',
  ],
  'first-shift': [
    '      ┌─────┐      ',
    '      │ ╲   │      ',
    '     ╱│  ╲  │╲     ',
    '    ╱ │   ╲ │ ╲    ',
    '    ╲ │    ╲│ ╱    ',
    '     ╲│     │╱     ',
    '      │   ╱ │      ',
    '      └─────┘      ',
    '       10 hrs       ',
  ],
  'workaholic': [
    '     ╭─────────╮    ',
    '    ╱  12       ╲   ',
    '   │ ·    │      │  ',
    '   │9  ·  │    3 │  ',
    '   │       ╲     │  ',
    '    ╲      6 ·  ╱   ',
    '     ╰─────────╯    ',
    '       100 hrs       ',
  ],
  'time-lord': [
    '    ╔═══════════╗   ',
    '   ╱             ╲  ',
    '  │ · 11 12 1 ·   │ ',
    '  │ 10  ╲    2    │ ',
    '  │ 9    ·    3   │ ',
    '  │  8       4    │ ',
    '   ╲   7   5     ╱  ',
    '    ╚═══════════╝   ',
    '       500 hrs       ',
  ],
  'eternal-grind': [
    '    ╭───╮   ╭───╮   ',
    '   ╱     ╲ ╱     ╲  ',
    '  │   ∞   ╳   ∞   │ ',
    '   ╲     ╱ ╲     ╱  ',
    '    ╰───╯   ╰───╯   ',
    '      ┌─────┐       ',
    '      │ ╲ ╱ │       ',
    '      │  ×  │       ',
    '      └─────┘       ',
  ],
  'epoch': [
    '      ·  ★  ·       ',
    '   ·    ╱│╲    ·    ',
    '    ╲  ╱ │ ╲  ╱     ',
    '     ╲╱  │  ╲╱      ',
    '  ────◆──┼──◆────   ',
    '     ╱╲  │  ╱╲      ',
    '    ╱  ╲ │ ╱  ╲     ',
    '   ·    ╲│╱    ·    ',
    '      5000 hrs       ',
  ],
  'seasoned': [
    '        ╱╲          ',
    '       ╱  ╲         ',
    '      ╱╱╲╱╲╲        ',
    '     ╱╱    ╲╲     ',
    '    ╱╱╱╱╲╱╲╲╲╲    ',
    '        ║║         ',
    '   ─────╨╨─────   ',
    '  ╲╲╲╲╲╲╲╲╲╲╲╲╲    ',
    '    90 day roots     ',
  ],
  'omnipresent': [
    '         N          ',
    '     ·   △   ·      ',
    '   NW  ╭─┼─╮  NE   ',
    '  ·  ╭─┤·+·├─╮  ·  ',
    '  W──┤·│ · │·├──E   ',
    '  ·  ╰─┤·+·├─╯  ·  ',
    '   SW  ╰─┼─╯  SE   ',
    '     ·   ▽   ·      ',
    '         S          ',
  ],
  'apprentice': [
    '                    ',
    '         ╱╲         ',
    '        ╱  ╲        ',
    '       ╱    ╲       ',
    '      ╱      ╲      ',
    '     ╱────────╲     ',
    '    ╱ level 5  ╲   ',
    '    ▔▔▔▔▔▔▔▔▔▔▔▔    ',
  ],
  'journeyman': [
    '        ╱╲          ',
    '       ╱  ╲   ╱╲    ',
    '      ╱    ╲ ╱  ╲   ',
    '     ╱      ╳    ╲  ',
    '    ╱      ╱ ╲    ╲ ',
    '   ╱──────╱───╲────╲',
    '  ╱  level 15       ',
    '  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  ',
  ],
  'master': [
    '       ★╲╱★         ',
    '        ╱╲          ',
    '       ╱  ╲         ',
    '      ╱╱╲╱╲╲        ',
    '     ╱╱    ╲╲       ',
    '    ╱╱      ╲╲      ',
    '   ╱─────────╲╲     ',
    '  ╱  level 30  ╲    ',
    '  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔    ',
  ],
  'grandmaster': [
    '      ★ ★ ★         ',
    '       ╲│╱          ',
    '        ╱╲          ',
    '       ╱  ╲         ',
    '      ╱╱╲╱╲╲        ',
    '     ╱╱    ╲╲       ',
    '    ╱╱  ★   ╲╲      ',
    '   ╱─────────╲╲     ',
    '  ╱  level 50  ╲    ',
  ],

  // ── Session ───────────────────────────────────────────────────────────────
  'marathon': [
    '  ╭──────────────╮  ',
    '  │ ╱╲ ╱╲ ╱╲ ╱╲  │  ',
    '  │╱  ╳  ╳  ╳  ╲ │  ',
    '  │   ╱╲ ╱╲ ╱╲   │  ',
    '  │  ╱  ╳  ╳  ╲  │  ',
    '  │ ╱  ╱ ╲╱ ╲  ╲ │  ',
    '  │╱  ╱      ╲  ╲│  ',
    '  ├──────────────┤  ',
    '  │   ~  ^  ~    │  ',
    '  ╰──────────────╯  ',
  ],
  'blitz': [
    '       ╱╱         ',
    '      ╱╱          ',
    '     ╱╱           ',
    '    ╱╱╱╱╱╱        ',
    '       ╱╱         ',
    '      ╱╱          ',
    '     ╱╱           ',
    '    ╱╱             ',
  ],
  'speed-run': [
    '    ╭──────────╮    ',
    '   ╱            ╲   ',
    '  │   10   ╱╱    │  ',
    '  │   ·   ╱╱     │  ',
    '  │  ╱   ╱╱      │  ',
    '  │ ╱   ╱╱       │  ',
    '   ╲   ╱╱       ╱   ',
    '    ╰──────────╯    ',
  ],
  'flawless': [
    '      ✦       ✦      ',
    '   ✦     ╱╲     ✦   ',
    '      ╔══╧═══╗      ',
    '   ✦  ║      ║  ✦   ',
    '      ║   ◆  ║       ',
    '      ║      ║       ',
    '   ✦  ╚══════╝  ✦   ',
    '      ✦       ✦      ',
  ],
  'iron-will': [
    '   ╔═══════════╗   ',
    '   ║ ┌───────┐ ║   ',
    '   ║ │╔═════╗│ ║   ',
    '   ║ │║ ◆◆◆ ║│ ║   ',
    '   ║ │║ ◆◆◆ ║│ ║   ',
    '   ║ │╚═════╝│ ║   ',
    '   ║ └───────┘ ║   ',
    '   ╚═══════════╝   ',
  ],
  'glass-cannon': [
    '        ╱╲         ',
    '       ╱╱╲╲        ',
    '      ╱╱  ╲╲       ',
    '     ╱╱ ╳╳ ╲╲      ',
    '    ╱╱  ╳╳  ╲╲     ',
    '    ╲╲  ╳╳  ╱╱     ',
    '     ╲╲    ╱╱      ',
    '      ╲╲  ╱╱       ',
    '       ╲╲╱╱        ',
    '     ═══╧╧═══      ',
  ],
  'solo': [
    '                    ',
    '     ╭─────────╮   ',
    '     │         │   ',
    '     │    ◆    │   ',
    '     │         │   ',
    '     ╰─────────╯   ',
    '                    ',
  ],
  'one-more-cycle': [
    '     ╭──→──╮       ',
    '     │     │       ',
    '     ↑  ∞  ↓       ',
    '     │     │       ',
    '     ╰──←──╯       ',
    '                    ',
    '    ╭──→──╮        ',
    '    │     │        ',
    '    ↑  ∞  ↓        ',
    '    │     │        ',
    '    ╰──←──╯        ',
  ],
  'quick-draw': [
    '         ╱│        ',
    '        ╱ │        ',
    '     ──╱──│──      ',
    '      ╱   │        ',
    '     ╱  ╭─╯        ',
    '    ╱   │          ',
    '   ╱  ╭─╯          ',
    '      │            ',
    '    ──╨──           ',
  ],
  'squad': [
    '                    ',
    '   ◆  ◆  ◆  ◆      ',
    '                    ',
    '   ◆  ◆  ◆  ◆      ',
    '                    ',
    '   ◆  ◆             ',
    '                    ',
    '    · 10 strong ·   ',
  ],
  'battalion': [
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆    ',
    '                    ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆    ',
    '                    ',
    '  ◆◆◆◆◆◆◆◆◆◆◆◆◆    ',
    '                    ',
    '    · 25 strong ·   ',
  ],
  'swarm': [
    ' ◆·◆·◆·◆·◆·◆·◆·◆·  ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆  ',
    ' ◆·◆·◆·◆·◆·◆·◆·◆·  ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆  ',
    ' ◆·◆·◆·◆·◆·◆·◆·◆·  ',
    ' ·◆·◆·◆·◆·◆·◆·◆·◆  ',
    '    · 50 strong ·   ',
  ],
  'deep-dive': [
    '   ≈≈≈≈≈≈≈≈≈≈≈≈≈    ',
    '       ↓            ',
    '      ╱│╲           ',
    '       │            ',
    '       │            ',
    '       ▼            ',
    '   · · · · · · ·    ',
    '      15 deep        ',
  ],
  'abyss': [
    '  ≈≈≈≈≈≈≈≈≈≈≈≈≈≈    ',
    '       │            ',
    '       │            ',
    '       │            ',
    '       ▼            ',
    '       │            ',
    '       │            ',
    '       ▼            ',
    '      25 deep        ',
  ],
  'eternal-recurrence': [
    '    ╭──→──╮         ',
    '   ╱   ∞   ╲        ',
    '  │  ╭───╮  │       ',
    '  │  │ ∞ │  │       ',
    '  │  ╰───╯  │       ',
    '   ╲   ∞   ╱        ',
    '    ╰──←──╯         ',
    '      40 cycles      ',
  ],
  'endurance': [
    '                    ',
    '  ╔══════════════╗  ',
    '  ║▓▓▓▓▓▓▓▓▓▓▓▓▓║  ',
    '  ╚══════════════╝  ',
    '                    ',
    '  ╔══════════════╗  ',
    '  ║▓▓▓▓▓▓▓▓▓    ║  ',
    '  ╚══════════════╝  ',
    '       4 hours       ',
  ],
  'ultramarathon': [
    '  ╔══════════════╗  ',
    '  ║▓▓▓▓▓▓▓▓▓▓▓▓▓║  ',
    '  ╚══════════════╝  ',
    '   ─────────────→   ',
    '                ·   ',
    '               ·    ',
    '              ·     ',
    '             ·      ',
    '       6 hours       ',
  ],
  'one-shot': [
    '     ╭───────╮      ',
    '     │ ╭───╮ │      ',
    '     │ │ ◉ │ │      ',
    '     │ ╰───╯ │      ',
    '     ╰───────╯      ',
    '         ↑          ',
    '        ╱│          ',
    '       ╱ │          ',
    '    → ◉  │          ',
  ],
  'flash': [
    '       ╱╱           ',
    '      ╱╱            ',
    '     ╱╱             ',
    '    ╱╱╱╱╱╱          ',
    '       ╱╱           ',
    '      ╱╱            ',
    '     ╱╱             ',
    '    ╱╱              ',
    '    < 2 min          ',
  ],

  // ── Time ──────────────────────────────────────────────────────────────────
  'night-owl': [
    '       ☽            ',
    '    ╭─────╮    ·    ',
    '   ╱  ◉ ◉  ╲   ·   ',
    '  │    ▽    │  ·    ',
    '  │  ╱───╲  │       ',
    '   ╲╱     ╲╱        ',
    '   ╱╲     ╱╲   ·    ',
    '  ╱  ╲───╱  ╲  ·   ',
    '  ▔▔▔▔▔▔▔▔▔▔▔       ',
  ],
  'dawn-patrol': [
    '                    ',
    '  ─ ─ ─ ─ ─ ─ ─ ─  ',
    '   ╲  │  ╱         ',
    '    ╲ │ ╱          ',
    ' ────◑────         ',
    ' ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ',
    ' ░░░░░░░░░░░░░░░░  ',
    '                    ',
  ],
  'early-bird': [
    '            ╱╱      ',
    '    ◠      ╱╱       ',
    '   ╱ ╲   ╱╱        ',
    '  │ ◉ ╲>╱          ',
    '  │   ═╱           ',
    '   ╲  ╱            ',
    '    ╲╱╲            ',
    '     ╲ ╲           ',
    '      ▔▔           ',
  ],
  'weekend-warrior': [
    '   ╔═══════════╗   ',
    '   ║ S M T W T ║   ',
    '   ║           ║   ',
    '   ║         ◆ ║   ',
    '   ║ ◆         ║   ',
    '   ╚═══════════╝   ',
  ],
  'all-nighter': [
    '     ╭─────────╮    ',
    '    ╱  12       ╲   ',
    '   │ ·    │      │  ',
    '   │9     │    3 │  ',
    '   │      ·      │  ',
    '    ╲      6    ╱   ',
    '     ╰─────────╯    ',
    '       ∞ ∞ ∞        ',
  ],
  'witching-hour': [
    '    ·  ·  ✦  ·  ·   ',
    '   ·    ╱╲    ·     ',
    '      ╱    ╲        ',
    '     │ 3:00 │       ',
    '     │  AM  │       ',
    '      ╲    ╱        ',
    '   ·    ╲╱    ·     ',
    '    ·  ·  ✦  ·  ·   ',
  ],

  // ── Behavioral ────────────────────────────────────────────────────────────
  'sisyphean': [
    '          ╱         ',
    '         ╱  ◉       ',
    '        ╱ ◉◉◉       ',
    '       ╱  ◉◉◉       ',
    '      ╱    ◉        ',
    '     ╱     ;        ',
    '    ╱    (>.<)      ',
    '   ╱    ╱╱  ╲╲      ',
    '  ╱    ╱      ╲     ',
  ],
  'stubborn': [
    '     ╱╱╱╱╱╱╱╱╱      ',
    '    ╱╱╱╱╱╱╱╱╱╱      ',
    '         ◉          ',
    '        ◉◉◉         ',
    '       (>.<)        ',
    '     ╱╱╱╱╱╱╱╱╱      ',
    '    ╱╱╱╱╱╱╱╱╱╱      ',
    '         ✓          ',
  ],
  'creature-of-habit': [
    '   ╭───╮ ╭───╮     ',
    '   │ → │→│ → │→    ',
    '   ╰───╯ ╰───╯     ',
    '   ╭───╮ ╭───╮     ',
    '   │ → │→│ → │→    ',
    '   ╰───╯ ╰───╯     ',
    '   ╭───╮ ╭───╮     ',
    '   │ → │→│ → │→    ',
    '   ╰───╯ ╰───╯     ',
  ],
  'loyal': [
    '      ╱╲            ',
    '     ╱  ╲           ',
    '    ╱ ♥♥ ╲          ',
    '   ╱  ♥♥  ╲         ',
    '   ╲  50  ╱         ',
    '    ╲    ╱          ',
    '     ╲  ╱           ',
    '      ╲╱            ',
  ],
  'wanderer': [
    '   ·    ·    ·      ',
    '    ╲   │   ╱       ',
    '     ╲  │  ╱        ',
    '      · + ·         ',
    '     ╱  │  ╲        ',
    '    ╱   │   ╲       ',
    '   ·    ·    ·      ',
  ],
  'streak': [
    '  ╔══╗╔══╗╔══╗╔══╗  ',
    '  ║M ║║T ║║W ║║T ║  ',
    '  ║◆ ║║◆ ║║◆ ║║◆ ║  ',
    '  ╚══╝╚══╝╚══╝╚══╝  ',
    '  ╔══╗╔══╗╔══╗      ',
    '  ║F ║║S ║║S ║      ',
    '  ║◆ ║║◆ ║║◆ ║      ',
    '  ╚══╝╚══╝╚══╝      ',
  ],
  'hot-streak': [
    '       ╱╲           ',
    '      ╱╱╲╲          ',
    '     ╱╱◆◆╲╲         ',
    '    ╱╱ ◆◆ ╲╲        ',
    '    ╲╲ ◆◆ ╱╱        ',
    '     ╲╲◆◆╱╱         ',
    '      ╲╲╱╱          ',
    '    ×7 clean        ',
  ],
  'momentum': [
    '   ◉        ◉       ',
    '   │╲      ╱│       ',
    '   │ ╲    ╱ │       ',
    '   │  ╲  ╱  │       ',
    '   │   ◉◉   │       ',
    '   │  ╱  ╲  │       ',
    '   │ ╱    ╲ │       ',
    '   │╱      ╲│       ',
    '   ◉        ◉       ',
  ],
  'patient-one': [
    '     ╭───────╮      ',
    '     │ ‾.‾   │      ',
    '     │       │      ',
    '     │  zzz  │      ',
    '     │   zz  │      ',
    '     │    z  │      ',
    '     │       │      ',
    '     ╰───────╯      ',
    '      30 min+       ',
  ],
  'message-in-a-bottle': [
    '     ╭─╮            ',
    '     │×│            ',
    '   ╭─┴─┴─╮          ',
    '   │ ░░░ │          ',
    '   │ ░░░ │          ',
    '   │ ░░░ │          ',
    '   ╰─────╯          ',
    '  ≈≈≈≈≈≈≈≈≈         ',
    '   ≈≈≈≈≈≈≈          ',
  ],
  'comeback-kid': [
    '    ╱╲     ╱╲       ',
    '   ╱  ╲   ╱  ╲      ',
    '  ╱    ╲ ╱    ╲     ',
    ' ╱      ╳      ╲    ',
    ' ╲      ╱╲     ╱    ',
    '  ╲    ╱  ╲   ╱     ',
    '   ╲  ╱    ╲ ╱      ',
    '    ╲╱      ╲╱  ✓   ',
  ],
  'pair-programming': [
    '   ╭─────╮╭─────╮   ',
    '   │ ◉ ◉ ││ ◉ ◉ │   ',
    '   │  ▽  ││  ▽  │   ',
    '   ╰──┬──╯╰──┬──╯   ',
    '      │ ╱──╲ │      ',
    '      │╱    ╲│      ',
    '      ╱  ══  ╲      ',
    '     ╱  ════  ╲     ',
    '     ▔▔▔▔▔▔▔▔▔▔     ',
  ],
  'overdrive': [
    '    ╭──────────╮    ',
    '   ╱  ╭──────╮  ╲   ',
    '  │  ╱   ×6   ╲  │  ',
    '  │ │    ◉     │ │  ',
    '  │  ╲         ╱  │  ',
    '   ╲   ╰──────╯   ╱  ',
    '    ╰──────────╯    ',
    '     same day ×6    ',
  ],
  'iron-streak': [
    '  ╔══╗─╔══╗─╔══╗   ',
    '  ║◆ ║ ║◆ ║ ║◆ ║   ',
    '  ╚══╝─╚══╝─╚══╝   ',
    '    │         │     ',
    '  ╔══╗─╔══╗─╔══╗   ',
    '  ║◆ ║ ║◆ ║ ║◆ ║   ',
    '  ╚══╝─╚══╝─╚══╝   ',
    '     14 day chain   ',
  ],
  'deep-conversation': [
    '     ╭─────────╮    ',
    '    ╱  ╭──╮ 20  ╲   ',
    '   │   │  │      │  ',
    '   │   ╰──╯      │  ',
    '   │  · · · · ·  │  ',
    '    ╲            ╱   ',
    '     ╰──────────╯   ',
    '      ╲             ',
    '       ●            ',
  ],
  'one-must-imagine': [
    '   ◉◉◉◉◉            ',
    '  ╱  ◉◉◉◉           ',
    ' ╱   ◉ ╱  ←─╮      ',
    '╱  (>.<)    │       ',
    '   ╱╱  ╲╲   │       ',
    '  ╱      ╲  │       ',
    ' ╱        ╲─╯       ',
    ' ▔▔▔▔▔▔▔▔▔▔▔        ',
    '  ×10 restarts       ',
  ],
};

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

const CARD_WIDTH = 34;
const CARD_HEIGHT = 18;
const CARD_INNER = CARD_WIDTH - 2;

function centerLine(text: string, width: number): string {
  const stripped = stripAnsiForWidth(text);
  if (stripped.length >= width) return text.slice(0, width);
  const pad = Math.floor((width - stripped.length) / 2);
  return ' '.repeat(pad) + text + ' '.repeat(width - stripped.length - pad);
}

function stripAnsiForWidth(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export interface BadgeCard {
  lines: string[];
  width: number;
  height: number;
}

export function renderBadgeCard(
  def: AchievementDef,
  unlock: UnlockedAchievement | null,
  opts?: { dim?: boolean },
): BadgeCard {
  const dim = opts?.dim === true || unlock === null;
  const art = BADGE_ART[def.id] ?? [];

  const lines: string[] = [];

  // Top border
  const category = def.category.toUpperCase();
  const borderLabel = ` ${category} `;
  const topPad = CARD_INNER - borderLabel.length - 2;
  const topLeft = Math.floor(topPad / 2);
  const topRight = topPad - topLeft;
  lines.push(`┌${'─'.repeat(topLeft)}${borderLabel}${'─'.repeat(topRight)}┐`);

  // Blank
  lines.push(`│${' '.repeat(CARD_INNER)}│`);

  // Art (centered, dimmed if locked)
  const artMaxLines = 9;
  const artSlice = art.slice(0, artMaxLines);
  for (const artLine of artSlice) {
    const centered = centerLine(artLine, CARD_INNER);
    lines.push(`│${dim ? dimText(centered) : centered}│`);
  }
  // Pad remaining art lines
  for (let i = artSlice.length; i < artMaxLines; i++) {
    lines.push(`│${' '.repeat(CARD_INNER)}│`);
  }

  // Blank
  lines.push(`│${' '.repeat(CARD_INNER)}│`);

  // Name (centered, bold if unlocked)
  const nameText = unlock !== null ? def.name : `? ${def.name} ?`;
  lines.push(`│${centerLine(nameText, CARD_INNER)}│`);

  // Description (centered, wrapped if needed)
  const descLines = wrapText(def.description, CARD_INNER - 4);
  for (const dl of descLines.slice(0, 2)) {
    const centered = centerLine(dl, CARD_INNER);
    lines.push(`│${dim ? dimText(centered) : centered}│`);
  }
  // Pad to fixed height
  const usedContent = 1 + 1 + artMaxLines + 1 + 1 + Math.min(descLines.length, 2);
  const remaining = CARD_HEIGHT - 2 - usedContent; // -2 for borders
  for (let i = 0; i < remaining; i++) {
    if (i === remaining - 1 && unlock !== null) {
      // Unlock date on last content line
      const dateStr = unlock.unlockedAt.slice(0, 10);
      lines.push(`│${centerLine(dimText(dateStr), CARD_INNER)}│`);
    } else {
      lines.push(`│${' '.repeat(CARD_INNER)}│`);
    }
  }

  // Bottom border
  lines.push(`└${'─'.repeat(CARD_INNER)}┘`);

  return { lines, width: CARD_WIDTH, height: lines.length };
}

function dimText(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? `${current} ${word}` : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// Gallery data
// ---------------------------------------------------------------------------

export interface BadgeGallery {
  achievements: AchievementDef[];
  unlocked: Map<AchievementId, UnlockedAchievement>;
  currentIndex: number;
  total: number;
}

export function createBadgeGallery(
  unlockedAchievements: UnlockedAchievement[],
  startIndex?: number,
): BadgeGallery {
  const unlocked = new Map<AchievementId, UnlockedAchievement>();
  for (const a of unlockedAchievements) {
    unlocked.set(a.id, a);
  }

  // Sort: unlocked first (by unlock date), then locked
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const aUnlocked = unlocked.has(a.id);
    const bUnlocked = unlocked.has(b.id);
    if (aUnlocked && !bUnlocked) return -1;
    if (!aUnlocked && bUnlocked) return 1;
    if (aUnlocked && bUnlocked) {
      const aDate = unlocked.get(a.id)!.unlockedAt;
      const bDate = unlocked.get(b.id)!.unlockedAt;
      return aDate.localeCompare(bDate);
    }
    return 0; // preserve category order for locked
  });

  return {
    achievements: sorted,
    unlocked,
    currentIndex: startIndex ?? 0,
    total: sorted.length,
  };
}

export function galleryNext(gallery: BadgeGallery): number {
  return (gallery.currentIndex + 1) % gallery.total;
}

export function galleryPrev(gallery: BadgeGallery): number {
  return (gallery.currentIndex - 1 + gallery.total) % gallery.total;
}

export { CARD_WIDTH, CARD_HEIGHT };
