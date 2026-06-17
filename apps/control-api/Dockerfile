FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN node -e "const fs=require('fs'); const p=require('./package.json'); delete p.devDependencies; p.scripts={}; fs.writeFileSync('package.json', JSON.stringify(p));"
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/control-api/package.json apps/control-api/package.json
RUN pnpm install --filter @qlabs/control-api...

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/control-api/node_modules /app/apps/control-api/node_modules
COPY --from=deps /app/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/control-api apps/control-api
RUN pnpm --filter @qlabs/contracts build
RUN pnpm --filter @qlabs/control-api build

FROM node:20-alpine
WORKDIR /app/apps/control-api
ENV NODE_ENV=production
RUN apk add --no-cache libstdc++ && mkdir -p /data/control
COPY --from=build /app/apps/control-api/dist dist
COPY --from=build /app/packages/contracts /app/packages/contracts
COPY --from=build /app/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=build /app/apps/control-api/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY apps/control-api/package.json package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
