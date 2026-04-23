FROM node:22-alpine

WORKDIR /workspace

RUN npm install -g pnpm@10.11.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/config/tsconfig.json packages/config/tsconfig.json
COPY packages/config/src packages/config/src
COPY packages/control-plane/package.json packages/control-plane/package.json
COPY packages/control-plane/tsconfig.json packages/control-plane/tsconfig.json
COPY packages/control-plane/src packages/control-plane/src
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/sdk/tsconfig.json packages/sdk/tsconfig.json
COPY packages/sdk/src packages/sdk/src
COPY apps/admin/package.json apps/admin/package.json
COPY apps/admin/tsconfig.json apps/admin/tsconfig.json
COPY apps/admin/src apps/admin/src
COPY services/mcp/package.json services/mcp/package.json
COPY services/mcp/tsconfig.json services/mcp/tsconfig.json
COPY services/mcp/src services/mcp/src

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "@newsportal/mcp", "start"]
