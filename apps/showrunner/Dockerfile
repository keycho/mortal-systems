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
    xvfb x11-utils \
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
# the launch flags are measured, not fixed: the probe walks a ladder of
# combinations (namespace sandbox vs debian's setuid helper, /dev/shm vs
# /tmp for shared memory) and hands the one that survived to every
# identity's browser, so a passing probe is evidence about the browsers
# that follow. /health carries the winning flags, the container facts it
# measured (/dev/shm size, memory ceiling, missing libraries) and
# chromium's own stderr from anything that failed.
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROME_SANDBOX=1
# the browsers are the show. each identity gets a private Xvfb screen and
# opens a real chromium window on it, so the tabs, the toolbar and the
# url bar are inside the captured frame -- a cdp screencast draws the
# page alone and leaves out the browser a viewer would recognise. ffmpeg
# grabs the screen with x11grab. an identity whose screen or headful
# launch fails falls back to headless viewport capture and keeps its
# channel; /health names the mode per agent. WALL_HEADFUL=0 turns the
# whole thing off.
ENV WALL_HEADFUL=1
ENV WALL_XVFB_BASE=99
# debian's chromium ships a setuid sandbox helper and prefers it over the
# namespace sandbox. if it is not root-owned mode 4755 chromium aborts
# outright rather than run unsandboxed -- a browser that starts and dies
# on a host whose namespaces were fine all along. some layer exporters
# drop the setuid bit, so it is restored here explicitly. where the
# platform forbids it anyway (no-new-privileges), the probe's
# --disable-setuid-sandbox rungs keep the sandbox and build it from user
# namespaces instead.
RUN if [ -f /usr/lib/chromium/chrome-sandbox ]; then \
      chown root:root /usr/lib/chromium/chrome-sandbox \
      && chmod 4755 /usr/lib/chromium/chrome-sandbox; \
    fi
RUN chmod +x /repo/apps/showrunner/docker-entrypoint.sh
EXPOSE 4925
ENTRYPOINT ["/repo/apps/showrunner/docker-entrypoint.sh"]
CMD ["node", "apps/showrunner/dist/serve.js"]
