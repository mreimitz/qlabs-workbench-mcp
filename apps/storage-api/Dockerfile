FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN node -e "const fs=require('fs'); const p=require('./package.json'); delete p.devDependencies; p.scripts={}; fs.writeFileSync('package.json', JSON.stringify(p));"
COPY packages/server-utils/package.json packages/server-utils/package.json
COPY apps/storage-api/package.json apps/storage-api/package.json
RUN pnpm install --filter @qlabs/storage-api...

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/storage-api/node_modules /app/apps/storage-api/node_modules
COPY --from=deps /app/packages/server-utils/node_modules /app/packages/server-utils/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/server-utils packages/server-utils
COPY apps/storage-api apps/storage-api
RUN pnpm --filter @qlabs/server-utils build
RUN pnpm --filter @qlabs/storage-api build

FROM node:20-alpine
WORKDIR /app/apps/storage-api
ENV NODE_ENV=production
COPY --from=build /app/apps/storage-api/dist dist
COPY --from=build /app/packages/server-utils /app/packages/server-utils
COPY --from=build /app/packages/server-utils/node_modules /app/packages/server-utils/node_modules
COPY --from=build /app/apps/storage-api/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY apps/storage-api/package.json package.json
EXPOSE 4100
CMD ["node", "dist/index.js"]
