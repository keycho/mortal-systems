# the wall service for railway: showrunner + terrarium in one process on
# one port (apps/showrunner/src/serve.ts). build context is the REPO ROOT
# (railway: root directory "/", dockerfile path "apps/showrunner/Dockerfile").
# ffmpeg ships in the image because STREAM_PROVIDER=mux encodes here.

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY tests ./tests
COPY scripts ./scripts
COPY eslint.config.mjs .npmrc ./
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=showrunner

FROM node:22-slim
# ffmpeg encodes the hls stream; chromium is the agents' actual browser;
# the noto fonts keep yuki's japanese from rendering as tofu boxes.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates chromium \
    fonts-liberation fonts-noto-core fonts-noto-cjk \
    util-linux \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo ./
ENV NODE_ENV=production
# state must live on a mounted volume: railway -> service -> volume at /data.
# without one, every deploy is a mass death the stream never recorded.
ENV MORTAL_ROOT=/data
# headless-in-docker reality, and the tier-1 contract: the entrypoint
# drops from root to the node user (chromium refuses to sandbox under
# uid 0), and with CHROME_SANDBOX=1 the service probes a sandboxed launch
# at boot. probe passes (host kernel allows unprivileged user
# namespaces) -> browsers run sandboxed and external allowlisted reading
# is on. probe fails -> browsers run unsandboxed, external navigation is
# gated OFF entirely (agents browse only pages this service serves), and
# /health names the reason. external pages never render in an
# unsandboxed browser; that is a hard rule, not a preference.
# --disable-dev-shm-usage is always passed: container /dev/shm is 64mb,
# shared memory goes to /tmp instead.
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_SANDBOX=1
RUN chmod +x /repo/apps/showrunner/docker-entrypoint.sh
EXPOSE 4925
ENTRYPOINT ["/repo/apps/showrunner/docker-entrypoint.sh"]
CMD ["node", "apps/showrunner/dist/serve.js"]
