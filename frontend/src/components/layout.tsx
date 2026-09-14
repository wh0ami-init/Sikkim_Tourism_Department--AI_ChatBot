/**
 * Top-level layout: nav shell + footer + ChatWidget.
 * Honours the active theme for the sticky header, mobile drawer, and the
 * theme toggle button itself. Dark mode is persisted to localStorage and
 * respects `prefers-color-scheme` on first load.
 */
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ArrowUp, ArrowUpRight, ChevronRight, HeartHandshake, Leaf, LockKeyhole, Mail, Map, MapPin, Menu, MessageSquare, MountainSnow, Phone, ShieldCheck, Sun, Moon, UserRound, X } from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";
import { GOVT_LOGO_SRC } from "@/config/brand";
import { getAdminSession } from "@/lib/api";

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

function FooterLinks({ title, links }: { title: string; links: string[][] }) {
  return <section><h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[#123f36] dark:text-white">{title}</h2><ul className="mt-4 space-y-2.5">{links.map(([label, href]) => <li key={label}><a href={href} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1.5 text-sm text-[#315d53]/80 transition-colors hover:text-amber-700 dark:text-white/70 dark:hover:text-amber-200"><ChevronRight className="h-3.5 w-3.5 text-amber-600/70 transition-transform group-hover:translate-x-0.5 dark:text-amber-300/70" aria-hidden="true" /><span>{label}</span><ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" /></a></li>)}</ul></section>;
}

type SocialIconProps = {
  className?: string;
};

function FacebookIcon({ className = "" }: SocialIconProps) {
  return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M14.5 8.2h2.1V4.7c-.4-.1-1.8-.2-3.4-.2-3.3 0-5.5 2-5.5 5.6v3.1H4v3.9h3.7v9.4h4.5v-9.4h3.6l.6-3.9h-4.2v-2.7c0-1.1.3-1.9 2.3-1.9Z" />
      </svg>
  );
}

function XBrandIcon({ className = "" }: SocialIconProps) {
  return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M13.9 10.5 21.4 2h-1.8l-6.5 7.4L7.9 2H2l7.9 11.3L2 22h1.8l6.9-7.8 5.5 7.8H22l-8.1-11.5Zm-2.4 2.7-.8-1.1L4.4 3.3h2.7l5.1 7.2.8 1.1 6.6 9.3h-2.7l-5.4-7.7Z" />
      </svg>
  );
}

function YouTubeIcon({ className = "" }: SocialIconProps) {
  return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M21.6 7.1a2.8 2.8 0 0 0-2-2C17.9 4.7 12 4.7 12 4.7s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.9 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.9ZM10 15.1V8.9l5.2 3.1-5.2 3.1Z" />
      </svg>
  );
}

function InstagramIcon({ className = "" }: SocialIconProps) {
  return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Zm0 6.9a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
        <path fill="currentColor" d="M16.4 6.6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        <path fill="currentColor" fillRule="evenodd" d="M7.7 2.5h8.6a5.2 5.2 0 0 1 5.2 5.2v8.6a5.2 5.2 0 0 1-5.2 5.2H7.7a5.2 5.2 0 0 1-5.2-5.2V7.7a5.2 5.2 0 0 1 5.2-5.2Zm8.6 17.3a3.5 3.5 0 0 0 3.5-3.5V7.7a3.5 3.5 0 0 0-3.5-3.5H7.7a3.5 3.5 0 0 0-3.5 3.5v8.6a3.5 3.5 0 0 0 3.5 3.5h8.6Z" clipRule="evenodd" />
      </svg>
  );
}

type Theme = "light" | "dark";

const footerInitiatives = [
  { icon: Leaf, title: "Sustainable Tourism", detail: "Travel responsibly and help preserve Sikkim's natural beauty." },
  { icon: HeartHandshake, title: "Respect Nature", detail: "Leave no trace and protect local ecosystems." },
  { icon: MountainSnow, title: "Clean & Green Sikkim", detail: "Keep destinations clean for future generations." },
];

const footerImportantLinks = [
  ["Apply RAP Online", "https://indianfrro.gov.in/"],
  ["Sikkim Government", "https://sikkim.gov.in/"],
  ["Taxi Fare", "https://www.sikkim.gov.in/uploads/Gazette/331_20251104.pdf"],
  ["Transport Department", "https://transportdepartment.sikkim.gov.in/"],
  ["Homestay Registration", "https://homestay.sikkimtourism.co.in/"],
  ["RTI Online", "https://rtionline.sikkim.gov.in/"],
  ["Grievance Redressal", "https://pgportal.gov.in/"],
];

const footerInformationLinks = [
  ["Sikkim at a Glance", "https://sikkimtourism.gov.in/about/sikkim"],
  ["How to Reach", "https://www.sikkim.gov.in/KnowSikkim/about-sikkim/how-to-reach-sikkim"],
  ["Best Time to Visit", "https://sikkimtourism.gov.in/about/weather#best-time"],
  ["Travel Guidelines", "https://sikkimtourism.gov.in/do-and-do-not"],
  ["FAQs", "https://sikkimtourism.gov.in/"],
  ["Do's & Don'ts", "https://sikkimtourism.gov.in/do-and-do-not"],
];

const socialLinks = [
  {
    href: "https://www.facebook.com/SikkimWhereNatureSmiles/",
    label: "Sikkim Tourism on Facebook",
    icon: FacebookIcon,
    className: "bg-[#1877F2] text-white",
  },
  {
    href: "https://x.com/TourismSikkim",
    label: "Sikkim Tourism on X",
    icon: XBrandIcon,
    className: "bg-black text-white",
  },
  {
    href: "https://www.youtube.com/@sikkimtourismgos",
    label: "Sikkim Tourism on YouTube",
    icon: YouTubeIcon,
    className: "bg-[#FF0000] text-white",
  },
  {
    href: "https://www.instagram.com/sikkim.tourism",
    label: "Sikkim Tourism on Instagram",
    icon: InstagramIcon,
    className: "bg-[radial-gradient(circle_at_30%_105%,#feda75_0%,#fa7e1e_28%,#d62976_52%,#962fbf_74%,#4f5bd5_100%)] text-white",
  },
];

const socialIconBaseClass = "flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-white/25 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#edf5f1] dark:focus-visible:ring-offset-[#0b342d]";

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
  const [adminName, setAdminName] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [cinematicHeaderVisible, setCinematicHeaderVisible] = useState(true);

  const isHome = location === "/";
  const isCinematic = location === "/explore";
  const usesOverlayHeader = isHome || isCinematic;

  useEffect(() => {
    const refreshAdminSession = () => {
      getAdminSession().then((session) => setAdminName(session.username)).catch(() => setAdminName(null));
    };
    refreshAdminSession();
    window.addEventListener("admin-session-changed", refreshAdminSession);
    return () => window.removeEventListener("admin-session-changed", refreshAdminSession);
  }, []);

  /* Apply theme class + persist. Brief body-level transition keeps the
     cross-fade gentle while 30 surfaces re-paint. */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
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
    const onScroll = () => {
      setScrolled(window.scrollY > 30);
      setShowBackToTop(window.scrollY > 420);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isCinematic) {
      setCinematicHeaderVisible(true);
      return;
    }

    setCinematicHeaderVisible(true);
    let hideTimer = window.setTimeout(() => setCinematicHeaderVisible(false), 5_200);

    const revealHeader = (event?: MouseEvent | KeyboardEvent | TouchEvent) => {
      if (event instanceof MouseEvent && event.clientY > 110) return;
      setCinematicHeaderVisible(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (!mobileOpen) setCinematicHeaderVisible(false);
      }, 4_400);
    };

    window.addEventListener("mousemove", revealHeader);
    window.addEventListener("keydown", revealHeader);
    window.addEventListener("touchstart", revealHeader, { passive: true });
    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener("mousemove", revealHeader);
      window.removeEventListener("keydown", revealHeader);
      window.removeEventListener("touchstart", revealHeader);
    };
  }, [isCinematic, mobileOpen]);

  const isTransparent = usesOverlayHeader && !scrolled;

  const headerBg = isTransparent
      ? "bg-[rgba(8,24,20,0.22)] backdrop-blur-xl backdrop-saturate-150 border-white/10"
      : usesOverlayHeader
          ? "bg-[rgba(8,24,20,0.55)] backdrop-blur-2xl backdrop-saturate-150 border-white/12 shadow-[0_18px_45px_rgba(5,20,18,0.32)]"
          : "bg-white/55 dark:bg-[rgba(15,25,22,0.55)] backdrop-blur-2xl backdrop-saturate-150 border-white/40 dark:border-white/8 shadow-[0_16px_38px_rgba(15,23,42,0.1)]";

  const txtMain = usesOverlayHeader ? "text-white" : "text-foreground";
  const txtMuted = usesOverlayHeader ? "text-white/72" : "text-muted-foreground";
  const linkActive = usesOverlayHeader ? "text-white" : "text-foreground";
  const linkInactive = usesOverlayHeader
      ? "text-white/70 hover:text-white"
      : "text-muted-foreground hover:text-foreground";
  const linkHoverBg = usesOverlayHeader
      ? "group-hover:bg-white/9 group-hover:border-white/14"
      : "group-hover:bg-white/75 dark:group-hover:bg-card/75 group-hover:border-border/80";

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const scrollToTop = useCallback(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  const navLinks = [
    { href: "/", label: "Home", icon: MessageSquare },
    { href: "/explore", label: "Explore", icon: MountainSnow },
    { href: "/destinations", label: "Destinations", icon: Map },
  ];

  return (
      <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(233,169,59,0.17),transparent_36%),radial-gradient(circle_at_top_right,rgba(39,122,107,0.17),transparent_32%)]" />
          <div className="animate-ambient-drift absolute left-[-10rem] top-[24rem] h-[24rem] w-[24rem] rounded-full bg-primary/8 blur-3xl" />
          <div className="animate-ambient-drift-delayed absolute right-[-8rem] top-[40rem] h-[20rem] w-[20rem] rounded-full bg-secondary/10 blur-3xl" />
        </div>

        {isCinematic && (
            <div
                className="fixed inset-x-0 top-0 z-40 h-10"
                onMouseEnter={() => setCinematicHeaderVisible(true)}
                aria-hidden="true"
            />
        )}

        <header
            className={`fixed top-0 left-0 right-0 z-50 w-full overflow-hidden border-b transition-[transform,opacity,background-color,box-shadow,border-color] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${headerBg} ${
                isCinematic && !cinematicHeaderVisible && !mobileOpen
                    ? "pointer-events-none -translate-y-[88%] opacity-0"
                    : "translate-y-0 opacity-100"
            }`}
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
          <div className="navbar-light-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3" aria-hidden="true" />
          <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
              style={{
                background:
                    "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
              }}
              aria-hidden="true"
          />

          <motion.div
              className="absolute bottom-0 left-0 h-[2px] origin-left bg-gradient-to-r from-amber-300 via-emerald-300 to-cyan-300"
              style={{ scaleX: scrollProgress }}
              aria-hidden="true"
          />

          <div className={`container relative mx-auto flex items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6 ${scrolled ? "h-16" : "h-18"}`}>
            <Link href="/" className="group flex shrink-0 items-center gap-3">
              <div className={`relative shrink-0 transition-[height,width] duration-300 ${scrolled ? "h-12 w-12" : "h-14 w-14"}`}>
                <span className="absolute inset-0 rounded-full bg-primary/25 blur-[2px] animate-glow-breathe" />
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-lg ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-105">
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

            <nav className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border p-1 shadow-inner transition-all duration-300 md:flex ${
                  usesOverlayHeader
                      ? "border-white/12 bg-black/10"
                      : "border-border/70 bg-white/55 dark:border-white/10 dark:bg-white/5"
              }`}>
              {navLinks.map(({ href, label, icon: Icon }) => {
                const active = location === href;
                return (
                    <Link
                        key={href}
                        href={href}
                        title={label}
                        aria-label={label}
                        className={`focus-ring group relative flex h-10 items-center gap-2 overflow-hidden rounded-full px-3 text-sm font-semibold transition-all duration-200 lg:px-4 ${active ? linkActive : linkInactive}`}
                    >
                      {active && (
                          <motion.span
                              layoutId="desktop-nav-active"
                              className={`absolute inset-0 rounded-full border ${
                                  usesOverlayHeader
                                      ? "border-white/22 bg-white/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                                      : "border-primary/25 bg-primary/10 shadow-sm dark:border-white/14 dark:bg-white/8"
                              }`}
                              transition={{ type: "spring", stiffness: 420, damping: 32 }}
                          />
                      )}
                  <span
                      className={`absolute inset-0 rounded-full border border-transparent bg-transparent transition-all duration-200 ${active ? "opacity-0" : linkHoverBg}`}
                  />
                      <Icon className="relative h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 lg:h-3.5 lg:w-3.5" />
                      <span className="relative hidden lg:inline">{label}</span>
                      {active && <span className="relative h-1.5 w-1.5 rounded-full bg-secondary shadow-[0_0_12px_rgba(233,169,59,0.75)]" aria-hidden="true" />}
                    </Link>
                );
              })}
              </nav>

            <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 md:flex">
              <Link
                  href="/admin"
                  title={adminName ? `Open the operations console for ${adminName}` : "Administrator sign-in — authorised department staff only. This is not a public registration portal."}
                  aria-label={adminName ? `Open operations console for ${adminName}` : "Administrator sign-in for authorised department staff only"}
                  className={`focus-ring group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
                      usesOverlayHeader
                          ? "border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/16"
                          : "border-primary/20 bg-primary/8 text-primary hover:border-primary/35 hover:bg-primary/12"
                  }`}
              >
                <span className="absolute inset-y-0 -left-8 w-8 -skew-x-12 bg-white/20 opacity-0 transition-all duration-500 group-hover:left-[115%] group-hover:opacity-100" aria-hidden="true" />
                {adminName ? <><span className="relative flex h-7 w-7 shrink-0 items-center justify-center"><UserRound className="h-5 w-5 origin-bottom transition-transform duration-300 group-hover:-rotate-6 group-hover:translate-y-0.5 group-hover:scale-110" aria-hidden="true" /><span className="absolute -right-2 -top-1 rounded-full bg-secondary px-1 py-px text-[0.45rem] font-extrabold leading-none text-secondary-foreground shadow-sm">Hi</span></span><span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover:max-w-36 group-hover:opacity-100">Hi, {adminName}</span></> : <><LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /><span>Admin sign-in</span><span className={`hidden rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide lg:inline ${usesOverlayHeader ? "bg-white/15 text-white/75" : "bg-primary/10 text-primary/75"}`}>Staff only</span></>}
              </Link>

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
                      usesOverlayHeader
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

            </div>

            <div className="flex items-center gap-2 md:hidden">
              <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      usesOverlayHeader
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
              <button
                  type="button"
                  onClick={() => setMobileOpen((v) => !v)}
                  aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                      usesOverlayHeader
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
                  <nav className="border-t border-white/10 bg-background/82 px-4 py-4 shadow-2xl backdrop-blur-2xl backdrop-saturate-150 dark:bg-[rgba(15,25,22,0.86)]">
                    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-border/70 bg-white/55 p-3 dark:border-white/10 dark:bg-white/5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-white/8 dark:text-emerald-200">
                        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary dark:text-emerald-200">Official Portal</p>
                        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">Tourism &amp; Civil Aviation Dept.</p>
                      </div>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {navLinks.map(({ href, label, icon: Icon }, index) => {
                        const active = location === href;
                        return (
                            <motion.li
                                key={href}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.2, delay: index * 0.04 }}
                            >
                              <Link
                                  href={href}
                                  className={`focus-ring relative flex items-center gap-3 overflow-hidden rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                                      active
                                          ? "bg-primary text-primary-foreground shadow-[0_12px_26px_-18px_rgba(8,78,59,0.75)]"
                                          : "text-muted-foreground hover:bg-white/70 hover:text-foreground dark:hover:bg-card/60"
                                  }`}
                              >
                                {active && <span className="absolute inset-y-2 left-1 w-1 rounded-full bg-secondary" aria-hidden="true" />}
                                <Icon className="h-4 w-4" />
                                {label}
                                <ChevronRight className="ml-auto h-4 w-4 opacity-60" aria-hidden="true" />
                              </Link>
                            </motion.li>
                        );
                      })}
                      <li className="mt-1 border-t border-border/70 pt-2">
                        <Link
                            href="/admin"
                            title={adminName ? `Open the operations console for ${adminName}` : "Administrator sign-in — authorised department staff only"}
                            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-primary/8"
                        >
                          {adminName ? <UserRound className="h-4 w-4" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                          <span>{adminName ? `Hi, ${adminName}` : "Admin sign-in"}</span>
                          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide">{adminName ? "Console" : "Staff only"}</span>
                        </Link>
                      </li>
                    </ul>
                  </nav>
                </motion.div>
            )}
          </AnimatePresence>
        </header>

        {isCinematic && (
            <button
                type="button"
                onClick={() => setCinematicHeaderVisible(true)}
                aria-label="Show navigation"
                className={`fixed left-1/2 top-2 z-40 h-1.5 w-24 -translate-x-1/2 rounded-full bg-white/50 shadow-[0_0_24px_rgba(255,255,255,0.28)] backdrop-blur-sm transition-all duration-700 hover:w-32 hover:bg-white/75 ${
                    cinematicHeaderVisible || mobileOpen ? "pointer-events-none -translate-y-4 opacity-0" : "translate-y-0 opacity-100"
                }`}
            />
        )}

        <main
            className={`relative flex flex-1 flex-col ${usesOverlayHeader ? "" : "pt-18"}`}
        >
          {children}
        </main>

        {!isCinematic && <footer className="relative overflow-hidden bg-[#edf5f1] text-[#123f36] dark:bg-[#0b342d] dark:text-white">
          <div aria-hidden="true" className="h-1.5 bg-gradient-to-r from-amber-400 via-emerald-300 to-teal-400" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(233,169,59,0.14),transparent_27%),radial-gradient(circle_at_8%_82%,rgba(58,169,144,0.15),transparent_28%)] dark:bg-[radial-gradient(circle_at_85%_15%,rgba(233,169,59,0.18),transparent_27%),radial-gradient(circle_at_8%_82%,rgba(58,169,144,0.2),transparent_28%)]" />
          <div className="relative container mx-auto px-4 py-10 sm:px-6 lg:py-12">
            <section className="grid gap-4 border-b border-[#123f36]/15 pb-8 sm:grid-cols-3 sm:gap-5 dark:border-white/15">
              {footerInitiatives.map(({ icon: Icon, title, detail }, index) => <motion.article key={title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }} className="flex gap-3 rounded-2xl border border-[#123f36]/10 bg-white/70 p-4 shadow-sm backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 dark:border-white/10 dark:bg-white/5 dark:shadow-none"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-700 dark:text-amber-200"><Icon className="h-5 w-5" aria-hidden="true" /></span><div><h2 className="text-sm font-bold text-[#123f36] dark:text-white">{title}</h2><p className="mt-1 text-xs leading-relaxed text-[#315d53]/75 dark:text-white/65">{detail}</p></div></motion.article>)}
            </section>

            <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.75, delay: 0.16, ease: [0.22, 1, 0.36, 1] }} className="grid gap-9 py-9 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_0.9fr_1.05fr] lg:gap-8">
              <section className="sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-3"><img src={GOVT_LOGO_SRC} alt="Government of Sikkim emblem" className="h-14 w-14 rounded-full bg-white p-1.5 shadow-sm" /><div><p className="font-serif text-2xl font-bold tracking-tight">Sikkim Tourism Assistant</p><p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200">Where nature smiles</p></div></div>
                <p className="mt-5 max-w-sm text-sm leading-6 text-[#315d53]/80 dark:text-white/70">The digital travel-information companion of the Tourism &amp; Civil Aviation Department, Government of Sikkim—helping visitors discover Sikkim with clarity and care.</p>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#315d53]/65 dark:text-white/55">Follow Us</p>
                <div className="mt-2 flex gap-2">
                  {socialLinks.map(({ href, label, icon: Icon, className }) => (
                      <a
                          key={label}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          title={label}
                          className={`${socialIconBaseClass} ${className}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </a>
                  ))}
                </div>
              </section>

              <FooterLinks title="Important Links" links={footerImportantLinks} />
              <FooterLinks title="Information" links={footerInformationLinks} />

              <section>
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[#123f36] dark:text-white">Contact Us</h2>
                <ul className="mt-5 space-y-4 text-sm text-[#315d53]/80 dark:text-white/70"><li className="flex gap-3"><span className="mt-0.5 text-amber-700 dark:text-amber-200"><Phone className="h-4 w-4" aria-hidden="true" /></span><div><a href="tel:+913592232218" className="font-semibold text-[#123f36] transition hover:text-amber-700 dark:text-white dark:hover:text-amber-200">(03592) 232218</a><p className="mt-1 text-xs text-[#315d53]/65 dark:text-white/55">Fax: (03592) 232216</p></div></li><li className="flex gap-3"><span className="mt-0.5 text-amber-700 dark:text-amber-200"><Mail className="h-4 w-4" aria-hidden="true" /></span><a href="mailto:sikkimtourismdept@zohomail.in" className="break-all font-semibold text-[#123f36] transition hover:text-amber-700 dark:text-white dark:hover:text-amber-200">sikkimtourismdept@zohomail.in</a></li><li className="flex gap-3"><span className="mt-0.5 text-amber-700 dark:text-amber-200"><MapPin className="h-4 w-4" aria-hidden="true" /></span><p>Tourism &amp; Civil Aviation Department,<br />Parayatan Bhawan, Tadong, Gangtok,<br />Sikkim – 737101</p></li></ul>
              </section>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, delay: 0.45 }} className="flex flex-col-reverse gap-5 border-t border-[#123f36]/15 pt-6 text-xs text-[#315d53]/65 sm:flex-row sm:items-center sm:justify-between dark:border-white/15 dark:text-white/55"><p>© {new Date().getFullYear()} Tourism &amp; Civil Aviation Department, Government of Sikkim. All rights reserved.</p><div className="flex items-center gap-3"><img src="/images/digital-india.png" alt="Digital India" className="h-8 w-auto object-contain opacity-85 transition-transform duration-300 hover:scale-105" /><img src="/images/statehood.png" alt="Sikkim Statehood" className="h-8 w-auto object-contain opacity-85 transition-transform duration-300 hover:scale-105" /><img src="/images/sikkim-inspires.png" alt="Sikkim Inspires" className="h-8 w-auto object-contain opacity-85 transition-transform duration-300 hover:scale-105" /></div></motion.div>
          </div>
        </footer>}

        {!isCinematic && <ChatWidget />}
        <AnimatePresence>
          {showBackToTop && !isCinematic && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.82, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.82, y: 10 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={scrollToTop}
              aria-label="Go to top"
              title="Go to top"
              className="group fixed bottom-5 left-4 z-40 inline-flex h-12 items-center overflow-hidden rounded-full border border-primary/60 bg-primary px-3.5 text-primary-foreground shadow-[0_14px_34px_-10px_rgba(8,78,59,0.72)] ring-4 ring-primary/12 transition-[width,border-color,background-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-primary hover:bg-[#0b5a46] hover:shadow-[0_18px_40px_-10px_rgba(8,78,59,0.82)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:border-emerald-300/55 dark:bg-emerald-700 dark:ring-emerald-300/12 dark:hover:bg-emerald-600 sm:bottom-6 sm:left-6"
            >
              <span aria-hidden="true" className="absolute inset-1 rounded-full border border-white/20" />
              <ArrowUp className="relative h-4.5 w-4.5 shrink-0" aria-hidden="true" />
              <span className="max-w-0 overflow-hidden whitespace-nowrap pl-0 text-xs font-bold opacity-0 transition-all duration-300 group-hover:max-w-24 group-hover:pl-2 group-hover:opacity-100 group-focus-visible:max-w-24 group-focus-visible:pl-2 group-focus-visible:opacity-100">Go to top</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
  );
}
