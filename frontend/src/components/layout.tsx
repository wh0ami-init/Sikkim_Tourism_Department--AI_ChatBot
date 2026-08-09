/**
 * Top-level layout: nav shell + footer + ChatWidget.
 * Honours the active theme for the sticky header, mobile drawer, and the
 * theme toggle button itself. Dark mode is persisted to localStorage and
 * respects `prefers-color-scheme` on first load.
 */
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { LockKeyhole, Map, MessageSquare, Sun, Moon, Menu, X } from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";
import { DarkThemePicker } from "@/components/dark-theme-picker";
import { GOVT_LOGO_SRC } from "@/config/brand";
import {
  applyDarkPaletteVars,
  clearDarkPaletteVars,
  getSavedDarkPalette,
} from "@/lib/dark-palette";

function SikkimLogo({ className = "" }: { className?: string }) {
  return (
      <img
          src={GOVT_LOGO_SRC}
          alt="Government of Sikkim emblem"
          className={className}
          draggable={false}
      />
  );
}

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Apply theme class + persist. Brief body-level transition keeps the
     cross-fade gentle while 30 surfaces re-paint. */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      // Reapply the user's custom dark surface color, if they set one —
      // inline vars win over the stylesheet's ".dark {...}" defaults.
      const saved = getSavedDarkPalette();
      if (saved) applyDarkPaletteVars(saved);
    } else {
      root.classList.remove("dark");
      // Inline overrides apply regardless of the "dark" class, so they must
      // be cleared in light mode or they'd leak into the light palette too.
      clearDarkPaletteVars();
    }
    localStorage.setItem("theme", theme);
    document.body.classList.add("theme-transition");
    const t = setTimeout(
        () => document.body.classList.remove("theme-transition"),
        360,
    );
    return () => clearTimeout(t);
  }, [theme]);

  /* React to OS theme changes only when the user has never toggled. */
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
        setTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const isHome = location === "/";
  const isTransparent = isHome && !scrolled;

  const headerBg = isTransparent
      ? "bg-[rgba(8,24,20,0.22)] backdrop-blur-xl backdrop-saturate-150 border-white/10"
      : isHome
          ? "bg-[rgba(8,24,20,0.55)] backdrop-blur-2xl backdrop-saturate-150 border-white/12 shadow-[0_18px_45px_rgba(5,20,18,0.32)]"
          : "bg-white/55 dark:bg-[rgba(15,25,22,0.55)] backdrop-blur-2xl backdrop-saturate-150 border-white/40 dark:border-white/8 shadow-[0_16px_38px_rgba(15,23,42,0.1)]";

  const txtMain = isHome ? "text-white" : "text-foreground";
  const txtMuted = isHome ? "text-white/72" : "text-muted-foreground";
  const badgeCls = isHome
      ? "bg-white/10 border-white/15 text-white/80"
      : "bg-white/70 dark:bg-card/70 border-border/70 text-muted-foreground shadow-sm";
  const linkActive = isHome ? "text-white" : "text-foreground";
  const linkInactive = isHome
      ? "text-white/70 hover:text-white"
      : "text-muted-foreground hover:text-foreground";
  const linkActiveBg = isHome
      ? "bg-white/14 border-white/18"
      : "bg-primary/10 border-primary/20 shadow-sm";
  const linkHoverBg = isHome
      ? "group-hover:bg-white/8 group-hover:border-white/12"
      : "group-hover:bg-white/70 dark:group-hover:bg-card/70 group-hover:border-border/80";

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const navLinks = [
    { href: "/", label: "Home", icon: MessageSquare },
    { href: "/destinations", label: "Destinations", icon: Map },
  ];

  return (
      <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(233,169,59,0.17),transparent_36%),radial-gradient(circle_at_top_right,rgba(39,122,107,0.17),transparent_32%)]" />
          <div className="absolute left-[-10rem] top-[24rem] h-[24rem] w-[24rem] rounded-full bg-primary/8 blur-3xl" />
          <div className="absolute right-[-8rem] top-[40rem] h-[20rem] w-[20rem] rounded-full bg-secondary/10 blur-3xl" />
        </div>

        <header
            className={`fixed top-0 left-0 right-0 z-50 w-full overflow-hidden border-b transition-all duration-500 ${headerBg}`}
        >
          {/* Glass sheen + soft colour glow — the depth cues that make the
            frosted header read as glass instead of a flat translucent bar. */}
          <div
              className="pointer-events-none absolute inset-0 opacity-70"
              style={{
                background:
                    "radial-gradient(60% 140% at 8% 0%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 60%)",
              }}
              aria-hidden="true"
          />
          <div
              className="pointer-events-none absolute -top-16 right-[12%] h-32 w-32 rounded-full opacity-25 blur-3xl"
              style={{ background: "#E9A93B" }}
              aria-hidden="true"
          />
          <div
              className="pointer-events-none absolute -top-20 left-[28%] h-28 w-28 rounded-full opacity-20 blur-3xl"
              style={{ background: "#277A6B" }}
              aria-hidden="true"
          />
          <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
              style={{
                background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              }}
              aria-hidden="true"
          />

          <div className="container relative mx-auto flex h-18 items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="group flex shrink-0 items-center gap-3">
              <div className="relative h-14 w-14 shrink-0">
                <span className="absolute inset-0 rounded-full bg-primary/25 blur-[2px] animate-glow-breathe" />
                <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-lg ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-105">
                  <SikkimLogo className="h-full w-full object-contain" />
                </div>
              </div>
              <div className="flex flex-col leading-none">
              <span
                  className={`font-serif text-[1.08rem] font-bold tracking-tight drop-shadow-sm transition-colors duration-300 ${txtMain}`}
              >
                Sikkim Tourism
              </span>
                <span
                    className={`mt-0.5 text-[0.58rem] font-semibold uppercase tracking-[0.2em] transition-colors duration-300 ${txtMuted}`}
                >
                &amp; Civil Aviation Dept.
              </span>
              </div>
            </Link>

            <div
                className={`hidden items-center gap-2 rounded-full border px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-md backdrop-saturate-150 transition-all duration-300 md:flex ${badgeCls}`}
                aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.22em]">
              Official travel assistant
            </span>
            </div>

            <nav className="hidden items-center gap-1.5 rounded-full border border-transparent bg-transparent p-1 md:flex">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const active = location === href;
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`group relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${active ? linkActive : linkInactive}`}
                    >
                  <span
                      className={`absolute inset-0 rounded-full border transition-all duration-200 ${active ? linkActiveBg : `bg-transparent border-transparent ${linkHoverBg}`}`}
                  />
                      <Icon className="relative h-3.5 w-3.5" />
                      <span className="relative">{label}</span>
                    </Link>
                );
              })}

              <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={
                    theme === "dark"
                        ? "Switch to light mode"
                        : "Switch to dark mode"
                  }
                  title={
                    theme === "dark"
                        ? "Switch to light mode"
                        : "Switch to dark mode"
                  }
                  className={`group relative ml-1 flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 ${
                      isHome
                          ? "border-white/10 text-white/75 hover:border-white/20 hover:bg-white/10 hover:text-white"
                          : "border-border/70 bg-white/70 text-muted-foreground hover:border-border hover:bg-white hover:text-foreground dark:bg-card/70 dark:hover:bg-card"
                  }`}
              >
                {theme === "dark" ? (
                    <Sun className="relative h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                ) : (
                    <Moon className="relative h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />
                )}
              </button>

              <DarkThemePicker
                  theme={theme}
                  triggerClassName={`group relative ml-1 flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${
                      isHome
                          ? "border-white/10 text-white/75 hover:border-white/20 hover:bg-white/10 hover:text-white"
                          : "border-border/70 bg-white/70 text-muted-foreground hover:border-border hover:bg-white hover:text-foreground dark:bg-card/70 dark:hover:bg-card"
                  }`}
              />
            </nav>

            <div className="flex items-center gap-2 md:hidden">
              <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      isHome
                          ? "border-white/15 text-white/75 hover:bg-white/10"
                          : "border-border/70 bg-white/70 text-muted-foreground hover:bg-white dark:bg-card/70 dark:hover:bg-card"
                  }`}
              >
                {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                ) : (
                    <Moon className="h-4 w-4" />
                )}
              </button>
              <DarkThemePicker
                  theme={theme}
                  triggerClassName={`flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-30 ${
                      isHome
                          ? "border-white/15 text-white/75 hover:bg-white/10"
                          : "border-border/70 bg-white/70 text-muted-foreground hover:bg-white dark:bg-card/70 dark:hover:bg-card"
                  }`}
              />
              <button
                  type="button"
                  onClick={() => setMobileOpen((v) => !v)}
                  aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      isHome
                          ? "border-white/15 text-white/85 hover:bg-white/10"
                          : "border-border/70 bg-white/70 text-foreground hover:bg-white dark:bg-card/70 dark:hover:bg-card"
                  }`}
              >
                {mobileOpen ? (
                    <X className="h-4 w-4" />
                ) : (
                    <Menu className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile drawer */}
          <AnimatePresence>
            {mobileOpen && (
                <motion.div
                    key="mobile-nav"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="md:hidden"
                >
                  <button
                      type="button"
                      onClick={() => setMobileOpen(false)}
                      aria-label="Close menu"
                      className="fixed inset-0 -z-10 cursor-default bg-black/40 backdrop-blur-sm"
                  />
                  <nav className="border-t border-white/10 bg-background/70 px-4 py-4 backdrop-blur-2xl backdrop-saturate-150 dark:bg-[rgba(15,25,22,0.75)]">
                    <ul className="flex flex-col gap-1.5">
                      {navLinks.map(({ href, label, icon: Icon }) => {
                        const active = location === href;
                        return (
                            <li key={href}>
                              <Link
                                  href={href}
                                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                                      active
                                          ? "bg-primary/10 text-foreground"
                                          : "text-muted-foreground hover:bg-white/70 hover:text-foreground dark:hover:bg-card/60"
                                  }`}
                              >
                                <Icon className="h-4 w-4" />
                                {label}
                              </Link>
                            </li>
                        );
                      })}
                    </ul>
                  </nav>
                </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main
            className={`relative flex flex-1 flex-col ${isHome ? "" : "pt-18"}`}
        >
          {children}
        </main>

        <footer className="border-t border-border/70 bg-white/72 py-6 backdrop-blur-xl dark:bg-card/70">
          <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 text-[0.72rem] tracking-wide text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              title="Admin portal — authorised staff only"
              aria-label="Open the authorised staff admin portal"
              className="group inline-flex h-8 items-center gap-2 rounded-full border border-border/80 bg-background/60 px-2.5 text-muted-foreground shadow-sm transition-colors hover:border-primary/35 hover:bg-primary/8 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <LockKeyhole className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:max-w-48 group-focus-visible:opacity-100">
                Admin portal
              </span>
            </Link>
            <span>
              © {new Date().getFullYear()} Tourism &amp; Civil
              Aviation Department, Government of Sikkim
            </span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/8 px-3 py-1 text-[0.68rem] font-medium text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Information services available
          </span>
          </div>
        </footer>

        <ChatWidget />
      </div>
  );
}
