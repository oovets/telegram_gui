import { useState } from "react";
import { api } from "../api";
import type { Account, Chat, SyncState } from "../types";
import Avatar from "./Avatar";

const SYNC_LABEL: Record<SyncState, string> = {
  connecting: "Connecting…",
  synchronizing: "Synchronizing…",
  up_to_date: "",
  offline: "Offline — retrying…",
};

function chatIcon(chat: Chat): string {
  switch (chat.kind) {
    case "group":
      return "👥";
    case "channel":
      return "📣";
    default:
      return "👤";
  }
}

export default function ChatList(props: {
  account: Account;
  accounts: Account[];
  chats: Chat[];
  activeChatId: number | null;
  syncState: SyncState;
  typing: Map<number, number>;
  showAvatars: boolean;
  onToggleAvatars: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectChat: (chat: Chat) => void;
  onSwitchAccount: (account: Account) => void;
  onAddAccount: () => void;
  onSignOut: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { collapsed } = props;

  const visible = props.chats.filter((c) =>
    c.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const syncLabel = SYNC_LABEL[props.syncState];

  return (
    <aside className={`chat-list ${collapsed ? "collapsed" : ""}`}>
      <header className="chat-list-header">
        <div className="chat-list-top">
          {!collapsed && (
            <button className="account-button" onClick={() => setMenuOpen((v) => !v)}>
              {props.account.first_name}
              {props.accounts.length > 1 ? ` (${props.accounts.length})` : ""} ▾
            </button>
          )}
          <button
            className="collapse-btn"
            title={collapsed ? "Expand chat list" : "Collapse chat list"}
            onClick={props.onToggleCollapsed}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        {menuOpen && (
          <div className="account-menu" onMouseLeave={() => setMenuOpen(false)}>
            {props.accounts.map((account) => (
              <button
                key={account.id}
                className={account.id === props.account.id ? "active" : ""}
                onClick={() => {
                  setMenuOpen(false);
                  props.onSwitchAccount(account);
                }}
              >
                {account.first_name} {account.phone ?? ""}
              </button>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false);
                props.onAddAccount();
              }}
            >
              ＋ Add account
            </button>
            <button
              onClick={() => {
                props.onToggleAvatars();
              }}
            >
              {props.showAvatars ? "🙈 Hide avatars" : "🖼 Show avatars"}
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenuOpen(false);
                props.onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        )}
        {!collapsed && (
          <input
            className="chat-filter"
            placeholder="Search chats"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
        {!collapsed && syncLabel && <div className="sync-banner">{syncLabel}</div>}
      </header>

      <div className="chat-scroll">
        {visible.map((chat) => {
          const isTyping = (props.typing.get(chat.id) ?? 0) > Date.now();
          return (
            <button
              key={chat.id}
              className={`chat-row ${chat.id === props.activeChatId ? "active" : ""}`}
              title={collapsed ? chat.title : undefined}
              onClick={() => props.onSelectChat(chat)}
            >
              <span className="chat-avatar-wrap">
                {props.showAvatars ? (
                  <Avatar
                    name={chat.title}
                    seed={chat.id}
                    size={42}
                    enabled={chat.avatar_key !== null}
                    cacheKey={`${props.account.id}:${chat.id}`}
                    load={() => api.avatarDataUrl(props.account.id, chat.id)}
                  />
                ) : (
                  <span className="chat-avatar">{chatIcon(chat)}</span>
                )}
                {/* Collapsed rail: unread shown as a compact dot on the avatar. */}
                {collapsed && chat.unread_count > 0 && <span className="unread-dot" />}
              </span>
              {!collapsed && (
                <span className="chat-meta">
                  <span className="chat-title">
                    {chat.pinned && <span className="pin">📌</span>}
                    {chat.title}
                  </span>
                  <span className="chat-preview">
                    {isTyping ? (
                      <em className="typing">typing…</em>
                    ) : (
                      chat.last_message_preview ?? ""
                    )}
                  </span>
                </span>
              )}
              {!collapsed && chat.unread_count > 0 && (
                <span className="unread-badge">{chat.unread_count}</span>
              )}
            </button>
          );
        })}
        {visible.length === 0 && <div className="muted padded">No chats</div>}
      </div>
    </aside>
  );
}
