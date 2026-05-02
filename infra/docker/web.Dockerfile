FROM node:22-alpine AS builder

WORKDIR /workspace

ARG NEWSPORTAL_APP_BASE_URL=http://127.0.0.1:4321/
ENV NEWSPORTAL_APP_BASE_URL=$NEWSPORTAL_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig.json packages/config/tsconfig.json
COPY packages/config/src packages/config/src
COPY packages/content-safety/package.json packages/content-safety/package.json
COPY packages/content-safety/tsconfig.json packages/content-safety/tsconfig.json
COPY packages/content-safety/src packages/content-safety/src
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/sdk/tsconfig.json packages/sdk/tsconfig.json
COPY packages/sdk/src packages/sdk/src
COPY packages/ui/package.json packages/ui/package.json
COPY packages/ui/tsconfig.json packages/ui/tsconfig.json
COPY packages/ui/src packages/ui/src
COPY apps/web/package.json apps/web/package.json
COPY apps/web/astro.config.mjs apps/web/astro.config.mjs
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/public apps/web/public
COPY apps/web/src apps/web/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsportal/web build

FROM node:22-alpine AS runtime

WORKDIR /workspace

ARG NEWSPORTAL_APP_BASE_URL=http://127.0.0.1:4321/
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NEWSPORTAL_APP_BASE_URL=$NEWSPORTAL_APP_BASE_URL

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json packages/config/package.json
COPY packages/content-safety/package.json packages/content-safety/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --prod --filter @newsportal/web...

COPY --from=builder --chown=node:node /workspace/apps/web/dist apps/web/dist

RUN chown -R node:node /workspace

USER node

CMD ["node", "apps/web/dist/server/entry.mjs"]
