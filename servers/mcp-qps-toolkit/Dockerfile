FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-qps-toolkit/package.json servers/mcp-qps-toolkit/package.json
RUN pnpm install --filter @qlabs/mcp-qps-toolkit...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/servers/mcp-qps-toolkit/node_modules /app/servers/mcp-qps-toolkit/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-qps-toolkit servers/mcp-qps-toolkit
RUN pnpm --filter @qlabs/mcp-qps-toolkit build

FROM node:20-alpine
WORKDIR /app/servers/mcp-qps-toolkit
ENV NODE_ENV=production
COPY --from=build /app/servers/mcp-qps-toolkit/dist dist
COPY --from=build /app/servers/mcp-qps-toolkit/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY servers/mcp-qps-toolkit/package.json package.json
EXPOSE 7050
CMD ["node", "dist/index.js"]
