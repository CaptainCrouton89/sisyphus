---
name: git-management
description: >
  Set up and manage git worktree isolation for parallel agents. How to analyze a project for worktree config, create .sisyphus/worktree.json, handle merge conflicts surfaced by the daemon, and decide when to use --worktree vs not.
---

# Git Worktree Management

## Setting Up Worktree Config

Analyze the project to determine what gitignored files/directories agents need. Create `.sisyphus/worktree.json`:

### Config Format

```json
{
  "copy": [],
  "clone": [],
  "symlink": [],
  "init": ""
}
```

**Fields:**
- `copy` — Files/dirs to copy from main worktree (e.g., `.env`, `.env.local`). Use for small files that may need per-worktree modifications.
- `clone` — Files/dirs to APFS copy-on-write clone (e.g., `node_modules`, `vendor`, `target`). Near-zero cost on macOS. Falls back to regular copy on other systems. Use for large directories.
- `symlink` — Files/dirs to symlink from main worktree. Use for things that should stay in sync across all worktrees.
- `init` — Shell command to run after worktree setup (e.g., `npm install`, `pip install -e .`, `cargo build`). Runs with cwd set to the worktree. Failures are logged but don't block agent startup.

**Note:** `.sisyphus` and `.claude` directories are ALWAYS symlinked automatically — you don't need to include them.

### Analysis Checklist

Scan the project root for gitignored files that agents will need:

1. **Environment files**: `.env`, `.env.local`, `.env.development` — usually `copy` (agents may need different ports)
2. **Dependencies**: `node_modules`, `vendor`, `target`, `.venv`, `__pycache__` — use `clone` for large dirs
3. **Build artifacts**: `dist`, `.next`, `build`, `.turbo` — usually `clone` for warm cache, or skip and let `init` rebuild
4. **Tool config**: `.eslintcache`, `.pretterircache`, `.tsbuildinfo` — usually skip, tools regenerate
5. **Other dotfiles**: Check what exists at root. Err on the side of including too much rather than too little.

### Example Configs

**Node.js (npm/yarn):**
```json
{
  "copy": [".env", ".env.local"],
  "clone": ["node_modules"],
  "init": "npm install --prefer-offline"
}
```

**Node.js (pnpm):**
```json
{
  "copy": [".env"],
  "clone": [],
  "init": "pnpm install --frozen-lockfile"
}
```

**Python:**
```json
{
  "copy": [".env"],
  "clone": [".venv"],
  "init": "source .venv/bin/activate && pip install -e ."
}
```

**Rust:**
```json
{
  "clone": ["target"],
  "init": "cargo build"
}
```

**No dependencies (simple project):**
```json
{
  "copy": [".env"]
}
```

## Handling Merge Conflicts

When the daemon merges agent branches back, conflicts appear in the `## Worktrees` section of your state block. For each conflicting agent you'll see:
- The branch name (still exists, unmerged)
- The worktree path (still exists on disk)
- The conflict details (git merge stderr output)

**Resolution approaches:**
1. **Spawn a resolution agent** in the conflicting worktree to manually resolve and commit
2. **Rebase the branch** onto current HEAD and resolve conflicts
3. **Cherry-pick specific commits** instead of merging the whole branch
4. **Discard the branch** if the work can be redone more cleanly

After resolution, the branch can be merged manually or left for the next cycle's automatic merge attempt.

## When to Use Worktrees

**Use `--worktree`** when:
- Multiple agents will work on different features that touch overlapping files
- Agents need to make structural changes (renames, moves, deletes)
- The task involves feature branches that should be independently testable

**Skip `--worktree`** when:
- Agents work on completely separate files with no overlap
- Quick fixes or single-file changes
- Agents only read code (exploration, review)
