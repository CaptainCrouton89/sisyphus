# Stage 1: base — node:22 full image (glibc + build tools required for node-pty)
FROM node:22 AS base

# Pre-seed config before npm install so autoUpdate is disabled from the start
RUN mkdir -p /root/.sisyphus && \
    echo '{"autoUpdate":false}' > /root/.sisyphus/config.json

# Install sisyphi from tarball
COPY sisyphi-*.tgz /tmp/
RUN npm install -g /tmp/sisyphi-*.tgz

# Copy test files
COPY lib/ /tests/lib/
COPY suites/ /tests/suites/
RUN chmod +x /tests/lib/* /tests/suites/*

# Stage 2: tmux — base + tmux + real Claude Code + claude wrapper
FROM base AS tmux

RUN apt-get update && \
    apt-get install -y --no-install-recommends tmux git && \
    rm -rf /var/lib/apt/lists/*

# Install real Claude Code (for plugin/marketplace commands)
RUN npm install -g @anthropic-ai/claude-code

# Add crouton-kit marketplace at build time (needs git + network)
RUN node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js plugin marketplace add CaptainCrouton89/crouton-kit

# Wrapper: routes `plugin` subcommands to real Claude Code, everything else to sleep
COPY lib/claude-mock.sh /usr/local/bin/claude
RUN chmod +x /usr/local/bin/claude

# Stage 3: full — tmux + neovim + verdaccio (for auto-updater integration tests)
FROM tmux AS full

RUN apt-get update && \
    apt-get install -y --no-install-recommends neovim curl && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g verdaccio
