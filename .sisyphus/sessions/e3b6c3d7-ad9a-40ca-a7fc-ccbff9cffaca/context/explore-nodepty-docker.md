# node-pty Docker/Linux Compilation Requirements

## 1. No Linux prebuilds

node-pty 1.1.0 ships prebuilds for: `darwin-arm64`, `darwin-x64`, `win32-arm64`, `win32-x64`.

**No Linux prebuilds exist.** No `linux-x64/`, no `linux-arm64/`, no musl variants.

## 2. Install flow on Linux

The `install` script in package.json: `node scripts/prebuild.js || node-gyp rebuild`

`prebuild.js` checks if `prebuilds/linux-x64/` exists. It won't. So **node-gyp rebuild always runs on Linux**.

## 3. Build requirements (from binding.gyp)

On non-Windows/non-Mac, node-pty compiles `src/unix/pty.cc` and links `-lutil`.

Required build tools:
- **python3** — node-gyp dependency
- **make** — node-gyp uses make on Linux
- **g++/gcc** — C++ compiler (node-addon-api is C++)
- **libc development headers** — for `-lutil` (libutil is part of glibc)
- **node development headers** — node-gyp downloads these automatically

## 4. Alpine (musl) vs Debian (glibc)

The binding.gyp links `-lutil` which is a glibc library (`libutil.so`). On musl/Alpine:
- musl includes `forkpty()` in its main libc but does NOT provide a separate `libutil`
- node-gyp will fail with `-lutil` link error on Alpine unless patched
- **Recommendation: Use Debian/Ubuntu (glibc), not Alpine**

## 5. Minimal Debian apt packages

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
```

`node:22-slim` already has libc6 (glibc). The above three packages are the minimal set for node-gyp to compile node-pty.

Alternatively, `node:22` (non-slim) includes build-essential and python3 already — no extra apt-get needed.

## 6. Impact on `npm install -g sisyphi-x.x.x.tgz`

`npm pack` includes `prebuilds/` in the tarball (listed in `files` array). But since there are no Linux prebuilds in the directory, installing from tgz on Linux will still trigger `node-gyp rebuild`. Build tools must be present at install time.

## Summary for Docker integration tests

| Base image | Extra packages needed | Works? |
|---|---|---|
| `node:22` | None | Yes |
| `node:22-slim` | `python3 make g++` | Yes |
| `node:22-alpine` | Not recommended | Likely fails (-lutil) |

**Recommendation**: Use `node:22` for simplicity, or `node:22-slim` + build deps if image size matters.
