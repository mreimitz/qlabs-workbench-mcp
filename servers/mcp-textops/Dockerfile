FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-textops/package.json servers/mcp-textops/package.json
RUN pnpm install --filter @qlabs/mcp-textops...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/servers/mcp-textops/node_modules /app/servers/mcp-textops/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-textops servers/mcp-textops
RUN pnpm --filter @qlabs/mcp-textops build

FROM node:20-alpine
WORKDIR /app/servers/mcp-textops
ENV NODE_ENV=production
COPY --from=build /app/servers/mcp-textops/dist dist
COPY --from=build /app/servers/mcp-textops/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY servers/mcp-textops/package.json package.json
EXPOSE 7030
CMD ["node", "dist/index.js"]
