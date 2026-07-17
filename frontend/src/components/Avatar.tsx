import { useEffect, useRef, useState } from "react";

// Colour palette for initials fallbacks (Telegram-ish).
const COLORS = [
  "#e17076", "#eda86c", "#a695e7", "#7bc862",
  "#6ec9cb", "#65aadd", "#ee7aae", "#f0916f",
];

/** Deterministic colour for a seed (user/chat id), so a peer keeps its hue. */
function colorFor(seed: number): string {
  return COLORS[Math.abs(Math.trunc(seed)) % COLORS.length];
}

/** Up to two uppercase initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Process-wide memo so an image is fetched once, not per render/scroll.
// `null` means "resolved: no photo".
const imageCache = new Map<string, string | null>();

/**
 * Round avatar. Renders coloured initials immediately; if `load` is provided
 * (and `enabled`), lazily resolves the real photo and swaps it in.
 */
export default function Avatar(props: {
  name: string;
  seed: number;
  size?: number;
  enabled: boolean;
  /** Stable identity for the image memo (e.g. `"acct:chat"`). */
  cacheKey?: string;
  /** Fetches the photo data URL, or null when there is none. */
  load?: () => Promise<string | null>;
}) {
  const size = props.size ?? 38;
  const { cacheKey, enabled } = props;
  const [url, setUrl] = useState<string | null>(() =>
    cacheKey ? imageCache.get(cacheKey) ?? null : null,
  );

  // Keep the latest loader without retriggering the effect every render.
  const loadRef = useRef(props.load);
  loadRef.current = props.load;

  useEffect(() => {
    if (!enabled || !cacheKey || !loadRef.current) return;
    if (imageCache.has(cacheKey)) {
      setUrl(imageCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    loadRef
      .current()
      .then((resolved) => {
        imageCache.set(cacheKey, resolved);
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => imageCache.set(cacheKey, null));
    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled]);

  const style = { width: size, height: size } as const;
  if (enabled && url) {
    return <img className="avatar avatar-img" style={style} src={url} alt={props.name} />;
  }
  return (
    <div
      className="avatar avatar-fallback"
      style={{ ...style, background: colorFor(props.seed), fontSize: size * 0.4 }}
    >
      {initials(props.name)}
    </div>
  );
}
