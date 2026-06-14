FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/build-node-runtime.mjs infra/tooling/build-node-runtime.mjs
COPY runtime/node/packages/config/package.json runtime/node/packages/config/package.json
COPY runtime/node/packages/config/tsconfig.json runtime/node/packages/config/tsconfig.json
COPY runtime/node/packages/config/src runtime/node/packages/config/src
COPY runtime/node/packages/content-safety/package.json runtime/node/packages/content-safety/package.json
COPY runtime/node/packages/content-safety/tsconfig.json runtime/node/packages/content-safety/tsconfig.json
COPY runtime/node/packages/content-safety/src runtime/node/packages/content-safety/src
COPY runtime/node/packages/control-plane/package.json runtime/node/packages/control-plane/package.json
COPY runtime/node/packages/control-plane/tsconfig.json runtime/node/packages/control-plane/tsconfig.json
COPY runtime/node/packages/control-plane/src runtime/node/packages/control-plane/src
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/packages/contracts/tsconfig.json runtime/node/packages/contracts/tsconfig.json
COPY runtime/node/packages/contracts/src runtime/node/packages/contracts/src
COPY runtime/node/packages/sdk/package.json runtime/node/packages/sdk/package.json
COPY runtime/node/packages/sdk/tsconfig.json runtime/node/packages/sdk/tsconfig.json
COPY runtime/node/packages/sdk/src runtime/node/packages/sdk/src
COPY runtime/node/apps/admin/package.json runtime/node/apps/admin/package.json
COPY runtime/node/apps/admin/tsconfig.json runtime/node/apps/admin/tsconfig.json
COPY runtime/node/apps/admin/src runtime/node/apps/admin/src
COPY runtime/node/services/mcp/package.json runtime/node/services/mcp/package.json
COPY runtime/node/services/mcp/tsconfig.json runtime/node/services/mcp/tsconfig.json
COPY runtime/node/services/mcp/src runtime/node/services/mcp/src

RUN pnpm install --frozen-lockfile
RUN node infra/tooling/build-node-runtime.mjs --service=mcp

FROM node:22-alpine AS runtime

WORKDIR /workspace

ENV NODE_ENV=production

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY runtime/node/packages/config/package.json runtime/node/packages/config/package.json
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/packages/control-plane/package.json runtime/node/packages/control-plane/package.json
COPY runtime/node/packages/sdk/package.json runtime/node/packages/sdk/package.json
COPY runtime/node/services/mcp/package.json runtime/node/services/mcp/package.json

RUN pnpm install --frozen-lockfile --prod --filter @signalops/mcp...

COPY --from=builder --chown=node:node /workspace/build/node/services/mcp build/node/services/mcp

RUN chown -R node:node /workspace

USER node

CMD ["node", "build/node/services/mcp/main.mjs"]
