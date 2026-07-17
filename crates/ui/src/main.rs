//! Tauri desktop shell for the Telegram client.
//!
//! Responsibilities of this binary (and nothing more):
//!
//! * bootstrap: configuration, logging, [`telegram_core::Core`];
//! * expose core services as Tauri commands ([`commands`]);
//! * forward [`shared::CoreEvent`]s to the webview and raise native
//!   notifications ([`bridge`]).
//!
//! All business logic lives in `telegram-core`; this crate is deliberately a
//! thin adapter so the UI technology can change without touching the core.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod commands;

use std::path::PathBuf;
use std::sync::Arc;

use cache::secrets::KeychainSecretStore;
use shared::AppConfig;
use tauri::Manager;
use telegram_core::Core;

fn main() {
    if let Err(e) = run() {
        eprintln!("fatal: {e:#}");
        std::process::exit(1);
    }
}

fn run() -> anyhow::Result<()> {
    let config = AppConfig::load(dev_config_path().as_deref())?;
    init_tracing(&config)?;
    tracing::info!("starting TelegramGui");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            #[cfg(feature = "notifications")]
            app.handle()
                .plugin(tauri_plugin_notification::init())?;

            let secrets = Arc::new(KeychainSecretStore::new());
            let core = tauri::async_runtime::block_on(Core::start(config.clone(), secrets))?;

            let handle = app.handle().clone();
            let bridge_core = Arc::clone(&core);
            tauri::async_runtime::spawn(bridge::run(handle, bridge_core));

            app.manage(core);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_accounts,
            commands::begin_code_login,
            commands::submit_code,
            commands::submit_password,
            commands::begin_qr_login,
            commands::sign_out,
            commands::chat_list,
            commands::messages,
            commands::send_message,
            commands::send_file,
            commands::edit_message,
            commands::delete_messages,
            commands::react,
            commands::mark_read,
            commands::set_typing,
            commands::search,
            commands::available_reactions,
            commands::media_data_url,
            commands::avatar_data_url,
            commands::user_avatar_data_url,
            commands::export_media,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| anyhow::anyhow!("tauri run failed: {e}"))
}

/// Locate the repo-local `config/default.toml` during development.
fn dev_config_path() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("config/default.toml"),
        PathBuf::from("../../config/default.toml"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../config/default.toml"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

/// Console logging always; rolling file log in the data dir when enabled.
fn init_tracing(config: &AppConfig) -> anyhow::Result<()> {
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;

    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(config.log.filter.clone()));

    let registry = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer());

    if config.log.file {
        let appender =
            tracing_appender::rolling::daily(config.storage.data_dir.join("logs"), "app.log");
        // Intentionally leak the guard: logging lives for the whole process.
        let (writer, guard) = tracing_appender::non_blocking(appender);
        Box::leak(Box::new(guard));
        registry
            .with(tracing_subscriber::fmt::layer().with_ansi(false).with_writer(writer))
            .init();
    } else {
        registry.init();
    }
    Ok(())
}
