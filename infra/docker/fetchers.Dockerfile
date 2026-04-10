FROM node:22-bookworm-slim

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY services/fetchers/package.json services/fetchers/package.json
COPY services/fetchers/tsconfig.json services/fetchers/tsconfig.json
COPY services/fetchers/src services/fetchers/src
COPY database database

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @newsportal/fetchers exec playwright install --with-deps chromium

CMD ["pnpm", "--filter", "@newsportal/fetchers", "start"]
