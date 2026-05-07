**Always mutate state through `src/daemon/state.ts`** — atomic temp-file + rename via `atomicWrite`; never call `writeFileSync` on state JSON directly.
