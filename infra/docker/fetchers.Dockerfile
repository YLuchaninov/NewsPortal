FROM node:22-alpine

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY services/fetchers/package.json services/fetchers/package.json
COPY services/fetchers/tsconfig.json services/fetchers/tsconfig.json
COPY services/fetchers/src services/fetchers/src
COPY database database

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@newsportal/fetchers", "start"]
