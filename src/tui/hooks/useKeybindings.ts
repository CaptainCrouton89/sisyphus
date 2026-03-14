import { useInput } from 'ink';

export interface KeybindingHandlers {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onTab: () => void;
  onEnter: () => void;
  onMessage: () => void;
  onKill: () => void;
  onGoToWindow: () => void;
  onNewSession: () => void;
  onClaude: () => void;
  onOpenPlan: () => void;
  onQuit: () => void;
  onReRun: () => void;
  onJumpToPane: () => void;
  onResume: () => void;
  onContinue: () => void;
}

export function useKeybindings(handlers: KeybindingHandlers, isActive: boolean): void {
  useInput(
    (input, key) => {
      if (key.upArrow) { handlers.onMoveUp(); return; }
      if (key.downArrow) { handlers.onMoveDown(); return; }
      if (key.tab) { handlers.onTab(); return; }
      if (key.return) { handlers.onEnter(); return; }
      if (input === 'm') { handlers.onMessage(); return; }
      if (input === 'k') { handlers.onKill(); return; }
      if (input === 'g') { handlers.onGoToWindow(); return; }
      if (input === 'n') { handlers.onNewSession(); return; }
      if (input === 'c') { handlers.onClaude(); return; }
      if (input === 'p') { handlers.onOpenPlan(); return; }
      if (input === 'q') { handlers.onQuit(); return; }
      if (input === 'r') { handlers.onReRun(); return; }
      if (input === 'j') { handlers.onJumpToPane(); return; }
      if (input === 'R') { handlers.onResume(); return; }
      if (input === 'C') { handlers.onContinue(); return; }
    },
    { isActive },
  );
}
