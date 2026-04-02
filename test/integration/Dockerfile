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

# Stage 2: tmux — base + tmux + claude mock (session tests need claude)
FROM base AS tmux

RUN apt-get update && \
    apt-get install -y --no-install-recommends tmux && \
    rm -rf /var/lib/apt/lists/*

# Claude mock: stays alive like a real Claude session (reads stdin until killed)
RUN printf '#!/bin/sh\nexec sleep 300\n' > /usr/local/bin/claude && \
    chmod +x /usr/local/bin/claude

# Stage 3: full — tmux + neovim + verdaccio (for auto-updater integration tests)
FROM tmux AS full

RUN apt-get update && \
    apt-get install -y --no-install-recommends neovim curl && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g verdaccio
