FROM node:22-alpine AS builder
WORKDIR /app

RUN apk upgrade --no-cache -U && \
  apk add --no-cache git

RUN npm i -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsdown.config.ts ./
COPY src src
COPY packages packages
COPY app.config.ts app.config.ts

RUN pnpm install --frozen-lockfile --prefer-frozen-lockfile
RUN npm run build

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

COPY --from=builder /app/dist dist

EXPOSE 8888
EXPOSE 8080
CMD ["node", "dist/server.js"]
