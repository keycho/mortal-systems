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
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo ./
ENV NODE_ENV=production
# state must live on a mounted volume: railway -> service -> volume at /data.
# without one, every deploy is a mass death the stream never recorded.
ENV MORTAL_ROOT=/data
# headless-in-docker reality: the process runs as root, so chromium's own
# sandbox cannot start (it needs user namespaces the platform does not
# grant); we launch with the sandbox off (playwright chromiumSandbox:false,
# the supported equivalent of --no-sandbox) and pass
# --disable-dev-shm-usage because container /dev/shm is tiny (64mb) —
# shared memory goes to /tmp instead. the honest risk math for v1: these
# browsers render only pages this service itself serves. set
# CHROME_SANDBOX=1 on userns-capable hosts, and before open-web browsing
# ships the sandbox becomes mandatory.
ENV CHROME_PATH=/usr/bin/chromium
EXPOSE 4925
CMD ["node", "apps/showrunner/dist/serve.js"]
