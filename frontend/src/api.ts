// Typed wrappers over the Tauri IPC surface.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  Account,
  AccountId,
  Chat,
  ChatId,
  CoreEvent,
  Message,
  MessageId,
} from "./types";

export const api = {
  listAccounts: () => invoke<Account[]>("list_accounts"),
  beginCodeLogin: (phone: string) => invoke<void>("begin_code_login", { phone }),
  submitCode: (code: string) => invoke<void>("submit_code", { code }),
  submitPassword: (password: string) => invoke<void>("submit_password", { password }),
  beginQrLogin: () => invoke<void>("begin_qr_login"),
  signOut: (accountId: AccountId) => invoke<void>("sign_out", { accountId }),

  chatList: (accountId: AccountId) => invoke<Chat[]>("chat_list", { accountId }),
  messages: (
    accountId: AccountId,
    chatId: ChatId,
    before?: { date: string; id: MessageId },
    limit = 50,
  ) =>
    invoke<Message[]>("messages", {
      accountId,
      chatId,
      beforeDate: before?.date ?? null,
      beforeId: before?.id ?? null,
      limit,
    }),
  sendMessage: (
    accountId: AccountId,
    chatId: ChatId,
    text: string,
    replyTo?: MessageId,
  ) =>
    invoke<Message>("send_message", {
      accountId,
      chatId,
      text,
      replyTo: replyTo ?? null,
    }),
  sendFile: (accountId: AccountId, chatId: ChatId, path: string, caption?: string) =>
    invoke<Message>("send_file", { accountId, chatId, path, caption: caption ?? null }),
  editMessage: (
    accountId: AccountId,
    chatId: ChatId,
    messageId: MessageId,
    text: string,
  ) => invoke<void>("edit_message", { accountId, chatId, messageId, text }),
  deleteMessages: (accountId: AccountId, chatId: ChatId, messageIds: MessageId[]) =>
    invoke<void>("delete_messages", { accountId, chatId, messageIds }),
  react: (
    accountId: AccountId,
    chatId: ChatId,
    messageId: MessageId,
    emoji: string | null,
  ) => invoke<void>("react", { accountId, chatId, messageId, emoji }),
  markRead: (accountId: AccountId, chatId: ChatId) =>
    invoke<void>("mark_read", { accountId, chatId }),
  setTyping: (accountId: AccountId, chatId: ChatId) =>
    invoke<void>("set_typing", { accountId, chatId }),
  search: (accountId: AccountId, chatId: ChatId | null, query: string) =>
    invoke<Message[]>("search", { accountId, chatId, query }),
  availableReactions: (accountId: AccountId) =>
    invoke<string[]>("available_reactions", { accountId }),
  mediaDataUrl: (
    accountId: AccountId,
    chatId: ChatId,
    messageId: MessageId,
    cacheKey: string,
    mimeType?: string,
  ) =>
    invoke<string>("media_data_url", {
      accountId,
      chatId,
      messageId,
      cacheKey,
      mimeType: mimeType ?? null,
    }),
  exportMedia: (cacheKey: string, dest: string) =>
    invoke<boolean>("export_media", { cacheKey, dest }),
  avatarDataUrl: (accountId: AccountId, chatId: ChatId) =>
    invoke<string | null>("avatar_data_url", { accountId, chatId }),
  userAvatarDataUrl: (accountId: AccountId, userId: number) =>
    invoke<string | null>("user_avatar_data_url", { accountId, userId }),
};

/** Subscribe to the core event stream. Returns the unlisten function. */
export function onCoreEvent(handler: (event: CoreEvent) => void): Promise<UnlistenFn> {
  return listen<CoreEvent>("core-event", (e) => handler(e.payload));
}
