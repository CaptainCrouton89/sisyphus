/**
 * Gloam palette — true-color ANSI SGR codes mirroring the Neovim gloam theme.
 *
 * Each constant is a partial SGR sequence (no leading `\x1b[`, no trailing `m`)
 * suitable for `Seg.fg` and `Seg.bg` fields. Foreground codes use the `38;2;…`
 * 24-bit form; background codes use `48;2;…`.
 *
 * Source palette: ~/.config/nvim/lua/gloam/palette.lua
 */

function fg(r: number, g: number, b: number): string {
  return `38;2;${r};${g};${b}`;
}

function bg(r: number, g: number, b: number): string {
  return `48;2;${r};${g};${b}`;
}

export const GLOAM = {
  // Foregrounds — warm off-whites
  fg0: fg(226, 217, 198), // brightest
  fg1: fg(212, 203, 184), // primary
  fg2: fg(176, 168, 152), // secondary
  fg3: fg(135, 127, 111), // tertiary (comments, quotes)
  fg4: fg(94, 88, 78),    // quaternary (line numbers, concealed)

  // Accents
  red:    fg(212, 116, 102),
  orange: fg(216, 151, 104),
  yellow: fg(212, 173, 106),
  green:  fg(169, 177, 110),
  aqua:   fg(130, 173, 138),
  blue:   fg(124, 168, 160),
  purple: fg(196, 138, 158),

  // Bright accents — heading text, emphasis
  bright_red:    fg(232, 138, 126),
  bright_orange: fg(236, 173, 128),
  bright_yellow: fg(232, 196, 132),
  bright_green:  fg(188, 197, 126),
  bright_blue:   fg(144, 190, 182),
  bright_purple: fg(216, 160, 180),

  // Dim backgrounds — heading/code-block tints
  bg_dim_red:    bg(58, 28, 24),
  bg_dim_orange: bg(58, 40, 18),
  bg_dim_yellow: bg(51, 46, 18),
  bg_dim_green:  bg(31, 48, 24),
  bg_dim_aqua:   bg(20, 46, 36),
  bg_dim_blue:   bg(21, 40, 56),
  bg_dim_purple: bg(50, 24, 40),

  // Surface backgrounds
  bg_bg1:        bg(37, 38, 41),  // cursorline / inline-code tint
  bg_bg2:        bg(45, 47, 51),  // float/popup
  bg_sel_yellow: bg(61, 50, 37),  // active selection
} as const;

export type GloamKey = keyof typeof GLOAM;
