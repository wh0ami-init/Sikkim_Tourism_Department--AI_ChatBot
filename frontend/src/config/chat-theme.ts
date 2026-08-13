/**
 * Chat palette — single source of truth for both the chat panel (chat.tsx) and
 * the floating widget (chat-widget.tsx). Reads the live theme from
 * `<html class="dark">` so every chat surface flips with the page toggle.
 *
 * Hex values are kept here only as design tokens; the live pixel values that
 * the browser actually paints come from the CSS custom properties defined on
 * `:root` and `.dark` in `index.css`. We resolve them via `getComputedStyle`
 * once per theme change to stay in sync.
 */
import { useEffect, useState } from "react";

export type ChatTheme = {
  bg: string;
  bgDeep: string;
  surface: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  inkFaint: string;
  pine: string;
  pineAlt: string;
  pineOn: string;
  accent: string;
  accentSoft: string;
  assistantBubble: string;
  flags: string[];
  /** Tokens for the launcher button + hint chip (theme-aware inverts). */
  launcherFg: string;
  launcherSurface: string;
  launcherHintBg: string;
  launcherHintInk: string;
};

/* ── Fallback palettes — mirror the values in :root / .dark. They are only
     used during the very first render before CSS has parsed. ──────────── */
const LIGHT: ChatTheme = {
  bg: "rgba(241, 248, 246, 0.68)",
  bgDeep: "rgba(218, 235, 228, 0.74)",
  surface: "rgba(255, 255, 255, 0.6)",
  border: "rgba(20, 60, 50, 0.1)",
  borderStrong: "rgba(20, 60, 50, 0.18)",
  ink: "#142622",
  inkSoft: "#435650",
  inkMuted: "#6E7F78",
  inkFaint: "#93A29B",
  pine: "#126B52",
  pineAlt: "#168060",
  pineOn: "#FFFFFF",
  accent: "#A95C16",
  accentSoft: "rgba(169, 92, 22, 0.16)",
  assistantBubble: "rgba(255, 255, 255, 0.55)",
  flags: ["#E2B821", "#3FA45A", "#C73E2A", "#F1ECE0","#1E5AA8"],
  launcherFg: "#FFFFFF",
  launcherSurface: "rgba(255, 255, 255, 0.7)",
  launcherHintBg: "rgba(255, 255, 255, 0.72)",
  launcherHintInk: "#142622",
};

const DARK: ChatTheme = {
  bg: "rgba(8, 20, 23, 0.72)",
  bgDeep: "rgba(14, 34, 36, 0.8)",
  surface: "rgba(19, 43, 43, 0.72)",
  border: "rgba(173, 224, 213, 0.13)",
  borderStrong: "rgba(173, 224, 213, 0.24)",
  ink: "#EDF8F4",
  inkSoft: "#BED6CE",
  inkMuted: "#91AEA4",
  inkFaint: "#68857C",
  pine: "#0B6758",
  pineAlt: "#137966",
  pineOn: "#FFFFFF",
  accent: "#F7C65B",
  accentSoft: "rgba(247, 198, 91, 0.17)",
  assistantBubble: "rgba(209, 240, 230, 0.08)",
  flags: ["#E2B821", "#3FA45A", "#C73E2A", "#F1ECE0","#1E5AA8"],
  launcherFg: "#FFFFFF",
  launcherSurface: "rgba(16, 39, 40, 0.78)",
  launcherHintBg: "rgba(16, 39, 40, 0.82)",
  launcherHintInk: "#EDF8F4",
};

/* Names of the CSS variables that drive the styled surfaces, in the order */
const VAR_NAMES = [
  "bg",
  "bgDeep",
  "surface",
  "border",
  "borderStrong",
  "ink",
  "inkSoft",
  "inkMuted",
  "inkFaint",
  "pine",
  "pineAlt",
  "pineOn",
  "accent",
  "accentSoft",
  "assistantBubble",
  "launcherFg",
  "launcherSurface",
  "launcherHintBg",
  "launcherHintInk",
] as const;

/** Resolve the live values for the current theme straight from CSS. */
function readTheme(isDark: boolean): ChatTheme {
  if (typeof window === "undefined") return isDark ? DARK : LIGHT;
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  /* On the very first render `getComputedStyle` may not have parsed yet; the
     fallback objects below still render the correct palette because they
     mirror the values defined on :root / .dark in `index.css`. */
  const base = isDark ? DARK : LIGHT;
  const resolved: Record<string, string> = {};
  for (const key of VAR_NAMES) {
    const cssName = `--chat-${kebab(key)}`;
    const val = computed.getPropertyValue(cssName).trim();
    resolved[key] = val || (base[key as keyof ChatTheme] as string);
  }
  /* Flags don't change with the theme — keep them stable across both. */
  return { ...base, ...resolved } as ChatTheme;
}

function kebab(s: string) {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/**
 * Hook that returns a theme-aware ChatTheme object, re-rendering any consumer
 * whenever the page theme flips. Reads theme from the `dark` class on
 * `<html>` and listens for class mutations so the chat surfaces stay in lock
 * step with the header toggle.
 */
export function useChatTheme(): ChatTheme {
  const [theme, setTheme] = useState<ChatTheme>(() => {
    if (typeof window === "undefined") return LIGHT;
    return readTheme(document.documentElement.classList.contains("dark"));
  });

  useEffect(() => {
    const apply = () => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(readTheme(isDark));
    };

    /* Initial sync (in case CSS vars were not yet available above). */
    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      // "class" catches the light/dark toggle; "style" catches the custom
      // dark-mode color picker, which sets --chat-* vars inline rather than
      // via a class change.
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/** Five prayer-flag colours used in the header band hairline. */
export const PRAYER_FLAGS = ["#E2B821", "#3FA45A", "#C73E2A", "#F1ECE0","#1E5AA8"];
