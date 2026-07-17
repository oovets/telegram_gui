//! Core → webview event bridge (plus native notifications).

use std::sync::Arc;

use shared::CoreEvent;
use tauri::{AppHandle, Emitter};
use telegram_core::Core;

/// Name of the single Tauri event carrying every [`CoreEvent`].
const EVENT_NAME: &str = "core-event";

/// Forward bus events to the webview until the app shuts down.
pub async fn run(app: AppHandle, core: Arc<Core>) {
    let mut rx = core.subscribe();
    loop {
        match rx.recv().await {
            Ok(event) => {
                #[cfg(feature = "notifications")]
                maybe_notify(&app, &event);
                if let Err(e) = app.emit(EVENT_NAME, &event) {
                    tracing::warn!("emit to webview failed: {e}");
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(missed)) => {
                // The UI re-reads from the DB after a lag signal.
                tracing::warn!(missed, "event bridge lagged");
                let _ = app.emit(EVENT_NAME, serde_json::json!({ "kind": "lagged" }));
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
}

/// Raise a native notification for incoming messages.
#[cfg(feature = "notifications")]
fn maybe_notify(app: &AppHandle, event: &CoreEvent) {
    use tauri_plugin_notification::NotificationExt;

    let CoreEvent::MessageAdded { message } = event else {
        return;
    };
    if message.outgoing {
        return;
    }
    let title = message
        .sender_name
        .clone()
        .unwrap_or_else(|| "New message".to_owned());
    let body = if message.text.is_empty() {
        "📎 Attachment".to_owned()
    } else {
        message.text.chars().take(140).collect()
    };
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        tracing::debug!("notification failed: {e}");
    }
}
