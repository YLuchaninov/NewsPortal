FROM node:22-alpine

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig.json packages/config/tsconfig.json
COPY packages/config/src packages/config/src
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
COPY apps/web/src apps/web/src

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@newsportal/web", "start"]
