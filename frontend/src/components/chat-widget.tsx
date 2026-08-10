import { lazy, Suspense, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Maximize2, Minimize2, MessageCircle } from "lucide-react";
import { GOVT_LOGO_SRC } from "@/config/brand";
import { PrayerFlagBar } from "@/components/prayer-flag-bar";
import { useChatTheme } from "@/config/chat-theme";
import { useTypewriter } from "@/hooks/use-typewriter";
import { withAlpha } from "@/lib/utils";

// Markdown rendering and image/voice chat controls are only needed after a
// visitor opens the assistant. Deferring them materially reduces the landing
// page download on Vercel.
const Chat = lazy(() => import("@/components/chat").then((module) => ({ default: module.Chat })));

/* Bilingual greeting rotation for the launcher hint chip — English and
   Hindi, alternating, so the nudge reads naturally to both audiences. */
const GREETINGS = [
  "Namaste! Ask me anything 👋",
  "नमस्ते! कुछ भी पूछें 👋",
  "Need help planning your trip?",
  "यात्रा की योजना बनानी है?",
];



/* Keep this in sync with Tailwind's `sm` breakpoint (40rem / 640px). The
   fullscreen toggle is a desktop-only affordance — below this width the
   panel is already pinned edge-to-edge, so there's nothing to "expand". */
const MOBILE_BREAKPOINT_QUERY = "(max-width: 639px)";

/* ── Main widget ─────────────────────────────────────────────────────────── */
export function ChatWidget() {
  const theme = useChatTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const greeting = useTypewriter(GREETINGS);

  /* Gentle one-time hint that fades in 3s after page load and never repeats.
     No bounce, no wave, no rainbow ring — just a quiet nudge the first time. */
  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 3500);
    return () => clearTimeout(t);
  }, []);

  /* Track the viewport instead of assuming it. Previously `isFullscreen`
     was only ever flipped off from the header's "minimize" button, which
     itself is hidden below `sm`. So if a visitor went fullscreen on a wide
     window and then just resized it down (or opened dev tools, rotated a
     tablet, whatever), the state stayed stuck at `true` with the one control
     that could undo it nowhere on screen — the panel kept rendering the
     desktop fullscreen markup on a phone-sized viewport instead of falling
     back to the normal responsive layout. A media query listener catches
     that transition live instead of only reacting to button clicks. */
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const syncViewport = (e: MediaQueryList | MediaQueryListEvent) =>
      setIsMobileViewport(e.matches);

    syncViewport(mql);
    mql.addEventListener("change", syncViewport);
    return () => mql.removeEventListener("change", syncViewport);
  }, []);

  /* Drop out of fullscreen the moment we cross into mobile territory so the
     widget never gets caught displaying the desktop-only layout. */
  useEffect(() => {
    if (isMobileViewport && isFullscreen) {
      setIsFullscreen(false);
    }
  }, [isMobileViewport, isFullscreen]);

  /* The panel sits at z-[70] and covers the entire viewport whenever it's
     fullscreen on desktop or simply open on a phone (h-[100dvh]). Without
     locking the body, the page underneath keeps scrolling behind it — most
     noticeable on mobile Safari, where the address bar and page content
     both shift while you're mid-conversation. */
  useEffect(() => {
    if (!isOpen || (!isFullscreen && !isMobileViewport)) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isFullscreen, isMobileViewport]);

  const close = () => {
    setIsOpen(false);
    setIsFullscreen(false);
  };

  return (
    <>
      {/* ── Launcher ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-4 z-[60] flex flex-col items-end gap-2.5 sm:right-6 sm:bottom-6">
        <AnimatePresence>
          {!isOpen && showHint && (
            <motion.button
              type="button"
              onClick={() => setIsOpen(true)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="group flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-left shadow-[0_10px_28px_-14px_rgba(19,66,56,0.4)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:shadow-[0_14px_36px_-16px_rgba(19,66,56,0.5)]"
              style={{
                borderColor: theme.border,
                background: theme.launcherHintBg,
              }}
            >
              <span
                className="flex h-11 w-11 items-center justify-center rounded-full overflow-hidden"
                style={{
                  background: "#FFFFFF",
                  border: `1px solid ${theme.border}`,
                }}
              >
                <img
                  src={GOVT_LOGO_SRC}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="flex flex-col leading-tight">
                <span
                  className="text-[0.82rem] font-semibold whitespace-nowrap"
                  style={{
                    color: theme.launcherHintInk,
                    fontFamily: "Fraunces, serif",
                  }}
                >
                  {greeting}
                  <span
                    className="animate-chat-caret ml-0.5 inline-block h-[0.95em] w-[1.5px] translate-y-[0.12em] align-middle"
                    style={{ background: theme.accent }}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className="text-[0.62rem] uppercase tracking-[0.18em]"
                  style={{ color: theme.accent }}
                >
                  Tourism & Civil Aviation
                </span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <div className={!isOpen ? "animate-chat-float" : undefined}>
          <motion.button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              initial={{ scale: 0, opacity: 0, rotate: -25 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.3 }}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.05 }}
            className="chat-glow-ring focus-ring relative flex h-14 w-14 items-center justify-center rounded-full shadow-[0_14px_30px_-12px_rgba(19,66,56,0.55)] ring-1 ring-white/15 backdrop-blur-md transition-shadow hover:shadow-[0_18px_40px_-14px_rgba(19,66,56,0.6)] sm:h-[60px] sm:w-[60px]"
            style={{
              background: `linear-gradient(145deg, ${theme.pine} 0%, ${theme.pineAlt} 100%)`,
              color: theme.launcherFg,
            }}
            aria-label={isOpen ? "Close chat" : "Open Sikkim Tourism Assistant"}
          >
            {/* Single low-key notification halo — far calmer than before. */}
            {!isOpen && (
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: "rgba(19,66,56,0.18)",
                  animation: "chat-launcher-halo 3.2s ease-in-out infinite",
                }}
                aria-hidden
              />
            )}
            <AnimatePresence mode="wait" initial={false}>
              {isOpen ? (
                <motion.span
                  key="close"
                  initial={{ opacity: 0, rotate: -45 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 45 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <X className="h-5 w-5" strokeWidth={2.2} />
                </motion.span>
              ) : (
                <motion.span
                  key="open"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="relative"
                >
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2"
                    style={{
                      background: theme.accent,
                      borderColor: theme.pine,
                    }}
                    aria-hidden
                  >
                    <MessageCircle
                      className="h-2 w-2 text-white"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm sm:h-16 sm:w-16">
                    <img
                      src={GOVT_LOGO_SRC}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-contain p-0.5"
                    />
                  </span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
            <motion.div
                key="panel"
                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 12 }}
                transition={{ type: "spring", stiffness: 340, damping: 28 }}
                style={{ transformOrigin: "bottom right" }}
            className={
              isFullscreen
                ? "fixed inset-0 z-[70] sm:inset-3"
                : "fixed inset-x-0 bottom-0 z-[70] h-[100dvh] sm:inset-auto sm:right-6 sm:bottom-[calc(60px+1.25rem)] sm:h-[78vh] sm:max-h-[680px] sm:w-[404px]"
            }
          >
            {/* Glowing rotating ring lives on its own layer, one level up
                from the panel's own overflow-hidden box. If it sat inside
                that box (like before), the panel's rounded corners would
                clip it to nothing — which is exactly why it never showed. */}
            <div
              className={
                isFullscreen
                  ? "chat-glow-ring pointer-events-none absolute inset-0 sm:rounded-2xl"
                  : "chat-glow-ring pointer-events-none absolute inset-0 rounded-t-3xl sm:rounded-3xl"
              }
              aria-hidden="true"
            />

            <div
              className={
                isFullscreen
                  ? "relative flex h-full w-full flex-col overflow-hidden backdrop-blur-3xl backdrop-saturate-150 sm:rounded-2xl sm:shadow-2xl"
                  : "relative flex h-full w-full flex-col overflow-hidden rounded-t-3xl shadow-2xl backdrop-blur-3xl backdrop-saturate-150 sm:rounded-3xl sm:shadow-[0_32px_90px_-28px_rgba(19,66,56,0.5)]"
              }
              style={{
                backgroundColor: theme.surface,
                /* The colour mesh is painted directly into this element's
                   own background — not a separate absolutely-positioned
                   child — so there's no stacking-context ambiguity about
                   whether it's visible. It just is, because it's part of
                   the same paint as the glass tint itself. Teal family only
                   (pine/pineAlt) so the large drifting areas stay coherent;
                   the gold accent appears once, small, low-opacity, tucked
                   in a corner rather than blended through the middle. */
                backgroundImage: `
                  radial-gradient(38% 42% at 14% 16%, ${withAlpha(theme.pine, 0.3)} 0%, transparent 70%),
                  radial-gradient(34% 40% at 88% 10%, ${withAlpha(theme.pineAlt, 0.26)} 0%, transparent 70%),
                  radial-gradient(46% 50% at 72% 96%, ${withAlpha(theme.pineAlt, 0.2)} 0%, transparent 70%),
                  radial-gradient(24% 26% at 6% 94%, ${withAlpha(theme.accent, 0.12)} 0%, transparent 70%)
                `,
                boxShadow: `0 32px 90px -28px rgba(19,66,56,0.55), inset 0 1px 0 0 rgba(255,255,255,0.2)`,
              }}
            >
              {/* ── Header band ──────────────────────────────────────────── */}
              <div
                className="relative shrink-0 overflow-hidden"
                style={{
                  background: `linear-gradient(120deg, ${theme.pine} 0%, ${theme.pineAlt} 100%)`,
                  color: theme.pineOn,
                }}
              >
                {/* Prayer flag strip — the only visible "flash" of colour. */}
                <PrayerFlagBar thicknessClassName="h-[3px]" />

                {/* Soft diagonal sheen — depth without noise or texture. */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 15% -20%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 55%)",
                  }}
                  aria-hidden="true"
                />

                {/* Floating, breathing colour orbs — the classic glassmorphism depth cue. */}
                <div
                  className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full opacity-30 blur-2xl"
                  style={{ background: theme.accent }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute -left-10 top-6 h-24 w-24 rounded-full opacity-30 blur-2xl"
                  style={{ background: "#FFFFFF" }}
                  aria-hidden="true"
                />

                {/* Hairline glass edge under the header. */}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  }}
                  aria-hidden="true"
                />

                <div className="relative flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full overflow-hidden shadow-md"
                      style={{ background: "#FFFFFF" }}
                    >
                      <img
                        src={GOVT_LOGO_SRC}
                        alt=""
                        draggable={false}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-[0.98rem] font-semibold leading-tight truncate"
                        style={{ fontFamily: "Fraunces, serif" }}
                      >
                        Sikkim Tourism Assistant
                      </p>
                      <div
                        className="mt-0.5 flex items-center gap-1.5 text-[0.7rem]"
                        style={{ color: withAlpha(theme.pineOn, 0.75) }}
                      >
                        <span className="relative flex h-1.5 w-1.5">
                          <span
                            className="absolute inline-flex h-full w-full rounded-full"
                            style={{
                              background: "#7DD3A0",
                              animation:
                                "chat-launcher-halo 2.4s ease-in-out infinite",
                            }}
                          />
                          <span
                            className="relative inline-flex h-1.5 w-1.5 rounded-full"
                            style={{
                              background: "#7DD3A0",
                              boxShadow: "0 0 0 2px rgba(125,211,160,0.25)",
                            }}
                          />
                        </span>
                        <span>Online</span>
                        <span style={{ color: withAlpha(theme.pineOn, 0.4) }}>
                          ·
                        </span>
                        <span>Dept. of Tourism &amp; Civil Aviation</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setIsFullscreen((v) => (isMobileViewport ? false : !v))
                      }
                      className="hidden h-9 w-9 items-center justify-center rounded-full transition-colors sm:flex"
                      style={{ color: theme.pineOn }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = withAlpha(
                          theme.pineOn,
                          0.15,
                        );
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      aria-label={
                        isFullscreen ? "Exit full screen" : "Full screen"
                      }
                    >
                      {isFullscreen ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                      style={{ color: theme.pineOn }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = withAlpha(
                          theme.pineOn,
                          0.15,
                        );
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      aria-label="Close chat"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Body ──────────────────────────────────────────────────── */}
              <div
                className="relative min-h-0 flex-1 backdrop-blur-xl backdrop-saturate-150"
                style={{ background: theme.bg }}
              >
                <Suspense fallback={<div className="h-full" aria-busy="true" />}>
                  <Chat compact />
                </Suspense>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}