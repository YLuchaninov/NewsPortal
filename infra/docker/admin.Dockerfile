FROM node:22-alpine AS builder

WORKDIR /workspace

ARG NEWSPORTAL_APP_BASE_URL=http://127.0.0.1:4322/
ENV NEWSPORTAL_APP_BASE_URL=$NEWSPORTAL_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/bff-server/package.json packages/bff-server/package.json
COPY packages/bff-server/tsconfig.json packages/bff-server/tsconfig.json
COPY packages/bff-server/src packages/bff-server/src
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig.json packages/config/tsconfig.json
COPY packages/config/src packages/config/src
COPY packages/content-safety/package.json packages/content-safety/package.json
COPY packages/content-safety/tsconfig.json packages/content-safety/tsconfig.json
COPY packages/content-safety/src packages/content-safety/src
COPY packages/control-plane/package.json packages/control-plane/package.json
COPY packages/control-plane/tsconfig.json packages/control-plane/tsconfig.json
COPY packages/control-plane/src packages/control-plane/src
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/sdk/tsconfig.json packages/sdk/tsconfig.json
COPY packages/sdk/src packages/sdk/src
COPY packages/ui/package.json packages/ui/package.json
COPY packages/ui/tsconfig.json packages/ui/tsconfig.json
COPY packages/ui/src packages/ui/src
COPY apps/admin/package.json apps/admin/package.json
COPY apps/admin/astro.config.mjs apps/admin/astro.config.mjs
COPY apps/admin/tsconfig.json apps/admin/tsconfig.json
COPY apps/admin/src apps/admin/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsportal/admin build

FROM node:22-alpine AS runtime

WORKDIR /workspace

ARG NEWSPORTAL_APP_BASE_URL=http://127.0.0.1:4322/
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4322
ENV NEWSPORTAL_APP_BASE_URL=$NEWSPORTAL_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/bff-server/package.json packages/bff-server/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/content-safety/package.json packages/content-safety/package.json
COPY packages/control-plane/package.json packages/control-plane/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/admin/package.json apps/admin/package.json

RUN pnpm install --frozen-lockfile --prod --filter @newsportal/admin...

COPY --from=builder --chown=node:node /workspace/apps/admin/dist apps/admin/dist

RUN chown -R node:node /workspace

USER node

CMD ["node", "apps/admin/dist/server/entry.mjs"]
