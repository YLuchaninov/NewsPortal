FROM node:22-alpine

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY services/relay/package.json services/relay/package.json
COPY services/relay/tsconfig.json services/relay/tsconfig.json
COPY services/relay/src services/relay/src
COPY database database
COPY infra/scripts infra/scripts

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@newsportal/relay", "start"]
