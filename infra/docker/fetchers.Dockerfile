FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/build-node-runtime.mjs infra/tooling/build-node-runtime.mjs
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/packages/contracts/tsconfig.json runtime/node/packages/contracts/tsconfig.json
COPY runtime/node/packages/contracts/src runtime/node/packages/contracts/src
COPY runtime/node/services/fetchers/package.json runtime/node/services/fetchers/package.json
COPY runtime/node/services/fetchers/tsconfig.json runtime/node/services/fetchers/tsconfig.json
COPY runtime/node/services/fetchers/src runtime/node/services/fetchers/src

RUN pnpm install --frozen-lockfile
RUN node infra/tooling/build-node-runtime.mjs --service=fetchers

FROM node:22-bookworm-slim AS runtime

WORKDIR /workspace

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN npm install -g pnpm@10.11.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/services/fetchers/package.json runtime/node/services/fetchers/package.json

RUN pnpm install --frozen-lockfile --prod --filter @signalops/fetchers... \
  && pnpm --filter @signalops/fetchers exec playwright install --with-deps chromium \
  && pnpm store prune

COPY --from=builder --chown=node:node /workspace/build/node/services/fetchers build/node/services/fetchers

RUN chown -R node:node /workspace /ms-playwright

USER node

CMD ["node", "build/node/services/fetchers/main.mjs"]
