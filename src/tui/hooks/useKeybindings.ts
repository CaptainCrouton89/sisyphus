import { useInput } from 'ink';

export interface KeybindingHandlers {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEnter: () => void;
  onLeft: () => void;
  onRight: () => void;
  onSpace: () => void;
  onTab: () => void;
  onMessage: () => void;
  onKill: () => void;
  onGoToWindow: () => void;
  onEditGoal: () => void;
  onNewSession: () => void;
  onClaude: () => void;
  onOpenPlan: () => void;
  onQuit: () => void;
  onReRun: () => void;
  onJumpToPane: () => void;
  onResume: () => void;
  onContinue: () => void;
  onRestartAgent: () => void;
  onRollback: () => void;
  onToggleLogs: () => void;
  onEdit: () => void;
}

export function useKeybindings(handlers: KeybindingHandlers, isActive: boolean): void {
  useInput(
    (input, key) => {
      if (key.upArrow) { handlers.onMoveUp(); return; }
      if (key.downArrow) { handlers.onMoveDown(); return; }
      if (key.leftArrow) { handlers.onLeft(); return; }
      if (key.rightArrow) { handlers.onRight(); return; }
      if (key.return) { handlers.onEnter(); return; }
      if (key.tab) { handlers.onTab(); return; }
      if (input === ' ') { handlers.onSpace(); return; }
      if (input === 'm') { handlers.onMessage(); return; }
      if (input === 'k') { handlers.onKill(); return; }
      if (input === 'w') { handlers.onGoToWindow(); return; }
      if (input === 'g') { handlers.onEditGoal(); return; }
      if (input === 'n') { handlers.onNewSession(); return; }
      if (input === 'c') { handlers.onClaude(); return; }
      if (input === 'p') { handlers.onOpenPlan(); return; }
      if (input === 'q') { handlers.onQuit(); return; }
      if (input === 'r') { handlers.onReRun(); return; }
      if (input === 'j') { handlers.onJumpToPane(); return; }
      if (input === 'R') { handlers.onResume(); return; }
      if (input === 'C') { handlers.onContinue(); return; }
      if (input === 'x') { handlers.onRestartAgent(); return; }
      if (input === 'b') { handlers.onRollback(); return; }
      if (input === 'l') { handlers.onToggleLogs(); return; }
      if (input === 'e') { handlers.onEdit(); return; }
    },
    { isActive },
  );
}
