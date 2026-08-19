/**
 * Top-level layout: nav shell + footer + ChatWidget.
 * Honours the active theme for the sticky header, mobile drawer, and the
 * theme toggle button itself. Dark mode is persisted to localStorage and
 * respects `prefers-color-scheme` on first load.
 */
import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, ChevronRight, HeartHandshake, Leaf, LockKeyhole, Mail, Map, MapPin, Menu, MessageSquare, MountainSnow, Phone, Sun, Moon, X } from "lucide-react";
import { ChatWidget } from "@/components/chat-widget";
import { GOVT_LOGO_SRC } from "@/config/brand";

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
          <div className="animate-ambient-drift absolute left-[-10rem] top-[24rem] h-[24rem] w-[24rem] rounded-full bg-primary/8 blur-3xl" />
          <div className="animate-ambient-drift-delayed absolute right-[-8rem] top-[40rem] h-[20rem] w-[20rem] rounded-full bg-secondary/10 blur-3xl" />
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

              <Link
                  href="/admin"
                  title="Administrator sign-in — authorised department staff only. This is not a public registration portal."
                  aria-label="Administrator sign-in for authorised department staff only"
                  className={`group relative ml-1 inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-all duration-200 ${
                      isHome
                          ? "border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/16"
                          : "border-primary/20 bg-primary/8 text-primary hover:border-primary/35 hover:bg-primary/12"
                  }`}
              >
                <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Admin sign-in</span>
                <span className={`hidden rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide lg:inline ${isHome ? "bg-white/15 text-white/75" : "bg-primary/10 text-primary/75"}`}>Staff only</span>
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
                      <li className="mt-1 border-t border-border/70 pt-2">
                        <Link
                            href="/admin"
                            title="Administrator sign-in — authorised department staff only"
                            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-primary transition-all duration-200 hover:bg-primary/8"
                        >
                          <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                          <span>Admin sign-in</span>
                          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide">Staff only</span>
                        </Link>
                      </li>
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

        <footer className="relative overflow-hidden bg-[#edf5f1] text-[#123f36] dark:bg-[#0b342d] dark:text-white">
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
                <div className="mt-2 flex gap-2"><a href="https://www.facebook.com/SikkimWhereNatureSmiles/" target="_blank" rel="noopener noreferrer" aria-label="Sikkim Tourism on Facebook" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-xs font-bold transition hover:-translate-y-0.5">f</a><a href="https://x.com/TourismSikkim" target="_blank" rel="noopener noreferrer" aria-label="Sikkim Tourism on X" className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-xs font-bold transition hover:-translate-y-0.5">X</a><a href="https://www.youtube.com/@sikkimtourismgos" target="_blank" rel="noopener noreferrer" aria-label="Sikkim Tourism on YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF0000] text-xs font-bold transition hover:-translate-y-0.5">▶</a><a href="https://www.instagram.com/sikkim.tourism" target="_blank" rel="noopener noreferrer" aria-label="Sikkim Tourism on Instagram" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] text-xs font-bold transition hover:-translate-y-0.5">◎</a></div>
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
        </footer>

        <ChatWidget />
      </div>
  );
}
