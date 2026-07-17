//! Tauri command surface.
//!
//! Every command is a thin, validated pass-through to `telegram-core`
//! services. Errors cross the IPC boundary as strings — the frontend treats
//! them as user-facing messages.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use shared::model::{Account, AccountId, Chat, ChatId, Message, MessageId, UserId};
use tauri::State;
use telegram_core::Core;

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ----- accounts & login ----------------------------------------------------

#[tauri::command]
pub async fn list_accounts(core: State<'_, Arc<Core>>) -> CmdResult<Vec<Account>> {
    core.accounts.list().await.map_err(err)
}

#[tauri::command]
pub async fn begin_code_login(core: State<'_, Arc<Core>>, phone: String) -> CmdResult<()> {
    core.accounts.begin_code_login(phone.trim()).await.map_err(err)
}

#[tauri::command]
pub async fn submit_code(core: State<'_, Arc<Core>>, code: String) -> CmdResult<()> {
    core.accounts.submit_code(code.trim()).await.map_err(err)
}

#[tauri::command]
pub async fn submit_password(core: State<'_, Arc<Core>>, password: String) -> CmdResult<()> {
    core.accounts.submit_password(&password).await.map_err(err)
}

#[tauri::command]
pub async fn begin_qr_login(core: State<'_, Arc<Core>>) -> CmdResult<()> {
    #[cfg(feature = "qr-login")]
    {
        core.accounts.begin_qr_login().await.map_err(err)
    }
    #[cfg(not(feature = "qr-login"))]
    {
        let _ = core;
        Err("QR login is disabled in this build".to_owned())
    }
}

#[tauri::command]
pub async fn sign_out(core: State<'_, Arc<Core>>, account_id: AccountId) -> CmdResult<()> {
    core.accounts.sign_out(account_id).await.map_err(err)
}

// ----- chats & messages ----------------------------------------------------

#[tauri::command]
pub async fn chat_list(core: State<'_, Arc<Core>>, account_id: AccountId) -> CmdResult<Vec<Chat>> {
    core.chat_list(account_id).await.map_err(err)
}

#[tauri::command]
pub async fn messages(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    before_date: Option<DateTime<Utc>>,
    before_id: Option<MessageId>,
    limit: Option<u32>,
) -> CmdResult<Vec<Message>> {
    let before = match (before_date, before_id) {
        (Some(date), Some(id)) => Some((date, id)),
        _ => None,
    };
    core.messages(account_id, chat_id, before, limit.unwrap_or(50))
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn send_message(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    text: String,
    reply_to: Option<MessageId>,
) -> CmdResult<Message> {
    if text.trim().is_empty() {
        return Err("cannot send an empty message".to_owned());
    }
    core.inner()
        .send_message(account_id, chat_id, text, reply_to)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn send_file(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    path: String,
    caption: Option<String>,
) -> CmdResult<Message> {
    core.send_file(
        account_id,
        chat_id,
        std::path::Path::new(&path),
        caption.as_deref().unwrap_or(""),
    )
    .await
    .map_err(err)
}

#[tauri::command]
pub async fn edit_message(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    message_id: MessageId,
    text: String,
) -> CmdResult<()> {
    core.edit_message(account_id, chat_id, message_id, &text)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn delete_messages(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    message_ids: Vec<MessageId>,
) -> CmdResult<()> {
    core.delete_messages(account_id, chat_id, message_ids)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn react(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    message_id: MessageId,
    emoji: Option<String>,
) -> CmdResult<()> {
    core.react(account_id, chat_id, message_id, emoji)
        .await
        .map_err(err)
}

#[tauri::command]
pub async fn mark_read(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
) -> CmdResult<()> {
    core.mark_read(account_id, chat_id).await.map_err(err)
}

#[tauri::command]
pub async fn set_typing(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
) -> CmdResult<()> {
    core.set_typing(account_id, chat_id).await.map_err(err)
}

#[tauri::command]
pub async fn search(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: Option<ChatId>,
    query: String,
    limit: Option<u32>,
) -> CmdResult<Vec<Message>> {
    core.search(account_id, chat_id, &query, limit.unwrap_or(30))
        .await
        .map_err(err)
}

// ----- media ---------------------------------------------------------------

/// Fetch media as a `data:` URL for direct use in `<img>` / downloads.
#[tauri::command]
pub async fn media_data_url(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
    message_id: MessageId,
    cache_key: String,
    mime_type: Option<String>,
) -> CmdResult<String> {
    let bytes = core
        .media_bytes(account_id, chat_id, message_id, &cache_key)
        .await
        .map_err(err)?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!(
        "data:{};base64,{encoded}",
        mime_type.as_deref().unwrap_or("application/octet-stream")
    ))
}

/// A chat's profile photo as a `data:` URL, or `null` if it has none.
#[tauri::command]
pub async fn avatar_data_url(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    chat_id: ChatId,
) -> CmdResult<Option<String>> {
    let bytes = core.avatar_bytes(account_id, chat_id).await.map_err(err)?;
    Ok(bytes.map(|bytes| {
        let encoded =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        format!("data:image/jpeg;base64,{encoded}")
    }))
}

/// The active reaction emoji (native set/order) for the quick-reaction bar.
#[tauri::command]
pub async fn available_reactions(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
) -> CmdResult<Vec<String>> {
    core.available_reactions(account_id).await.map_err(err)
}

/// A group member's profile photo as a `data:` URL, or `null` if none.
#[tauri::command]
pub async fn user_avatar_data_url(
    core: State<'_, Arc<Core>>,
    account_id: AccountId,
    user_id: UserId,
) -> CmdResult<Option<String>> {
    let bytes = core
        .user_avatar_bytes(account_id, user_id)
        .await
        .map_err(err)?;
    Ok(bytes.map(|bytes| {
        let encoded =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        format!("data:image/jpeg;base64,{encoded}")
    }))
}

/// Decrypt a cached blob to a plaintext file the user picked ("Save As…").
#[tauri::command]
pub async fn export_media(
    core: State<'_, Arc<Core>>,
    cache_key: String,
    dest: String,
) -> CmdResult<bool> {
    core.export_media(&cache_key, std::path::Path::new(&dest))
        .await
        .map_err(err)
}
