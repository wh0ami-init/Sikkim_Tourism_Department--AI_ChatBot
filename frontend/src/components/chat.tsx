import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  MapPin,
  MountainSnow,
  Calendar,
  ChevronDown,
  ChevronRight,
  Mic,
  MicOff,
  Camera,
  RefreshCw,
  X,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ImageIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createConversation, fetchConversation, type Message } from "@/lib/api";
import { GOVT_LOGO_SRC } from "@/config/brand";
import { PrayerFlagBar } from "@/components/prayer-flag-bar";
import { withAlpha } from "@/lib/utils";
import { useChatTheme, type ChatTheme } from "@/config/chat-theme";

const STARTERS = [
  {
    text: "What permits do I need for Nathula Pass?",
    icon: MapPin,
    eyebrow: "Permits",
  },
  {
    text: "When is the best time to visit Gangtok?",
    icon: Calendar,
    eyebrow: "Timing",
  },
  {
    text: "Plan a 3-day Sikkim trip for me.",
    icon: Calendar,
    eyebrow: "Trip planner",
  },
  {
    text: "How do I reach Gurudongmar Lake?",
    icon: MountainSnow,
    eyebrow: "Routes",
  },
];

// ── Image attachment state held in the composer ───────────────────────────────
interface PendingImage {
  dataUrl: string; // for preview + user bubble display
  base64: string; // raw base64 without data-URI prefix — sent to backend
  mimeType: string; // e.g. "image/jpeg"
}

// Max attachment size: 4 MB
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/* ── Format a timestamp like "9:42 AM" so threads feel real. ─────────────── */
function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/* ── Calm three-dot typing indicator. Shows a contextual label when image. ── */
function ThinkingIndicator({ isImage = false }: { isImage?: boolean }) {
  const theme = useChatTheme();
  return (
    <div
      className="flex items-center gap-2 py-0.5"
      aria-label="Assistant is responding"
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-2 w-2 rounded-full"
            style={{
              background: `linear-gradient(135deg, ${theme.pine}, ${theme.pineAlt})`,
              boxShadow: `0 0 8px 0 ${theme.pine}`,
            }}
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
      {isImage && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[0.78rem] font-medium tracking-wide"
          style={{ color: theme.inkSoft }}
        >
          Analysing image…
        </motion.span>
      )}
    </div>
  );
}

function sanitizeMarkdown(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|span)\b[^>]*>/gi, "");
}

/* ── Assistant markdown renderer. Sober, readable, brand-coloured links. ── */
function AssistantMessage({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const clean = sanitizeMarkdown(content);
  const theme = useChatTheme();
  return (
    <div
      className={`chat-markdown min-w-0 max-w-full text-[0.95rem] leading-[1.6] space-y-2.5 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
        streaming ? "chat-streaming-cursor" : ""
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-[1.6]">{children}</p>,
          strong: ({ children }) => (
            <strong style={{ color: theme.pine, fontWeight: 600 }}>
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:opacity-80"
              style={{ color: theme.accent }}
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 marker:opacity-50">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 marker:opacity-50">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
          h1: ({ children }) => (
            <h3
              className="text-[1.02rem] mt-2.5 font-semibold tracking-tight"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3
              className="text-[1.02rem] mt-2.5 font-semibold tracking-tight"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4
              className="text-[0.98rem] mt-2 font-semibold"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {children}
            </h4>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="border-l-2 pl-3 italic text-[0.9rem]"
              style={{ borderColor: theme.accentSoft, color: theme.inkSoft }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code
              className="px-1.5 py-0.5 rounded text-[0.85em]"
              style={{
                background: theme.bgDeep,
                color: theme.pine,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            >
              {children}
            </code>
          ),
          hr: () => (
            <hr
              className="my-3 border-0 h-px"
              style={{ background: theme.border }}
            />
          ),
          table: ({ children }) => (
            <div
              className="chat-table my-2 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-md border touch-pan-x"
              style={{
                borderColor: theme.border,
                WebkitOverflowScrolling: "touch",
              }}
              role="region"
              aria-label="Scrollable response table"
              tabIndex={0}
            >
              <table className="w-full min-w-[18rem] table-fixed border-collapse text-xs sm:w-max sm:min-w-[34rem] sm:text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="break-words px-2 py-1.5 text-left font-semibold border-b sm:whitespace-nowrap"
              style={{ borderColor: theme.border, background: theme.bgDeep }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="break-words px-2 py-1.5 align-top border-b"
              style={{ borderColor: theme.border, maxWidth: "14rem" }}
            >
              {children}
            </td>
          ),
        }}
      >
        {clean}
      </ReactMarkdown>
    </div>
  );
}

/* ── Empty state — landing surface, no gimmicks. ────────────────────────── */
function EmptyState({
  onPick,
  compact,
}: {
  onPick: (text: string) => void;
  compact: boolean;
}) {
  const theme = useChatTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex flex-col items-center text-center mx-auto w-full ${
        compact ? "max-w-md py-7 gap-5" : "max-w-xl py-12 gap-7"
      }`}
    >
      {/* Brass seal-style emblem — single accent on the page */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative flex items-center justify-center rounded-full shadow-[0_8px_28px_-12px_rgba(19,66,56,0.35)]"
        style={{
          background: "#FFFFFF",
          border: `1px solid ${theme.border}`,
          padding: compact ? 8 : 11,
        }}
      >
        <span
          className="pointer-events-none absolute -inset-3 -z-10 rounded-full opacity-40 blur-xl"
          style={{ background: theme.pine }}
          aria-hidden="true"
        />
        <img
          src={GOVT_LOGO_SRC}
          alt="Government of Sikkim"
          draggable={false}
          className={compact ? "h-9 w-9" : "h-12 w-12"}
          style={{ objectFit: "contain" }}
        />
      </motion.div>

      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        <p
          className={`font-semibold uppercase tracking-[0.18em] ${
            compact ? "text-[0.6rem]" : "text-[0.66rem]"
          }`}
          style={{ color: theme.accent }}
        >
          Sikkim Tourism · Civil Aviation
        </p>
        <h1
          className={
            compact ? "text-[1.5rem]" : "text-[1.9rem] sm:text-[2.1rem]"
          }
          style={{
            fontFamily: "Fraunces, serif",
            color: theme.ink,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
          }}
        >
          Ask me anything about Sikkim
        </h1>
        <p
          className={`mx-auto leading-relaxed ${
            compact ? "text-[0.83rem] max-w-[260px]" : "text-[0.95rem] max-w-md"
          }`}
          style={{ color: theme.inkSoft }}
        >
          Permits, monastery hours, the road to Gurudongmar, what to pack for
          Yumthang — answered from the Department's own records.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center gap-2">
        {[
          { icon: ImageIcon, label: "Upload a photo" },
          { icon: Mic, label: "Speak your question" },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.72rem] font-medium"
            style={{
              borderColor: withAlpha(theme.pine, 0.3),
              color: theme.pine,
              background: withAlpha(theme.pine, 0.06),
            }}
          >
            <Icon className="h-3 w-3" strokeWidth={1.8} />
            {label}
          </span>
        ))}
      </div>

      {/* Suggested questions — staggered entrance, chevron + shimmer on hover. */}
      <div className="w-full space-y-2">
        {STARTERS.map(({ text, icon: Icon, eyebrow }, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => onPick(text)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.15 + i * 0.08,
              duration: 0.35,
              ease: "easeOut",
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left shadow-[0_1px_0_rgba(19,66,56,0.04)] backdrop-blur-md transition-shadow duration-200 hover:shadow-[0_10px_26px_-10px_rgba(19,66,56,0.32)]"
            style={{ borderColor: theme.border, background: theme.surface }}
          >
            <span
              className="pointer-events-none absolute inset-y-0 -left-1/3 hidden w-1/3 -skew-x-12 bg-white/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:animate-chat-shimmer sm:block"
              aria-hidden="true"
            />
            <span
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
              style={{ background: theme.bgDeep, color: theme.pine }}
            >
              <Icon className="h-4 w-4" strokeWidth={1.7} />
            </span>
            <span className="relative min-w-0 flex-1">
              <span
                className="block text-[0.6rem] font-semibold uppercase tracking-[0.16em]"
                style={{ color: theme.accent }}
              >
                {eyebrow}
              </span>
              <span
                className="block text-[0.88rem] font-medium leading-snug mt-0.5"
                style={{ color: theme.ink }}
              >
                {text}
              </span>
            </span>
            <ChevronRight
              className="relative h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              style={{ color: theme.borderStrong }}
            />
          </motion.button>
        ))}
      </div>

      <p
        className={compact ? "text-[0.7rem]" : "text-[0.74rem]"}
        style={{ color: theme.inkMuted }}
      >
        Your conversations are private — used only to keep context within this
        session.
      </p>
    </motion.div>
  );
}

/* ── Copy-to-clipboard button — shown on hover over assistant messages. ───── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const theme = useChatTheme();
  // Refreshed messages replace this bubble's content on every stream tick,
  // so the "Copied!" reset timer can easily still be pending when React
  // tears the button down. Track it so we can clear it on unmount instead
  // of firing setState on a component that's no longer there.
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-https / old browser) — silently ignore.
    }
  };

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy response"}
      whileTap={{ scale: 0.9 }}
      className="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
      style={{
        color: copied ? theme.pine : theme.inkMuted,
        background: withAlpha(theme.pine, copied ? 0.1 : 0),
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <Copy className="h-3 w-3" strokeWidth={2} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/* ── Helpful / Not-helpful feedback — local state only, no backend call. ─── */
function FeedbackButtons() {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const theme = useChatTheme();

  const btn = (dir: "up" | "down") => {
    const active = vote === dir;
    return (
      <motion.button
        type="button"
        onClick={() => setVote(active ? null : dir)}
        title={dir === "up" ? "Helpful" : "Not helpful"}
        whileTap={{ scale: 0.85 }}
        className="flex h-6 w-6 items-center justify-center rounded-full transition-colors"
        style={{
          color: active
            ? dir === "up"
              ? theme.pine
              : "#e05252"
            : theme.inkMuted,
          background: active
            ? withAlpha(dir === "up" ? theme.pine : "#e05252", 0.1)
            : "transparent",
        }}
      >
        {dir === "up" ? (
          <ThumbsUp className="h-3 w-3" strokeWidth={active ? 2.5 : 2} />
        ) : (
          <ThumbsDown className="h-3 w-3" strokeWidth={active ? 2.5 : 2} />
        )}
      </motion.button>
    );
  };

  return (
    <div className="flex items-center gap-0.5">
      {btn("up")}
      {btn("down")}
      {vote && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="ml-1 text-[0.65rem] font-medium"
          style={{ color: vote === "up" ? theme.pine : "#e05252" }}
        >
          {vote === "up" ? "Thanks!" : "Got it"}
        </motion.span>
      )}
    </div>
  );
}

/* ── Single chat bubble. Assistant on the left, user on the right. ───────── */
function Bubble({
  msg,
  showTime,
  streaming,
  isLast,
  onSuggestionClick,
  onRetry,
  isImageTurn,
}: {
  msg: Message;
  showTime: boolean;
  streaming?: boolean;
  isLast?: boolean;
  onSuggestionClick?: (text: string) => void;
  onRetry?: () => void;
  isImageTurn?: boolean;
}) {
  const theme = useChatTheme();
  const isUser = msg.role === "user";

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.26,
            delay: 0.06,
            ease: [0.34, 1.56, 0.64, 1],
          }}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden"
          style={{ background: "#FFFFFF", border: `1px solid ${theme.border}` }}
        >
          <img
            src={GOVT_LOGO_SRC}
            alt=""
            draggable={false}
            className="h-full w-full object-contain p-0.5"
          />
        </motion.div>
      )}

      <div
        className={`min-w-0 ${isUser ? "max-w-[85%] sm:max-w-[78%]" : "max-w-[92%] sm:max-w-[88%]"}`}
      >
        {!isUser && showTime && (
          <div
            className="mb-1 flex items-center gap-2 text-[0.66rem] font-medium tracking-wide"
            style={{ color: theme.inkMuted }}
          >
            <span>Sikkim Tourism Assistant</span>
            <span
              className="h-0.5 w-0.5 rounded-full"
              style={{ background: theme.inkMuted }}
            />
            <span>{formatTime(msg.createdAt)}</span>
          </div>
        )}
        <motion.div
          className={`rounded-2xl px-3.5 py-2.5 backdrop-blur-md ${
            isUser ? "rounded-tr-md" : "rounded-tl-md"
          }`}
          animate={
            !msg.content
              ? {
                  boxShadow: [
                    `0 1px 0 rgba(19,66,56,0.04), 0 0 0px 0 ${theme.pine}`,
                    `0 1px 0 rgba(19,66,56,0.04), 0 0 18px 2px ${theme.pine}55`,
                    `0 1px 0 rgba(19,66,56,0.04), 0 0 0px 0 ${theme.pine}`,
                  ],
                }
              : undefined
          }
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: isUser
              ? `linear-gradient(135deg, ${theme.pine} 0%, ${theme.pineAlt} 100%)`
              : theme.assistantBubble,
            color: isUser ? theme.pineOn : theme.ink,
            border: isUser ? "none" : `1px solid ${theme.border}`,
            boxShadow: isUser
              ? "0 8px 20px -10px rgba(19,66,56,0.45)"
              : "0 1px 0 rgba(19,66,56,0.04), 0 1px 2px rgba(19,66,56,0.04)",
          }}
        >
          {/* Image thumbnail in user bubble */}
          {isUser && msg.imageDataUrl && (
            <div className="mb-2 overflow-hidden rounded-xl">
              <img
                src={msg.imageDataUrl}
                alt="Attached image"
                className="max-h-48 w-full object-cover rounded-xl"
                draggable={false}
              />
            </div>
          )}

          {msg.content ? (
            isUser ? (
              msg.content !== "[image]" ? (
                <div className="whitespace-pre-wrap text-[0.93rem] leading-[1.55]">
                  {msg.content}
                </div>
              ) : null
            ) : (
              <AssistantMessage content={msg.content} streaming={streaming} />
            )
          ) : (
            <ThinkingIndicator isImage={isImageTurn} />
          )}
        </motion.div>

        {/* Provenance line — only for longer assistant answers. */}
        {!isUser && msg.content && msg.content.length > 180 && (
          <p
            className="mt-1.5 text-[0.62rem] tracking-wide"
            style={{ color: theme.inkFaint }}
          >
            Grounded in official Department records.
          </p>
        )}

        {/* Action row: copy + feedback. Visible once the response has
                    finished streaming — no longer tied to hover state, so it
                    doesn't vanish the moment the mouse moves away. */}
        {!isUser && msg.content && !streaming && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="mt-1.5 flex items-center gap-1"
          >
            <CopyButton text={msg.content} />
            <span
              className="mx-1 h-3 w-px"
              style={{ background: theme.border }}
              aria-hidden="true"
            />
            <FeedbackButtons />
          </motion.div>
        )}

        {!isUser && msg.retry && !streaming && (
          <div
            className="mt-2 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[0.72rem]"
            style={{
              borderColor: withAlpha("#d88b32", 0.42),
              background: withAlpha("#d88b32", 0.08),
              color: theme.inkSoft,
            }}
          >
            <span>
              Connection interrupted. This response may be incomplete.
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 font-semibold transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2"
              style={{ color: theme.pine }}
              aria-label="Try sending the message again"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Try again
            </button>
          </div>
        )}

        {/* Follow-up suggestion chips */}
        {!isUser &&
          isLast &&
          !streaming &&
          msg.suggestions &&
          msg.suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {msg.suggestions.map((text, i) => (
                <motion.button
                  key={i}
                  type="button"
                  onClick={() => onSuggestionClick?.(text)}
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: i * 0.06,
                    duration: 0.22,
                    ease: "easeOut",
                  }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className="group relative overflow-hidden rounded-full border px-3 py-1.5 text-[0.78rem] font-medium transition-colors hover:opacity-90"
                  style={{
                    borderColor: withAlpha(theme.pine, 0.4),
                    color: theme.pine,
                    background: withAlpha(theme.pine, 0.06),
                  }}
                >
                  <span
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:animate-chat-shimmer"
                    aria-hidden="true"
                  />
                  <span className="relative">{text}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Main Chat — works in two modes:

   compact=true   → widget body (panel/launcher variant). Background is fixed
                   parchment; messages fill the available region.
   compact=false  → standalone full-page chat. Same look, more breathing room.

   Both render identically: same palette, same spacing, same bubble rules.
   ─────────────────────────────────────────────────────────────────────── */
export function Chat({ compact = false, wide = false }: { compact?: boolean; wide?: boolean }) {
  const theme = useChatTheme();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationAccessToken, setConversationAccessToken] = useState<
    string | null
  >(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastSentHadImage, setLastSentHadImage] = useState(false);
  const [failedTurn, setFailedTurn] = useState<{
    text: string;
    image: PendingImage | null;
    clientMessageId: string;
  } | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowStreamRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Belt-and-suspenders re-entrancy lock for handleSend. The `isStreaming`
  // state check alone isn't enough: state updates are batched, so two
  // Enter presses (key repeat) or a double-click on Send fire before the
  // textarea's `disabled` prop actually takes effect, and both calls read
  // the same stale `isStreaming = false`. A ref is written synchronously,
  // so the second call sees it immediately — no render round-trip needed.
  const isSendingRef = useRef(false);

  // Check for Web Speech API support on mount
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      recognitionRef.current?.stop();
    };
  }, []);

  /* Grow the textarea with content, capped so it never eats the thread. */
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  /* Follow streamed text only while the visitor is already reading at the
     bottom. This prevents a long answer from pulling someone back down while
     they have deliberately scrolled up to reread an earlier section. */
  const scrollToBottom = useCallback((force = false) => {
    requestAnimationFrame(() => {
      if (!force && !shouldFollowStreamRef.current) return;
      const viewport = scrollRef.current?.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );
      if (!viewport) return;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: isStreaming ? "auto" : "smooth",
      });
    });
  }, [isStreaming]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport]",
    );
    if (!viewport) return;

    const onScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const isNearBottom = distanceFromBottom < 72;
      shouldFollowStreamRef.current = isNearBottom;
      setShowJumpToLatest(!isNearBottom);
    };
    onScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  /* Auto-focus the input field once a turn ends so users can keep typing. */
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const t = setTimeout(
        () => inputRef.current?.focus({ preventScroll: true }),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [isStreaming, messages.length]);

  /* ── Voice input ────────────────────────────────────────────────────── */
  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = "en-IN"; // Indian English — works for regional accents
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = true;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isListening]);

  /* ── Image attachment ───────────────────────────────────────────────── */
  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setImageError(null);
      const file = e.target.files?.[0];
      // Reset the input so the same file can be re-selected if needed.
      e.target.value = "";
      if (!file) return;

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setImageError("Only JPEG, PNG, and WebP images are supported.");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageError("Image must be under 4 MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Strip the "data:<mime>;base64," prefix — backend wants raw base64.
        const base64 = dataUrl.split(",")[1] ?? "";
        setPendingImage({ dataUrl, base64, mimeType: file.type });
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const clearPendingImage = useCallback(() => {
    setPendingImage(null);
    setImageError(null);
    setChatError(null);
  }, []);

  /* ── Send ───────────────────────────────────────────────────────────── */
  const handleSend = async (
    text: string,
    imageOverride?: PendingImage | null,
    retryClientMessageId?: string,
  ) => {
    const trimmed = text.trim();
    const image = imageOverride !== undefined ? imageOverride : pendingImage;

    // Require at least text OR an image.
    if ((!trimmed && !image) || isStreaming || isSendingRef.current) return;
    isSendingRef.current = true;
    shouldFollowStreamRef.current = true;
    setShowJumpToLatest(false);

    setInput("");
    setPendingImage(null);
    setImageError(null);
    setFailedTurn(null);
    setMessages((prev) =>
      prev.map((message) => ({ ...message, retry: false })),
    );

    // Stop any active voice session.
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    let currentConvId = conversationId;
    let currentAccessToken = conversationAccessToken;

    if (!currentConvId || !currentAccessToken) {
      try {
        const res = await createConversation();

        setConversationId(res.conversation.id);
        setConversationAccessToken(res.accessToken);

        currentConvId = res.conversation.id;
        currentAccessToken = res.accessToken;
      } catch (e) {
        console.error("Failed to create conversation", e);
        setChatError("The assistant could not start a secure conversation. Please try again.");
        setFailedTurn({
          text: trimmed,
          image: image ?? null,
          clientMessageId: retryClientMessageId ?? crypto.randomUUID(),
        });
        isSendingRef.current = false;
        return;
      }
    }

    const now = new Date().toISOString();
    // When only an image is sent, show a short display text in the bubble.
    const displayText = trimmed || (image ? "" : "");
    const clientMessageId = retryClientMessageId ?? crypto.randomUUID();
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      conversationId: currentConvId,
      role: "user",
      content: displayText,
      createdAt: now,
      imageDataUrl: image?.dataUrl,
      clientMessageId,
    };
    const assistantMsg: Message = {
      id: `a-${Date.now()}`,
      conversationId: currentConvId,
      role: "assistant",
      content: "",
      createdAt: now,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setLastSentHadImage(!!image);

    // Cancel any previous in-flight stream first
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Build request body — include image only when present.
    const requestBody: Record<string, unknown> = {
      message:
        trimmed ||
        "Please describe and identify what you see in this image in the context of Sikkim.",
      client_message_id: clientMessageId,
    };
    if (image) {
      requestBody.image_base64 = image.base64;
      requestBody.image_mime_type = image.mimeType;
    }

    let shouldRefreshConversation = true;
    try {
      if (!currentAccessToken) {
        throw new Error(
          "Conversation access token is missing. Please start a new conversation.",
        );
      }

      const response = await fetch(`/api/conversations/${currentConvId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Conversation-Token": currentAccessToken,
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });
      if (!response.ok)
        throw new Error(
          `Server returned ${response.status} — please try again.`,
        );
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";
      let streamFinished = false;

      while (true) {
        const { value, done } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            const dataStr = part.slice(6).trim();
            if (!dataStr) continue;
            if (dataStr === "[DONE]") {
              streamFinished = true;
              continue;
            }
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                assistantContent += data.text;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: assistantContent,
                  };
                  return updated;
                });
              }
              if (Array.isArray(data.suggestions) && data.suggestions.length) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    suggestions: data.suggestions,
                  };
                  return updated;
                });
              }
            } catch {
              /* non-JSON line — skip */
            }
          }
        }
        if (done) break;
      }

      if (!streamFinished) {
        throw new Error("The response stream ended before completion.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        shouldRefreshConversation = false;
        return;
      }
      console.error("Chat error:", error);
      shouldRefreshConversation = false;
      setFailedTurn({ text: trimmed, image: image ?? null, clientMessageId });
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated.at(-1);
        if (last?.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: last.content || "I couldn't reach the assistant just now.",
            retry: true,
          };
        }
        return updated;
      });
    } finally {
      // Guard against a superseded call clobbering the turn that
      // replaced it. `handleSend` is re-entrant by design — the abort
      // above exists specifically to cancel a stale in-flight request
      // — but that means TWO calls can both reach this `finally` block:
      // the aborted one and the one that superseded it. Whichever call
      // no longer owns `abortControllerRef.current` lost the race and
      // must not touch shared state, or it'll flip `isStreaming` back
      // to false mid-response and blow away the newer turn's messages
      // with a conversation fetch that doesn't know about it yet.
      const isCurrentRequest = abortControllerRef.current === abortController;
      if (isCurrentRequest) {
        setIsStreaming(false);
        setLastSentHadImage(false);
        abortControllerRef.current = null;
        isSendingRef.current = false;
      }

      // Keep a local connection error visible rather than replacing it
      // with the server's user-only conversation state.
      if (isCurrentRequest && currentConvId && shouldRefreshConversation) {
        try {
          if (!currentAccessToken) return;
          const res = await fetchConversation(
            currentConvId,
            currentAccessToken,
          );
          // The backend never persists `suggestions` (they're streamed once,
          // live, via SSE) — so a plain overwrite here would wipe out any
          // suggestion chips that just rendered. Match by position instead.
          setMessages((prev) => {
            const lastOptimistic = [...prev]
              .reverse()
              .find((m) => m.role === "assistant" && m.suggestions?.length);

            // Also preserve imageDataUrl on user messages — the backend
            // doesn't store it, so the refreshed list won't have it.
            // Keyed by clientMessageId (not array position) so a length
            // mismatch between the optimistic and server-authoritative
            // lists — e.g. a message that failed to persist, or a stale
            // fetch racing a new send — can't misattach an image to the
            // wrong message.
            const imageByClientId: Record<string, string> = {};
            prev.forEach((m) => {
              if (m.role === "user" && m.imageDataUrl && m.clientMessageId) {
                imageByClientId[m.clientMessageId] = m.imageDataUrl;
              }
            });

            let merged = res.messages.map((m) => ({
              ...m,
              imageDataUrl: m.clientMessageId
                ? imageByClientId[m.clientMessageId]
                : undefined,
            }));

            if (lastOptimistic) {
              const lastIndex = merged
                .map((m) => m.role)
                .lastIndexOf("assistant");
              if (lastIndex !== -1) {
                merged[lastIndex] = {
                  ...merged[lastIndex],
                  suggestions: lastOptimistic.suggestions,
                };
              }
            }
            return merged;
          });
        } catch {
          /* keep optimistic state */
        }
      }
    }
  };

  const retryFailedTurn = () => {
    if (failedTurn) {
      void handleSend(
        failedTurn.text,
        failedTurn.image,
        failedTurn.clientMessageId,
      );
    }
  };

  return (
    <div
      className="chat-conversation relative flex h-full min-h-0 flex-col backdrop-blur-xl backdrop-saturate-150"
      style={{ background: theme.bg }}
    >
      {/* Fixed colour wash behind the conversation */}
      <div
        className="chat-aurora pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(65% 50% at 100% 0%, ${withAlpha(theme.pine, 0.16)} 0%, transparent 72%),
            radial-gradient(60% 45% at 0% 100%, ${withAlpha(theme.accent, 0.11)} 0%, transparent 72%),
            radial-gradient(50% 40% at 100% 100%, ${withAlpha(theme.pineAlt, 0.1)} 0%, transparent 72%)
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative flex-1 min-h-0">
      <ScrollArea ref={scrollRef} className="h-full min-h-0">
        <div
          className={`mx-auto w-full ${compact ? (wide ? "max-w-5xl px-4 pt-6 pb-5 sm:px-8" : "max-w-2xl px-3.5 pt-5 pb-4 sm:px-5") : "max-w-5xl px-4 pt-7 pb-6 sm:px-8 sm:pt-10"}`}
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(t) => handleSend(t)} compact={compact} />
          ) : (
            <div className="space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const prev = messages[idx - 1];
                  const showTime =
                    msg.role === "assistant" &&
                    (!prev || prev.role !== "assistant" || prev.id !== msg.id);
                  // Show "Analysing image…" only for the very last assistant
                  // bubble while streaming, and only when the turn that kicked
                  // it off included an image.
                  const showImageThinking =
                    lastSentHadImage &&
                    isStreaming &&
                    idx === messages.length - 1 &&
                    msg.role === "assistant" &&
                    !msg.content;
                  return (
                    <Bubble
                      key={msg.id}
                      msg={msg}
                      showTime={showTime}
                      streaming={isStreaming && idx === messages.length - 1}
                      isLast={idx === messages.length - 1}
                      onSuggestionClick={(text) => handleSend(text)}
                      onRetry={retryFailedTurn}
                      isImageTurn={showImageThinking}
                    />
                  );
                })}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </ScrollArea>
      <AnimatePresence>
        {showJumpToLatest && messages.length > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            onClick={() => {
              shouldFollowStreamRef.current = true;
              setShowJumpToLatest(false);
              scrollToBottom(true);
            }}
            className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5"
            style={{ borderColor: theme.border, background: theme.surface, color: theme.pine }}
          >
            Latest response <ChevronDown className="h-3.5 w-3.5" />
          </motion.button>
        )}
      </AnimatePresence>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden="true"
        onChange={handleImageSelect}
      />

      {/* Compose bar */}
      <div
        className="shrink-0 border-t backdrop-blur-xl backdrop-saturate-150"
        style={{
          background: theme.bg,
          borderColor: theme.border,
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          className={`mx-auto w-full ${compact ? (wide ? "max-w-5xl px-4 py-4 sm:px-8" : "max-w-2xl px-3.5 py-3 sm:px-5") : "max-w-5xl px-4 py-4 sm:px-8"}`}
        >
          {/* Image preview strip — shown above the textarea when an image is attached */}
          <AnimatePresence>
            {pendingImage && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div
                  className="relative inline-flex rounded-xl overflow-hidden border shadow-sm"
                  style={{ borderColor: theme.border }}
                >
                  <img
                    src={pendingImage.dataUrl}
                    alt="Image to send"
                    className="h-20 w-20 object-cover"
                    draggable={false}
                  />
                  <button
                    type="button"
                    onClick={clearPendingImage}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full shadow"
                    style={{ background: theme.pine, color: theme.pineOn }}
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error line */}
          <AnimatePresence>
            {imageError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-2 text-[0.72rem] font-medium"
                style={{ color: "#e05252" }}
              >
                {imageError}
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {chatError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[0.72rem] font-medium"
                style={{ borderColor: withAlpha("#d88b32", 0.42), background: withAlpha("#d88b32", 0.08), color: theme.inkSoft }}
                role="alert"
              >
                <span>{chatError}</span>
                {failedTurn && <button type="button" onClick={retryFailedTurn} className="shrink-0 font-bold underline underline-offset-2" style={{ color: theme.pine }}>Try again</button>}
              </motion.div>
            )}
          </AnimatePresence>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
              requestAnimationFrame(resizeInput);
            }}
            className="relative flex items-center gap-1.5 rounded-[1.4rem] border pr-1 shadow-[0_1px_0_rgba(19,66,56,0.04)] backdrop-blur-md transition-colors focus-within:shadow-[0_0_0_3px_rgba(19,66,56,0.12)]"
            style={{ borderColor: theme.border, background: theme.surface }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = theme.pine;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = theme.border;
            }}
          >
            {/* Image attach button */}
            <motion.button
              type="button"
              disabled={isStreaming}
              onClick={() => fileInputRef.current?.click()}
              title="Attach an image"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: pendingImage
                  ? withAlpha(theme.pine, 0.15)
                  : withAlpha(theme.pine, 0.07),
                color: theme.pine,
              }}
              aria-label="Attach image"
            >
              <Camera className="h-4 w-4" strokeWidth={1.8} />
            </motion.button>

            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                  requestAnimationFrame(resizeInput);
                }
              }}
              placeholder={
                pendingImage
                  ? "Ask about this image, or send as-is…"
                  : "Ask about permits, monasteries, routes…"
              }
              disabled={isStreaming}
              rows={1}
              className="max-h-[140px] min-h-0 flex-1 resize-none border-0 bg-transparent py-3.5 pl-1 text-[0.95rem] leading-[1.5] shadow-none outline-none focus-visible:ring-0"
              style={{ color: theme.ink, boxShadow: "none" }}
            />

            {/* Voice input button */}
            {voiceSupported && (
              <motion.button
                type="button"
                disabled={isStreaming}
                onClick={toggleVoice}
                title={isListening ? "Stop listening" : "Speak your question"}
                whileHover={!isStreaming ? { scale: 1.08 } : undefined}
                whileTap={!isStreaming ? { scale: 0.92 } : undefined}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: isListening
                    ? withAlpha("#e05252", 0.12)
                    : withAlpha(theme.pine, 0.07),
                  color: isListening ? "#e05252" : theme.pine,
                }}
                aria-label={
                  isListening ? "Stop voice input" : "Start voice input"
                }
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isListening ? (
                    <motion.span
                      key="listening"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: [1, 1.15, 1], opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{
                        scale: {
                          duration: 1,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                        opacity: { duration: 0.15 },
                      }}
                    >
                      <MicOff className="h-4 w-4" strokeWidth={1.8} />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="idle"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Mic className="h-4 w-4" strokeWidth={1.8} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            )}

            {/* Send button */}
            <motion.button
              type="submit"
              disabled={(!input.trim() && !pendingImage) || isStreaming}
              whileHover={
                input.trim() || pendingImage ? { scale: 1.08 } : undefined
              }
              whileTap={
                input.trim() || pendingImage ? { scale: 0.92 } : undefined
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-[0_6px_14px_-8px_rgba(19,66,56,0.6)] transition-shadow disabled:cursor-not-allowed disabled:shadow-none"
              style={{
                background:
                  input.trim() || pendingImage
                    ? `linear-gradient(135deg, ${theme.pine}, ${theme.pineAlt})`
                    : theme.borderStrong,
                color: theme.pineOn,
              }}
              aria-label="Send message"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isStreaming ? (
                  <motion.span
                    key="loading"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="send"
                    initial={{ opacity: 0, y: 6, rotate: -15 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    exit={{
                      opacity: 0,
                      x: 14,
                      y: -14,
                      rotate: 30,
                      transition: { duration: 0.25, ease: "easeIn" },
                    }}
                    transition={{ duration: 0.18 }}
                  >
                    <Send className="h-4 w-4" strokeWidth={2.2} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </form>

          <p
            className="mt-1.5 pl-1 text-[0.65rem]"
            style={{ color: theme.inkFaint }}
          >
            Enter to send · Shift+Enter for new line
            {voiceSupported && " · Mic to speak"}
          </p>

          {/* Footer micro-line */}
          <div
            className="mt-2 flex items-center justify-between gap-3 text-[0.66rem] tracking-wide"
            style={{ color: theme.inkFaint }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-1 w-1 rounded-full"
                style={{
                  background: "#3FA45A",
                  boxShadow: "0 0 0 3px rgba(63,164,90,0.18)",
                }}
              />
              Connected to official records
            </span>
            <PrayerFlagBar className="max-w-[72px] opacity-70" />
          </div>
        </div>
      </div>
    </div>
  );
}
