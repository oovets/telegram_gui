import { useEffect, useState } from "react";
import { api } from "../api";
import type { Account, Message } from "../types";

/** Renders a message's media: inline for photos/stickers, a card for files. */
export default function MediaBlock(props: {
  account: Account;
  message: Message;
  onSaveDocument: (cacheKey: string, suggestedName: string) => void;
}) {
  const { message } = props;
  const media = message.media;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Photos and stickers load automatically (cache-first on the backend).
  useEffect(() => {
    if (!media || (media.type !== "photo" && media.type !== "sticker")) return;
    if (message.id <= 0) return; // pending upload: nothing to fetch yet
    let cancelled = false;
    setLoading(true);
    api
      .mediaDataUrl(
        message.account_id,
        message.chat_id,
        message.id,
        media.cache_key,
        media.type === "photo" ? "image/jpeg" : "image/webp",
      )
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [media, message.account_id, message.chat_id, message.id]);

  if (!media) return null;

  switch (media.type) {
    case "photo":
    case "sticker": {
      const alt = media.type === "sticker" ? media.emoji : "Photo";
      // Reserve the on-screen box from known dimensions so the message list
      // doesn't reflow (and scroll-jump) when the bytes finish loading.
      const aspect =
        media.type === "photo" && media.width > 0 && media.height > 0
          ? media.width / media.height
          : undefined;
      const boxStyle = aspect ? { aspectRatio: String(aspect) } : undefined;
      if (imageUrl) {
        return (
          <img
            className={`media-${media.type}`}
            style={boxStyle}
            src={imageUrl}
            alt={alt}
          />
        );
      }
      return (
        <div className="media-placeholder" style={boxStyle}>
          {failed ? "⚠ failed to load" : loading ? "Loading media…" : alt}
        </div>
      );
    }
    case "document": {
      const sizeMb = (media.size_bytes / (1024 * 1024)).toFixed(1);
      return (
        <button
          className="media-document"
          title="Download and save"
          onClick={async () => {
            // Fetch into the encrypted cache first, then let the user pick a
            // plaintext destination.
            setLoading(true);
            try {
              await api.mediaDataUrl(
                message.account_id,
                message.chat_id,
                message.id,
                media.cache_key,
                media.mime_type,
              );
              props.onSaveDocument(media.cache_key, media.file_name);
            } finally {
              setLoading(false);
            }
          }}
        >
          📎 {media.file_name}
          <span className="muted small">
            {" "}
            {sizeMb} MB{loading ? " · downloading…" : ""}
          </span>
        </button>
      );
    }
    case "other":
      return <div className="media-placeholder">{media.description}</div>;
  }
}
