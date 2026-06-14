FROM node:22-alpine AS builder

WORKDIR /workspace

ARG SIGNALOPS_APP_BASE_URL=http://127.0.0.1:4322/
ENV SIGNALOPS_APP_BASE_URL=$SIGNALOPS_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/link-node-runtime-deps.mjs infra/tooling/link-node-runtime-deps.mjs
COPY runtime/node/packages/bff-server/package.json runtime/node/packages/bff-server/package.json
COPY runtime/node/packages/bff-server/tsconfig.json runtime/node/packages/bff-server/tsconfig.json
COPY runtime/node/packages/bff-server/src runtime/node/packages/bff-server/src
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
COPY runtime/node/packages/ui/package.json runtime/node/packages/ui/package.json
COPY runtime/node/packages/ui/tsconfig.json runtime/node/packages/ui/tsconfig.json
COPY runtime/node/packages/ui/src runtime/node/packages/ui/src
COPY runtime/node/apps/admin/package.json runtime/node/apps/admin/package.json
COPY runtime/node/apps/admin/astro.config.mjs runtime/node/apps/admin/astro.config.mjs
COPY runtime/node/apps/admin/tsconfig.json runtime/node/apps/admin/tsconfig.json
COPY runtime/node/apps/admin/src runtime/node/apps/admin/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @signalops/admin build

FROM node:22-alpine AS runtime

WORKDIR /workspace

ARG SIGNALOPS_APP_BASE_URL=http://127.0.0.1:4322/
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4322
ENV SIGNALOPS_APP_BASE_URL=$SIGNALOPS_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY runtime/node/packages/bff-server/package.json runtime/node/packages/bff-server/package.json
COPY runtime/node/packages/config/package.json runtime/node/packages/config/package.json
COPY runtime/node/packages/content-safety/package.json runtime/node/packages/content-safety/package.json
COPY runtime/node/packages/control-plane/package.json runtime/node/packages/control-plane/package.json
COPY runtime/node/packages/contracts/package.json runtime/node/packages/contracts/package.json
COPY runtime/node/packages/sdk/package.json runtime/node/packages/sdk/package.json
COPY runtime/node/packages/ui/package.json runtime/node/packages/ui/package.json
COPY runtime/node/apps/admin/package.json runtime/node/apps/admin/package.json

RUN pnpm install --frozen-lockfile --prod --filter @signalops/admin...

COPY --from=builder --chown=node:node /workspace/build/node/apps/admin build/node/apps/admin

RUN chown -R node:node /workspace

USER node

CMD ["node", "build/node/apps/admin/server/entry.mjs"]
