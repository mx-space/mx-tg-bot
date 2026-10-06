FROM rust:1-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src src
RUN cargo build --release --locked

FROM scratch
COPY --from=builder /app/target/release/mx-tg-bot /mx-tg-bot
EXPOSE 8080
ENTRYPOINT ["/mx-tg-bot"]
