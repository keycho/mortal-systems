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
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY --from=build /repo ./
ENV NODE_ENV=production
# state must live on a mounted volume: railway -> service -> volume at /data.
# without one, every deploy is a mass death the stream never recorded.
ENV MORTAL_ROOT=/data
EXPOSE 4925
CMD ["node", "apps/showrunner/dist/serve.js"]
