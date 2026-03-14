# TUI Components

React + Ink terminal UI components for session monitoring and control.

## Patterns

- **Functional components** with hooks (`useState`, `useEffect`, `useRef`, `useMemo`)
- **Props-based composition** — components receive session/agent state and callbacks
- **Box + Text primitives** — Ink's layout system (no external styling)
- **Color/styling via props** — colors passed as strings (e.g., `color="yellow"`)
- **Content builders as pure functions** — e.g., `buildPlanLines()` — separates formatting logic from React rendering
- **Format utilities** — use `stripFrontmatter()`, `cleanMarkdown()`, `wrapText()` for markdown processing
- **Dynamic layout allocation** — calculate section heights based on available space; allocate remaining to high-priority content (plan gets lion's share)
- **Input mode isolation** — `useInput()` with `isActive` flag to toggle input capture per component

## Key Components

- **InputBar**: Multi-mode input (`'navigate'`, `'message'`, `'new-session'`, `'resume'`, `'continue'`, `'edit-goal'`, `'report-detail'`, `'rollback'`) with optional text validation and mode-specific prompts
- **StatusLine**: Dynamic help text (navigate mode vs. input mode)
- **SessionDetail**: Session overview pane with dynamic layout budgeting — task, status, plan, cycles, messages, completion report, logs
- **PlanView**: Formatted plan.md excerpt (headers bold/indented, lists clean, long lines wrapped) with truncation indicator
- **CycleHistory**: Timeline of orchestrator cycles with mode labels
- **MessageLog**: Session messages with truncation
- **PaneOutput**: Real-time pane output display with scrolling
- **SessionTree**: Hierarchical view of orchestrator + agents
- **ControlPanel**: Interactive buttons/shortcuts for daemon commands
- **ReportView**: Scrollable agent report display with wrapped content, keyboard nav (↑↓ scroll, [ ] page, esc/enter close)

## Rendering Complex Content

**Use dedicated builder functions** for complex formatting:
- Return a simple data structure (`PlanLine[]`, `ReportLine[]`, etc.)
- Keeps formatting logic separate from React rendering
- Format utilities: `stripFrontmatter()`, `cleanMarkdown()`, `wrapText()`
- Memoize builder output if component re-renders frequently

**Section headers pattern** (SessionDetail):
- Use `SectionHeader` component with `label`, optional `count`, and `color`
- Colored label with count badge: `▎ LABEL (count)`

**Truncation indicators**:
- Replace last line with `… [key] open in editor` if content exceeds limit
- Signals to user that more content exists

## Layout & Spacing

- **Dynamic height allocation**: Calculate available lines, budget sections based on content type and priority
- **Plan section**: Gets remaining space after fixed headers and compact sections
- **Compact sections** (cycles, messages, logs): Fixed max heights + header + blank line
- **Section separators**: Use blank lines (`<Text>{' '}</Text>`) between sections for breathing room
- **Content width**: Account for borders, padding, indentation (`width - 4` or more depending on nesting)

## Input Modes & Validation

**InputBar** uses mode-specific behavior:
- **Requires text**: `'message'`, `'new-session'`, `'edit-goal'`, `'rollback'` (Enter without text rejected)
- **Optional text**: `'resume'`, `'continue'` (Enter without text allowed)
- **No input**: `'navigate'` shows help, `'report-detail'` renders null

## Constraints

- Components must be **synchronous** — async operations handled by parent (TUI root)
- No external dependencies beyond React, Ink, `@r-cli/sdk`
- Terminal width/height constraints — test with `--width` and `--height` flags
- Polling updates → components re-render on state change, not continuous streams
- Scroll bounds: clamp user input to `[0, maxScroll]` to prevent overflow

## Integration

- Components receive session state from parent (`App.tsx` or similar root)
- Callbacks trigger daemon commands via socket client
- PaneOutput reads from `.sisyphus/sessions/{sessionId}/output/{paneId}.log` files
