/**
 * Sessions currently transitioning through yield→respawn.
 * The pane monitor must not pause these — the window may be temporarily
 * empty between killing the orchestrator pane and spawning a new one.
 */
export const respawningSessions = new Set<string>();
