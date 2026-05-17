## Commands
```bash
pnpm build        # tsup (outputs dist/)
pnpm test         # node --import tsx --test src/__tests__/*.test.ts
pnpm dev          # tsup --watch
```

## Constraints
- `@crouton-kit/humanloop` is NOT on npm — `pnpm install` on a fresh clone will 404. Must be linked via yalc first: `yalc link --no-pure @crouton-kit/humanloop` populates `.yalc/` which `file:.yalc/@crouton-kit/humanloop` resolves against.
