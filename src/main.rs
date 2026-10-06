use std::sync::Arc;

use mx_tg_bot::app::AppState;
use mx_tg_bot::config::Config;
use mx_tg_bot::mx::commands;
use mx_tg_bot::{server, watchdog};
use teloxide::prelude::*;
use tokio::signal::unix::{SignalKind, signal};
use tracing_subscriber::EnvFilter;

async fn shutdown_signal() {
    let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = term.recv() => {}
    }
}

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env().unwrap_or_else(|err| {
        eprintln!("{err}");
        std::process::exit(1);
    });
    let bot = Bot::new(&config.tg_bot_token);
    let state = Arc::new(AppState::new(config.clone(), bot.clone()));

    if let Err(err) = bot.set_my_commands(commands::bot_commands()).await {
        tracing::error!("setMyCommands failed: {err}");
    }

    let listener = tokio::net::TcpListener::bind((config.host.as_str(), config.port))
        .await
        .unwrap_or_else(|err| {
            eprintln!("bind {}:{} failed: {err}", config.host, config.port);
            std::process::exit(1);
        });
    tracing::info!("server listening on {}:{}", config.host, config.port);

    let mut dispatcher = Dispatcher::builder(bot.clone(), commands::handler())
        .dependencies(dptree::deps![state.clone()])
        .default_handler(|_| async {})
        .error_handler(LoggingErrorHandler::with_custom_text(
            "update handler failed",
        ))
        .build();
    let token = dispatcher.shutdown_token();

    let server = tokio::spawn(async move {
        axum::serve(listener, server::router(state))
            .with_graceful_shutdown(async move {
                shutdown_signal().await;
                if let Ok(done) = token.shutdown() {
                    done.await;
                }
            })
            .await
    });
    tokio::spawn(watchdog::run(bot));

    tracing::info!("telegram bot ready");
    dispatcher.dispatch().await;
    if let Ok(Err(err)) = server.await {
        tracing::error!("server error: {err}");
    }
}
