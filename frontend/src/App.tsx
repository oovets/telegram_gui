import { useCallback, useEffect, useRef, useState } from "react";
import { api, onCoreEvent } from "./api";
import type { Account, Chat, CoreEvent, Message, SyncState } from "./types";
import LoginView from "./components/LoginView";
import ChatList from "./components/ChatList";
import MessageView from "./components/MessageView";

/** Sort chats the same way the backend does: pinned first, then recency. */
function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "");
  });
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [activeAccount, setActiveAccount] = useState<Account | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("connecting");
  // Avatar visibility — persisted so "clean GUI" mode survives restarts.
  const [showAvatars, setShowAvatars] = useState<boolean>(
    () => localStorage.getItem("showAvatars") !== "false",
  );
  // Collapsed chat list — a narrow avatars-only rail. Persisted.
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem("chatListCollapsed") === "true",
  );
  // Telegram's native reaction set (fetched once); safe default until it loads.
  const [reactions, setReactions] = useState<string[]>([
    "👍", "❤️", "🔥", "😁", "👏", "😢", "🎉", "🤔",
  ]);
  // Transient typing indicators: chatId → expiry timestamp.
  const [typing, setTyping] = useState<Map<number, number>>(new Map());
  // Incoming live messages are delivered to MessageView through a ref-based
  // subscription so the whole tree doesn't re-render per message.
  const messageListeners = useRef<Set<(e: CoreEvent) => void>>(new Set());

  const refreshAccounts = useCallback(async () => {
    const list = await api.listAccounts();
    setAccounts(list);
    const authorized = list.filter((a) => a.authorized);
    setActiveAccount((current) => {
      if (current && authorized.some((a) => a.id === current.id)) return current;
      return authorized[0] ?? null;
    });
  }, []);

  const refreshChats = useCallback(async (accountId: number) => {
    setChats(sortChats(await api.chatList(accountId)));
  }, []);

  useEffect(() => {
    refreshAccounts().catch(console.error);
  }, [refreshAccounts]);

  useEffect(() => {
    if (activeAccount) refreshChats(activeAccount.id).catch(console.error);
  }, [activeAccount, refreshChats]);

  // Load the account's real reaction set (matches native); keep the default
  // on failure so the quick bar always works.
  useEffect(() => {
    if (!activeAccount) return;
    api
      .availableReactions(activeAccount.id)
      .then((list) => {
        if (list.length > 0) setReactions(list);
      })
      .catch(console.error);
  }, [activeAccount]);

  // Single event-stream subscription for the app.
  useEffect(() => {
    const unlisten = onCoreEvent((event) => {
      for (const listener of messageListeners.current) listener(event);
      switch (event.kind) {
        case "chat_updated":
          setChats((prev) => {
            const rest = prev.filter((c) => c.id !== event.chat.id);
            return sortChats([...rest, event.chat]);
          });
          break;
        case "sync_state_changed":
          setSyncState(event.state);
          break;
        case "typing":
          setTyping((prev) => {
            const next = new Map(prev);
            next.set(event.chat_id, Date.now() + 5000);
            return next;
          });
          break;
        case "login":
          if (event.stage.stage === "complete") {
            refreshAccounts().catch(console.error);
          }
          break;
        case "logged_out":
          refreshAccounts().catch(console.error);
          break;
        case "lagged":
          // Bus overflow: state may be stale; re-read everything.
          refreshAccounts().catch(console.error);
          break;
      }
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [refreshAccounts]);

  // Expire typing indicators.
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        if (![...prev.values()].some((t) => t < now)) return prev;
        return new Map([...prev].filter(([, expiry]) => expiry >= now));
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleAvatars = useCallback(() => {
    setShowAvatars((prev) => {
      const next = !prev;
      localStorage.setItem("showAvatars", String(next));
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("chatListCollapsed", String(next));
      return next;
    });
  }, []);

  const subscribeMessages = useCallback((listener: (e: CoreEvent) => void) => {
    messageListeners.current.add(listener);
    return () => {
      messageListeners.current.delete(listener);
    };
  }, []);

  if (accounts === null) {
    return <div className="centered muted">Loading…</div>;
  }
  if (!activeAccount) {
    return <LoginView onLoggedIn={() => refreshAccounts().catch(console.error)} />;
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div className="app">
      <ChatList
        account={activeAccount}
        accounts={accounts.filter((a) => a.authorized)}
        chats={chats}
        activeChatId={activeChatId}
        syncState={syncState}
        typing={typing}
        showAvatars={showAvatars}
        onToggleAvatars={toggleAvatars}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        onSelectChat={(chat: Chat) => {
          setActiveChatId(chat.id);
          api.markRead(activeAccount.id, chat.id).catch(() => {});
        }}
        onSwitchAccount={(account: Account) => {
          setActiveAccount(account);
          setActiveChatId(null);
        }}
        onAddAccount={() => setActiveAccount(null)}
        onSignOut={() => {
          api.signOut(activeAccount.id).catch(console.error);
        }}
      />
      {activeChat ? (
        <MessageView
          key={`${activeAccount.id}:${activeChat.id}`}
          account={activeAccount}
          chat={activeChat}
          typing={(typing.get(activeChat.id) ?? 0) > Date.now()}
          showAvatars={showAvatars}
          reactions={reactions}
          subscribe={subscribeMessages}
        />
      ) : (
        <div className="centered muted">Select a chat to start messaging</div>
      )}
    </div>
  );
}

export type { Message };
