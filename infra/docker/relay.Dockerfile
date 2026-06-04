FROM node:22-alpine AS builder

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY infra/tooling/build-node-runtime.mjs infra/tooling/build-node-runtime.mjs
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY services/relay/package.json services/relay/package.json
COPY services/relay/tsconfig.json services/relay/tsconfig.json
COPY services/relay/src services/relay/src

RUN pnpm install --frozen-lockfile
RUN node infra/tooling/build-node-runtime.mjs --service=relay

FROM node:22-alpine AS runtime

WORKDIR /workspace

ENV NODE_ENV=production

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/relay/package.json services/relay/package.json

RUN pnpm install --frozen-lockfile --prod --filter @signalops/relay...

COPY --from=builder --chown=node:node /workspace/services/relay/dist services/relay/dist
COPY --chown=node:node database/migrations database/migrations

RUN chown -R node:node /workspace

USER node

CMD ["node", "services/relay/dist/main.mjs"]
