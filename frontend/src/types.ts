// TypeScript mirror of the Rust domain model (shared::model / shared::event).
// Kept in one file so a Rust-side change has exactly one place to update.

export type AccountId = number;
export type ChatId = number;
export type MessageId = number;
export type UserId = number;

export interface Account {
  id: AccountId;
  phone: string | null;
  first_name: string;
  last_name: string | null;
  username: string | null;
  authorized: boolean;
}

export type ChatKind = "private" | "group" | "channel";

export interface Chat {
  account_id: AccountId;
  id: ChatId;
  kind: ChatKind;
  title: string;
  username: string | null;
  unread_count: number;
  pinned: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  avatar_key: string | null;
}

export type Media =
  | { type: "photo"; cache_key: string; width: number; height: number }
  | {
      type: "document";
      cache_key: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
    }
  | { type: "sticker"; cache_key: string; emoji: string }
  | { type: "other"; description: string };

export interface Reaction {
  emoji: string;
  count: number;
  chosen: boolean;
}

export type SendState = "pending" | "sent" | "failed";

export interface Message {
  account_id: AccountId;
  chat_id: ChatId;
  id: MessageId;
  sender_id: UserId | null;
  sender_name: string | null;
  text: string;
  media: Media | null;
  reactions: Reaction[];
  reply_to: MessageId | null;
  date: string;
  edited: boolean;
  outgoing: boolean;
  send_state: SendState;
}

export type Presence =
  | { status: "online" }
  | { status: "offline"; last_seen: string | null }
  | { status: "hidden" };

export type SyncState = "connecting" | "synchronizing" | "up_to_date" | "offline";

export type LoginStage =
  | { stage: "code_sent" }
  | { stage: "password_required"; hint: string | null }
  | { stage: "qr_code"; url: string; expires_at: string }
  | { stage: "complete"; account: Account };

export interface TransferProgress {
  cache_key: string;
  transferred_bytes: number;
  total_bytes: number;
  done: boolean;
}

export type CoreEvent =
  | { kind: "message_added"; message: Message }
  | { kind: "message_updated"; message: Message }
  | {
      kind: "message_deleted";
      account_id: AccountId;
      chat_id: ChatId;
      message_ids: MessageId[];
    }
  | { kind: "chat_updated"; chat: Chat }
  | { kind: "typing"; account_id: AccountId; chat_id: ChatId; user_id: UserId }
  | {
      kind: "presence_changed";
      account_id: AccountId;
      user_id: UserId;
      presence: Presence;
    }
  | { kind: "transfer_progress"; account_id: AccountId; progress: TransferProgress }
  | { kind: "sync_state_changed"; account_id: AccountId; state: SyncState }
  | { kind: "login"; account_id: AccountId | null; stage: LoginStage }
  | { kind: "logged_out"; account_id: AccountId }
  | { kind: "lagged" };
