import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Account, Chat, Message } from "../types";

/** Message input: send, edit mode, reply mode, attach, typing signal. */
export default function Composer(props: {
  account: Account;
  chat: Chat;
  editing: Message | null;
  replyTo: Message | null;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onAttach: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const lastTypingSent = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Entering edit mode preloads the message text.
  useEffect(() => {
    if (props.editing) {
      setText(props.editing.text);
      inputRef.current?.focus();
    }
  }, [props.editing]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [props.chat.id]);

  async function submit() {
    const value = text.trim();
    if (value === "") return;
    if (props.editing) {
      await api.editMessage(props.account.id, props.chat.id, props.editing.id, value);
    } else {
      await api.sendMessage(
        props.account.id,
        props.chat.id,
        value,
        props.replyTo?.id ?? undefined,
      );
    }
    setText("");
    props.onSent();
  }

  function signalTyping() {
    // Telegram clients throttle typing events to ~1 per 4 seconds.
    const now = Date.now();
    if (now - lastTypingSent.current > 4000) {
      lastTypingSent.current = now;
      api.setTyping(props.account.id, props.chat.id).catch(() => {});
    }
  }

  return (
    <footer className="composer">
      {props.editing && (
        <div className="composer-banner">
          ✎ Editing message
          <button className="link" onClick={() => { props.onCancelEdit(); setText(""); }}>
            cancel
          </button>
        </div>
      )}
      {props.replyTo && !props.editing && (
        <div className="composer-banner">
          ↩ Replying to: {props.replyTo.text.slice(0, 60)}
          <button className="link" onClick={props.onCancelReply}>
            cancel
          </button>
        </div>
      )}
      <div className="composer-row">
        <button className="attach" title="Attach file" onClick={props.onAttach}>
          📎
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Message"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            signalTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape" && props.editing) {
              props.onCancelEdit();
              setText("");
            }
          }}
        />
        <button
          className="send"
          disabled={text.trim() === ""}
          onClick={() => void submit()}
        >
          {props.editing ? "Save" : "Send"}
        </button>
      </div>
    </footer>
  );
}
