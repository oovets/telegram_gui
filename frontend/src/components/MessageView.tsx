import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { Account, Chat, CoreEvent, Message } from "../types";
import Avatar from "./Avatar";
import Composer from "./Composer";
import MediaBlock from "./MediaBlock";

// Fallback if the server list hasn't loaded. Note: Telegram's "laughing"
// reaction is 😁 (grinning face), NOT 😂 (tears of joy).
const FALLBACK_REACTIONS = ["👍", "❤️", "😁", "🔥", "👎"];

function sortAscending(messages: Message[]): Message[] {
  return [...messages].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date.localeCompare(b.date),
  );
}

export default function MessageView(props: {
  account: Account;
  chat: Chat;
  typing: boolean;
  showAvatars: boolean;
  reactions: string[];
  subscribe: (listener: (e: CoreEvent) => void) => () => void;
}) {
  const { account, chat } = props;
  // Sender avatars only make sense in group/channel chats (native hides them
  // in 1:1 conversations). Toggle also gates them entirely.
  const groupAvatars = props.showAvatars && chat.kind !== "private";
  // Quick-reaction bar: the account's real reactions (native set/order),
  // capped so the hover toolbar stays a sensible width.
  const quickReactions = (
    props.reactions.length ? props.reactions : FALLBACK_REACTIONS
  ).slice(0, 8);
  const [messages, setMessages] = useState<Message[]>([]);
  const [editing, setEditing] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether the view is currently anchored to the newest message. A single
  // ResizeObserver keeps us pinned here as content grows (late media, new
  // messages) — no timers, no competing scroll effects.
  const pinnedRef = useRef(true);
  const loadingOlderRef = useRef(false);
  // Last observed scrollTop, to tell a genuine user scroll-up apart from
  // content growing (media loading), which also moves us "away from bottom"
  // but must NOT unpin.
  const lastScrollTop = useRef(0);
  // When prepending older messages, remember the pre-prepend geometry so we
  // can restore the exact reading position instead of jumping.
  const prependAnchor = useRef<{ height: number; top: number } | null>(null);
  // Kept fresh for the observer closure (which is set up once on mount).
  const searchingRef = useRef(false);
  searchingRef.current = searchResults !== null;

  const loadInitial = useCallback(async () => {
    pinnedRef.current = true;
    const page = await api.messages(account.id, chat.id);
    setMessages(sortAscending(page));
  }, [account.id, chat.id]);

  useEffect(() => {
    loadInitial().catch(console.error);
  }, [loadInitial]);

  // Primary scroll authority. Runs *synchronously before paint* on every
  // message change, so the first frame is already correct — no flash-at-top-
  // then-jump-to-bottom flicker on open.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependAnchor.current) {
      // Older messages were inserted above: hold the reading position by
      // shifting scrollTop by exactly how much the content grew.
      const { height, top } = prependAnchor.current;
      el.scrollTop = top + (el.scrollHeight - height);
      prependAnchor.current = null;
    } else if (pinnedRef.current && !searchingRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Secondary: keep pinned to the bottom as late-loading media grows the
  // content (this can only settle after paint, hence a ResizeObserver). It
  // only ever nudges when already at the bottom, so it's never visible.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (
        !prependAnchor.current &&
        pinnedRef.current &&
        !searchingRef.current
      ) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Live updates for this chat.
  useEffect(() => {
    return props.subscribe((event) => {
      switch (event.kind) {
        case "message_added":
          if (event.message.chat_id === chat.id && event.message.account_id === account.id) {
            setMessages((prev) =>
              sortAscending([
                ...prev.filter((m) => m.id !== event.message.id),
                event.message,
              ]),
            );
            if (!event.message.outgoing) {
              api.markRead(account.id, chat.id).catch(() => {});
            }
          }
          break;
        case "message_updated":
          if (event.message.chat_id === chat.id && event.message.account_id === account.id) {
            setMessages((prev) =>
              prev.map((m) => (m.id === event.message.id ? event.message : m)),
            );
          }
          break;
        case "message_deleted":
          if (event.chat_id === chat.id && event.account_id === account.id) {
            setMessages((prev) =>
              prev.filter((m) => !event.message_ids.includes(m.id)),
            );
          }
          break;
        case "lagged":
          loadInitial().catch(console.error);
          break;
      }
    });
  }, [props, account.id, chat.id, props.subscribe, loadInitial]);

  async function loadOlder() {
    if (loadingOlderRef.current || messages.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const page = await api.messages(account.id, chat.id, {
        date: oldest.date,
        id: oldest.id,
      });
      if (page.length > 0) {
        const el = scrollRef.current;
        if (el) {
          // Snapshot geometry; the observer restores position after layout.
          prependAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
        }
        setMessages((prev) => sortAscending([...page, ...prev]));
      }
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function runSearch(query: string) {
    setSearch(query);
    if (query.trim() === "") {
      setSearchResults(null);
      return;
    }
    setSearchResults(await api.search(account.id, chat.id, query));
  }

  async function attachFile() {
    const path = await open({ multiple: false, directory: false });
    if (typeof path === "string") {
      await api.sendFile(account.id, chat.id, path);
    }
  }

  async function saveDocument(cacheKey: string, suggestedName: string) {
    // Ensure the blob is cached locally first (downloads on miss).
    const target = await save({ defaultPath: suggestedName });
    if (target) {
      const ok = await api.exportMedia(cacheKey, target);
      if (!ok) console.warn("blob not cached yet; download it first");
    }
  }

  const shown = searchResults ?? messages;

  return (
    <main className="message-view">
      <header className="message-header">
        <div>
          <div className="chat-title">{chat.title}</div>
          <div className="muted small">
            {props.typing ? "typing…" : chat.username ? `@${chat.username}` : chat.kind}
          </div>
        </div>
        <input
          className="message-search"
          placeholder="Search in chat"
          value={search}
          onChange={(e) => void runSearch(e.target.value)}
        />
      </header>

      <div
        className="message-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const prevTop = lastScrollTop.current;
          lastScrollTop.current = el.scrollTop;
          const nearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          // A genuine upward gesture: scrollTop actually decreased. Content
          // growing (media) moves us off the bottom without decreasing
          // scrollTop, so it never unpins.
          const userScrolledUp = el.scrollTop < prevTop - 2;
          if (nearBottom) pinnedRef.current = true;
          else if (userScrolledUp) pinnedRef.current = false;
          // Paginate older only on a real upward scroll near the top of a
          // scrollable list — never on our own programmatic scroll.
          const scrollable = el.scrollHeight > el.clientHeight + 40;
          if (userScrolledUp && scrollable && el.scrollTop < 120 && !searchResults) {
            void loadOlder();
          }
        }}
      >
        <div className="message-content" ref={contentRef}>
        {loadingOlder && <div className="muted centered-row">Loading…</div>}
        {shown.map((message, i) => {
          // Show the avatar once per run of same-sender incoming messages
          // (on the first), and reserve the gutter on the rest so bubbles
          // stay aligned.
          const prev = shown[i - 1];
          const firstOfGroup =
            !prev ||
            prev.sender_id !== message.sender_id ||
            prev.outgoing !== message.outgoing;
          const showAvatar = groupAvatars && !message.outgoing && firstOfGroup;
          const reserveAvatar = groupAvatars && !message.outgoing && !firstOfGroup;
          return (
          <MessageBubble
            key={message.id}
            message={message}
            account={account}
            isSearchResult={searchResults !== null}
            showAvatar={showAvatar}
            reserveAvatar={reserveAvatar}
            onReply={() => setReplyTo(message)}
            onEdit={() => setEditing(message)}
            onDelete={() =>
              void api.deleteMessages(account.id, chat.id, [message.id])
            }
            onReact={(emoji) => {
              const already = message.reactions.some(
                (r) => r.chosen && r.emoji === emoji,
              );
              api
                .react(account.id, chat.id, message.id, already ? null : emoji)
                .catch((e) => console.error(`reaction "${emoji}" failed:`, e));
            }}
          />
          );
        })}
        {shown.length === 0 && (
          <div className="muted centered-row">
            {searchResults ? "No results" : "No messages yet"}
          </div>
        )}
        </div>
      </div>

      <Composer
        account={account}
        chat={chat}
        editing={editing}
        replyTo={replyTo}
        onCancelEdit={() => setEditing(null)}
        onCancelReply={() => setReplyTo(null)}
        onAttach={() => void attachFile()}
        onSent={() => {
          setEditing(null);
          setReplyTo(null);
          // Sending should always snap us back to the newest message.
          pinnedRef.current = true;
        }}
      />
    </main>
  );

  function MessageBubble(bubble: {
    message: Message;
    account: Account;
    isSearchResult: boolean;
    showAvatar: boolean;
    reserveAvatar: boolean;
    onReply: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onReact: (emoji: string) => void;
  }) {
    const { message } = bubble;
    const time = new Date(message.date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className={`bubble-row ${message.outgoing ? "out" : "in"}`}>
        {bubble.showAvatar && (
          <Avatar
            name={message.sender_name ?? "?"}
            seed={message.sender_id ?? 0}
            size={34}
            enabled={message.sender_id !== null}
            cacheKey={
              message.sender_id !== null
                ? `u:${account.id}:${message.sender_id}`
                : undefined
            }
            load={
              message.sender_id !== null
                ? () => api.userAvatarDataUrl(account.id, message.sender_id!)
                : undefined
            }
          />
        )}
        {bubble.reserveAvatar && <span className="avatar-gutter" />}
        <div className="bubble">
          {!message.outgoing && message.sender_name && (
            <div className="sender">{message.sender_name}</div>
          )}
          {message.reply_to !== null && (
            <div className="reply-ref">↩ #{message.reply_to}</div>
          )}
          {message.media && (
            <MediaBlock
              account={bubble.account}
              message={message}
              onSaveDocument={(key, name) => void saveDocument(key, name)}
            />
          )}
          {message.text && <div className="text">{message.text}</div>}
          <div className="meta">
            {message.edited && <span>edited · </span>}
            <span>{time}</span>
            {message.outgoing && (
              <span className={`state ${message.send_state}`}>
                {message.send_state === "pending" && " 🕓"}
                {message.send_state === "sent" && " ✓"}
                {message.send_state === "failed" && " ⚠"}
              </span>
            )}
          </div>
          {message.reactions.length > 0 && (
            <div className="reactions">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  className={`reaction ${r.chosen ? "chosen" : ""}`}
                  onClick={() => bubble.onReact(r.emoji)}
                >
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
          )}
          {!bubble.isSearchResult && (
            <div className="bubble-actions">
              {quickReactions.map((emoji) => (
                <button key={emoji} title="React" onClick={() => bubble.onReact(emoji)}>
                  {emoji}
                </button>
              ))}
              <button title="Reply" onClick={bubble.onReply}>
                ↩
              </button>
              {message.outgoing && message.id > 0 && (
                <button title="Edit" onClick={bubble.onEdit}>
                  ✎
                </button>
              )}
              <button title="Delete" onClick={bubble.onDelete}>
                🗑
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
}
