FROM node:22-bookworm-slim AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/build-node-runtime.mjs infra/tooling/build-node-runtime.mjs
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY services/fetchers/package.json services/fetchers/package.json
COPY services/fetchers/tsconfig.json services/fetchers/tsconfig.json
COPY services/fetchers/src services/fetchers/src

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
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/fetchers/package.json services/fetchers/package.json

RUN pnpm install --frozen-lockfile --prod --filter @newsportal/fetchers... \
  && pnpm --filter @newsportal/fetchers exec playwright install --with-deps chromium \
  && pnpm store prune

COPY --from=builder --chown=node:node /workspace/services/fetchers/dist services/fetchers/dist

RUN chown -R node:node /workspace /ms-playwright

USER node

CMD ["node", "services/fetchers/dist/main.mjs"]
