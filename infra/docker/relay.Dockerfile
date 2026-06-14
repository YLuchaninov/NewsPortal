FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/build-node-runtime.mjs infra/tooling/build-node-runtime.mjs
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/packages/contracts/tsconfig.json runtime/node/packages/contracts/tsconfig.json
COPY runtime/node/packages/contracts/src runtime/node/packages/contracts/src
COPY runtime/node/services/relay/package.json runtime/node/services/relay/package.json
COPY runtime/node/services/relay/tsconfig.json runtime/node/services/relay/tsconfig.json
COPY runtime/node/services/relay/src runtime/node/services/relay/src

RUN pnpm install --frozen-lockfile
RUN node infra/tooling/build-node-runtime.mjs --service=relay

FROM node:22-alpine AS runtime

WORKDIR /workspace

ENV NODE_ENV=production

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/services/relay/package.json runtime/node/services/relay/package.json

RUN pnpm install --frozen-lockfile --prod --filter @signalops/relay...

COPY --from=builder --chown=node:node /workspace/build/node/services/relay build/node/services/relay
COPY --chown=node:node database/migrations database/migrations

RUN chown -R node:node /workspace

USER node

CMD ["node", "build/node/services/relay/main.mjs"]
