FROM jellydn/alpine-nodejs:20 as builder
# Build the image
RUN mkdir /app
WORKDIR /app

RUN apk upgrade --no-cache -U && \
  apk add --no-cache git

COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src src
COPY app.config.ts app.config.ts

RUN npm i -g pnpm
RUN pnpm install --frozen-lockfile --prefer-frozen-lockfile
ENV NODE_ENV=production
RUN npm run build

# Copy the build output
FROM jellydn/alpine-nodejs:20
WORKDIR /app
COPY --from=builder /app .

# Export 8888 for health check with fly.io
EXPOSE 8888
EXPOSE 8080
CMD ["yarn", "start:prod"]
