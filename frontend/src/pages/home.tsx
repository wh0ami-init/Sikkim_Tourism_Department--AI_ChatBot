import { useState, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { DestinationCard } from "@/components/destination-card";
import { DestinationDetailsDialog } from "@/components/destination-details-dialog";
import { Link } from "wouter";
import {
  ArrowRight,
  MountainSnow,
  ShieldCheck,
  Compass,
  Sparkles,
  Leaf,
  Landmark,
  AlertTriangle,
  CalendarDays,
  Eye,
  ExternalLink,
  FileText,
  Gavel,
  Route,
  X,
  ChevronLeft,
  ChevronRight,
  Quote,
} from "lucide-react";
import { advisoryFileUrl, fetchAdvisories, fetchDestinations, type Advisory, type DestinationSummary } from "@/lib/api";
import { heroVideo } from "@/config/hero-media";

const gridContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.25,
    },
  },
};

const gridItemVariants: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.94 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

const sectionHeaderVariants: Variants = {
  hidden: { opacity: 0, y: 48 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1] },
  },
};

const pillarContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.28,
    },
  },
};

const pillarItemVariants: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.94 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

const leadershipOfficials = [
  { name: "Shri Om Prakash Mathur.", designation: "Hon'ble Governor", department: "Government of Sikkim", photo: "https://sikkimtourism.gov.in/images/leadership/governor-sikkim.jpeg", message: "We are building a tourism ecosystem that celebrates culture, empowers communities, and inspires every visitor." },
  { name: "Shri Prem Singh Tamang", designation: "Hon'ble Chief Minister", department: "Government of Sikkim", photo: "https://sikkimtourism.gov.in/images/leadership/hcm.jpg", message: "Sikkim stands as a model of sustainable tourism — preserving nature while welcoming the world." },
  { name: "Shri Tshering Thendup Bhutia", designation: "Minister", department: "Tourism & Civil Aviation Department, Government of Sikkim", photo: "https://sikkimtourism.gov.in/images/leadership/minister-tourism.jpg", message: "Our focus is on responsible growth, seamless services, and unforgettable Himalayan experiences." },
  { name: "Shri Sudesh Kumar Subba", designation: "Advisor", department: "Tourism & Civil Aviation Department, Government of Sikkim", photo: "https://sikkimtourism.gov.in/images/leadership/advisor.jpg", message: "Together we are strengthening Sikkim's identity as a clean, green, and globally admired destination." },
];

const heroTitles = [
  "Welcome to Sikkim",
  "Where Nature Smiles",
  "A Himalayan Story, Unfolding",
];

function LeadershipSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeOfficial = leadershipOfficials[activeIndex];
  const selectPrevious = () => setActiveIndex((current) => (current - 1 + leadershipOfficials.length) % leadershipOfficials.length);
  const selectNext = () => setActiveIndex((current) => (current + 1) % leadershipOfficials.length);

  useEffect(() => {
    const interval = window.setInterval(selectNext, 8_000);
    return () => window.clearInterval(interval);
  }, []);

  return <section className="container mx-auto px-4 py-14 sm:py-20" aria-labelledby="leadership-title">
    <div className="relative border-y border-border/70 py-8 sm:py-10 lg:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={sectionHeaderVariants} className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary/80">Tourism &amp; Civil Aviation Department</p><h2 id="leadership-title" className="font-serif text-2xl font-bold text-foreground sm:text-3xl">Leadership &amp; Key Officials</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Meet the leaders supporting Sikkim’s vision for responsible, welcoming tourism.</p></div><div className="flex gap-2"><button type="button" onClick={selectPrevious} aria-label="Show previous official" className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-foreground transition hover:border-primary/35 hover:text-primary"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={selectNext} aria-label="Show next official" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:-translate-y-0.5"><ChevronRight className="h-4 w-4" /></button></div></motion.div>
      <div className="relative mt-8 grid gap-7 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
        <motion.div initial={{ opacity: 0, y: 32, scale: 0.96 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-[18rem] sm:max-w-[20rem]"><div aria-hidden="true" className="absolute -inset-3 rounded-[2rem] bg-[conic-gradient(from_210deg,rgba(22,107,82,0.28),transparent_28%,rgba(233,169,59,0.22),transparent_64%,rgba(22,107,82,0.24))] blur-xl" /><div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[#0b2722] shadow-[0_26px_58px_rgba(15,23,42,0.22)]"><AnimatePresence mode="wait"><motion.img key={activeOfficial.photo} src={activeOfficial.photo} alt={activeOfficial.name} initial={{ opacity: 0, scale: 1.075 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }} className="h-full w-full object-cover object-top" /></AnimatePresence><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,25,21,0.10),transparent_42%,rgba(5,25,21,0.58))]" /><div aria-hidden="true" className="absolute inset-3 rounded-[1.25rem] border border-white/30" /><div className="absolute left-5 top-3"><span className="rounded-full border border-white/25 bg-slate-950/35 px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">Official leadership</span></div><div className="absolute bottom-5 left-5 right-5 flex items-end justify-between"><span className="h-px flex-1 bg-white/55" /><span className="ml-3 font-serif text-sm font-semibold text-white/90">0{activeIndex + 1} / 0{leadershipOfficials.length}</span></div></div></motion.div>
        <motion.div initial={{ opacity: 0, x: 34 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} className="min-w-0" aria-live="polite"><AnimatePresence mode="wait"><motion.div key={activeOfficial.name} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">{activeOfficial.designation}</p><h3 className="mt-3 font-serif text-3xl font-bold leading-tight text-foreground sm:text-4xl">{activeOfficial.name}</h3><p className="mt-3 text-sm font-medium text-primary">{activeOfficial.department}</p><div className="mt-7 border-l-2 border-amber-400 pl-5"><Quote className="mb-3 h-6 w-6 text-amber-500/70" aria-hidden="true" /><p className="max-w-xl font-serif text-xl leading-relaxed text-foreground/90 sm:text-2xl">“{activeOfficial.message}”</p></div></motion.div></AnimatePresence></motion.div>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }} className="relative mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">{leadershipOfficials.map((official, index) => <button key={official.name} type="button" onClick={() => setActiveIndex(index)} aria-current={index === activeIndex ? "true" : undefined} className={`group flex items-center gap-3.5 rounded-2xl border p-3 text-left transition-all ${index === activeIndex ? "border-primary/35 bg-primary/8 shadow-sm" : "border-border/70 bg-background/50 hover:border-primary/20 hover:bg-primary/5"}`}><img src={official.photo} alt="" className="h-[3.25rem] w-[3.25rem] rounded-xl object-cover object-top" /><span className="min-w-0"><span className="block truncate text-sm font-bold text-foreground">{official.name.replace("Shri ", "")}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{official.designation.replace("Hon'ble ", "")}</span></span></button>)}</motion.div>
    </div>
  </section>;
}

function AdvisoryList({
  title, description, icon: Icon, advisories, onPreview, delay = 0,
}: {
  title: string;
  description: string;
  icon: typeof Route;
  advisories: Advisory[];
  onPreview: (advisory: Advisory) => void;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.section
      className="relative overflow-hidden rounded-2xl border border-primary/45 bg-primary/[0.035] shadow-[0_20px_42px_-25px_rgba(22,107,82,0.46)] dark:border-primary/25 dark:bg-primary/[0.035] dark:shadow-[0_20px_42px_-25px_rgba(8,48,38,0.3)]"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.38 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.9, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-0.5 bg-gradient-to-r from-primary via-emerald-400 to-transparent dark:opacity-70" />
      <div className="flex items-start gap-3 border-b border-primary/15 bg-primary/[0.08] p-4 dark:border-primary/10 dark:bg-primary/[0.065]">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary dark:bg-primary/10"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div><h3 className="font-serif text-lg font-bold text-foreground">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
      </div>
      <div className="max-h-[29rem] space-y-2 overflow-y-auto p-2">
        {advisories.map((advisory, index) => {
          const documentUrl = advisory.has_file ? advisoryFileUrl(advisory.id) : advisory.source_url;
          const canVisit = advisory.has_file || advisory.source_url.startsWith("https://sikkimtourism.gov.in/");
          return <motion.article key={advisory.id} className={`group/item interactive-lift relative overflow-hidden rounded-lg border p-4 transition-all duration-300 hover:-translate-y-0.5 ${index === 0 ? "border-amber-500/45 border-l-2 bg-amber-100/45 hover:border-amber-500/65 hover:bg-amber-100/60 hover:shadow-[0_12px_26px_-20px_rgba(180,83,9,0.45)] dark:border-amber-400/30 dark:bg-amber-400/[0.045] dark:hover:border-amber-400/45 dark:hover:bg-amber-400/[0.065]" : "border-border/65 bg-background/45 hover:border-primary/45 hover:bg-primary/[0.055] hover:shadow-[0_12px_26px_-20px_rgba(22,107,82,0.5)] dark:border-border/45 dark:bg-card/20 dark:hover:border-primary/30 dark:hover:bg-primary/[0.055]"}`} initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} whileHover={shouldReduceMotion ? undefined : { x: 3 }} transition={{ duration: shouldReduceMotion ? 0 : 0.65, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}>
            <div className="relative flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{advisory.issue_date}</p>{index === 0 && <motion.span className="inline-flex items-center gap-1.5 rounded-full bg-amber-700 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-white shadow-sm" initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }} animate={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, boxShadow: ["0 1px 2px rgba(0,0,0,0.12)", "0 0 0 4px rgba(180,83,9,0.12)", "0 1px 2px rgba(0,0,0,0.12)"] }} transition={shouldReduceMotion ? { duration: 0 } : { opacity: { duration: 0.35, delay: 0.2, ease: "easeOut" }, y: { duration: 0.35, delay: 0.2, ease: "easeOut" }, boxShadow: { duration: 2.6, repeat: Infinity, repeatDelay: 3.2, ease: "easeInOut" } }}><motion.span className="h-1.5 w-1.5 rounded-full bg-amber-100" animate={shouldReduceMotion ? undefined : { scale: [1, 1.45, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 3.2, ease: "easeInOut" }} />Latest</motion.span>}</div>
            <h4 className="relative mt-2 text-sm font-semibold leading-snug text-foreground">{advisory.title}</h4>
            {advisory.district && <p className="relative mt-1 text-xs text-muted-foreground">{advisory.district} District</p>}
            <div className="relative mt-3 flex flex-wrap gap-3 text-sm font-semibold text-primary">
              {advisory.has_file && advisory.category !== "road_status" && <button type="button" onClick={() => onPreview(advisory)} className="inline-flex items-center gap-1 hover:underline"><Eye className="h-3.5 w-3.5" />Preview</button>}
              {canVisit && <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">Visit link<ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          </motion.article>;
        })}
        {!advisories.length && <p className="p-5 text-sm text-muted-foreground">No updates are available at the moment.</p>}
      </div>
    </motion.section>
  );
}

const advisoryCategoryLabels: Record<Advisory["category"], string> = {
  road_status: "Road status",
  cancellation_order: "Cancellation order",
  tender: "Tender & bid",
};

/** Keep the public notice board clean if an upstream listing repeats a notice. */
function uniqueAdvisories(rows: Advisory[]): Advisory[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.category}:${row.title.trim().replace(/\s+/g, " ").toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function AdvisoryPreview({ advisory, onClose }: { advisory: Advisory; onClose: () => void }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="advisory-preview-title" className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-card shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-border p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{advisoryCategoryLabels[advisory.category]} · {advisory.issue_date}</p><h2 id="advisory-preview-title" className="mt-1 font-serif text-xl font-bold">{advisory.title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close preview"><X className="h-5 w-5" /></button></header>
      <iframe title={`Preview: ${advisory.title}`} src={advisoryFileUrl(advisory.id)} className="min-h-0 flex-1 bg-white" />
    </section>
  </div>;
}

export default function Home() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [popularDestinations, setPopularDestinations] = useState<DestinationSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advisories, setAdvisories] = useState<Record<Advisory["category"], Advisory[]>>({
    road_status: [], cancellation_order: [], tender: [],
  });
  const [previewingAdvisory, setPreviewingAdvisory] = useState<Advisory | null>(null);
  const [heroTitleIndex, setHeroTitleIndex] = useState(0);
  const [typedHeroTitle, setTypedHeroTitle] = useState("");
  const [isErasingHeroTitle, setIsErasingHeroTitle] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchDestinations(undefined, undefined, controller.signal)
        .then((all) => setPopularDestinations(all.slice(0, 3)))
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          console.error("Failed to load popular destinations:", err);
          setLoadError("Could not load destinations. Please refresh the page.");
        });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const title = heroTitles[heroTitleIndex];
    let delay = 60;

    if (!isErasingHeroTitle && typedHeroTitle.length < title.length) {
      delay = heroTitleIndex === 0 ? 88 : 58;
    } else if (!isErasingHeroTitle) {
      delay = heroTitleIndex === 0 ? 6_000 : 3_000;
    } else if (typedHeroTitle.length > 0) {
      delay = 32;
    } else {
      delay = 3_000;
    }

    const timeout = window.setTimeout(() => {
      if (!isErasingHeroTitle && typedHeroTitle.length < title.length) {
        setTypedHeroTitle(title.slice(0, typedHeroTitle.length + 1));
      } else if (!isErasingHeroTitle) {
        setIsErasingHeroTitle(true);
      } else if (typedHeroTitle.length > 0) {
        setTypedHeroTitle(title.slice(0, typedHeroTitle.length - 1));
      } else {
        setIsErasingHeroTitle(false);
        setHeroTitleIndex((current) => (current + 1) % heroTitles.length);
      }
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [heroTitleIndex, isErasingHeroTitle, typedHeroTitle]);

  useEffect(() => {
    const controller = new AbortController();
    const loadAdvisories = () => fetchAdvisories(undefined, controller.signal)
          .then((rows) => setAdvisories({
            road_status: uniqueAdvisories(rows.filter((row) => row.category === "road_status")),
            cancellation_order: uniqueAdvisories(rows.filter((row) => row.category === "cancellation_order")),
            tender: uniqueAdvisories(rows.filter((row) => row.category === "tender")),
          }))
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === "AbortError") return;
            console.error("Failed to load official advisories:", err);
          });
    void loadAdvisories();
    const refresh = window.setInterval(() => void loadAdvisories(), 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(refresh); };
  }, []);

  const highlights = [
    {
      icon: Leaf,
      value: "India's First",
      label: "Fully Organic State",
    },
    {
      icon: MountainSnow,
      value: "Kanchenjunga",
      label: "World's 3rd Highest Peak",
    },
    {
      icon: Landmark,
      value: "200+",
      label: "Sacred Sites",
    },
  ];

  const pillars = [
    {
      icon: Compass,
      title: "Local, ground-level knowledge",
      body: "Trained on official destination records, permits, and district-level travel advisories.",
    },
    {
      icon: ShieldCheck,
      title: "Permit & route clarity",
      body: "Ask about Nathula, Gurudongmar, or restricted-area passes and get the exact requirements.",
    },
    {
      icon: Sparkles,
      title: "Always at your side",
      body: "Tap the icon in the corner, anytime, on any page — it opens instantly.",
    },
  ];

  return (
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        <section className="relative flex min-h-[78vh] flex-col overflow-hidden border-b border-white/10 sm:min-h-screen">
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <video
                key={heroVideo.src}
                className="absolute inset-0 h-full w-full object-cover object-[center_35%]"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster={heroVideo.poster}
            >
              <source src={heroVideo.src} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,21,18,0.08)_0%,rgba(5,21,18,0.28)_32%,rgba(5,21,18,0.48)_70%,rgba(244,248,246,0.9)_100%)] dark:bg-[linear-gradient(180deg,rgba(5,21,18,0.08)_0%,rgba(5,21,18,0.32)_32%,rgba(5,21,18,0.6)_70%,rgba(13,28,24,0.94)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(233,169,59,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(39,122,107,0.28),transparent_34%)]" />
          </div>

          <div className="relative container mx-auto flex min-h-[78vh] flex-1 flex-col items-center justify-between px-4 pb-6 pt-24 text-center sm:min-h-screen sm:pb-10 sm:pt-28">
            <div className="flex w-full flex-1 flex-col items-center justify-center">
              <div className="mt-6 max-w-5xl px-4 sm:px-6">
                <h1 aria-label={heroTitles[heroTitleIndex]} className="relative mx-auto min-h-[2.2em] max-w-4xl font-serif text-4xl font-semibold leading-[1.08] tracking-[0.01em] text-white [text-shadow:0_4px_28px_rgba(0,0,0,0.45)] animate-rise-fade sm:text-6xl" style={{ animationDelay: "120ms" }}><span>{typedHeroTitle}</span><span aria-hidden="true" className="ml-1 inline-block h-[0.9em] w-px translate-y-[0.08em] bg-amber-200 animate-pulse" />{heroTitleIndex === 0 && !isErasingHeroTitle && typedHeroTitle === heroTitles[0] && <motion.span aria-hidden="true" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="absolute bottom-[0.1em] left-1/2 h-px w-28 -translate-x-1/2 origin-center bg-gradient-to-r from-transparent via-amber-200 to-transparent sm:w-40" />}</h1>

                <div
                    className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-rise-fade"
                    style={{ animationDelay: "340ms" }}
                >
                  <Link href="/destinations" aria-label="Explore destinations" title="Explore destinations" className="group inline-flex h-12 w-12 items-center justify-end overflow-hidden rounded-full bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(39,122,107,0.32)] transition-[width,transform,box-shadow] duration-500 ease-out hover:w-52 hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(39,122,107,0.38)] focus-visible:w-52 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"><span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-36 group-hover:opacity-100 group-focus-visible:max-w-36 group-focus-visible:opacity-100">Explore destinations</span><span className="flex h-12 w-12 shrink-0 items-center justify-center"><ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" /></span></Link>
                </div>
                <p className="mt-5 text-xs font-medium text-white/75 [text-shadow:0_2px_10px_rgba(0,0,0,0.4)] animate-rise-fade sm:hidden" style={{ animationDelay: "420ms" }}>Need route or permit help? Use the chat icon below.</p>
              </div>
            </div>

            <div className="absolute right-6 top-28 hidden items-center gap-2 rounded-full border border-white/18 bg-black/20 px-4 py-2 text-xs font-medium text-white/85 backdrop-blur-md animate-rise-fade lg:flex" style={{ animationDelay: "560ms" }}><Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />Need route or permit help? Use the chat icon.</div>

            <div
                className="flex w-full max-w-4xl flex-col items-center gap-5 border-t border-white/12 pt-6 text-white animate-rise-fade sm:flex-row sm:items-start sm:justify-center sm:gap-0 sm:pt-8 sm:divide-x sm:divide-white/12"
                style={{ animationDelay: "440ms" }}
            >
              {highlights.map((stat) => (
                  <div
                      key={stat.label}
                      className="flex flex-1 items-center justify-center gap-3 px-6 text-center transition-opacity duration-300 hover:opacity-80"
                  >
                    <stat.icon
                        className="h-5 w-5 shrink-0 text-white/70"
                        strokeWidth={1.6}
                    />
                    <span className="flex flex-col items-start leading-tight">
                  <span className="font-serif text-lg font-bold sm:text-xl">
                    {stat.value}
                  </span>
                  <span className="text-[0.68rem] uppercase tracking-[0.2em] text-white/60">
                    {stat.label}
                  </span>
                </span>
                  </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 pt-10 sm:pt-14" aria-labelledby="official-advisories">
          <div className="border-y border-amber-300/55 py-6 dark:border-amber-400/25 sm:py-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-800 dark:text-amber-300"><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800/75 dark:text-amber-300/75">Official updates</p><h2 id="official-advisories" className="font-serif text-xl font-bold text-foreground">Travel advisories and notices</h2></div></div>
              <p className="text-sm text-muted-foreground">Check the issue date before travelling.</p>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <AdvisoryList title="Road Status" description="Department-managed road reports" icon={Route} advisories={advisories.road_status} onPreview={setPreviewingAdvisory} />
              <AdvisoryList title="Cancellation Orders" description="Official tourism notices" icon={FileText} advisories={advisories.cancellation_order} onPreview={setPreviewingAdvisory} delay={0.1} />
              <AdvisoryList title="Tenders & Bids" description="Official tender notices" icon={Gavel} advisories={advisories.tender} onPreview={setPreviewingAdvisory} delay={0.2} />
            </div>
          </div>
        </section>

        <LeadershipSection />

        <section className="container mx-auto px-4 py-14 sm:py-20">
          <div className="border-y border-border/70 py-8 sm:py-10">
            <motion.div
                className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
                variants={sectionHeaderVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
            >
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary/80">
                  Why this assistant feels official
                </p>
                <h2 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
                  Designed for clarity, trust, and discovery
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-right">
                The refreshed interface keeps every existing feature intact, while
                giving the site a cleaner tourism-focused identity with better
                depth, spacing, and color harmony.
              </p>
            </motion.div>

            <motion.div
                className="grid grid-cols-1 gap-6 sm:grid-cols-3"
                variants={pillarContainerVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.2 }}
            >
              {pillars.map((p, index) => (
                  <motion.div
                      key={p.title}
                      variants={pillarItemVariants}
                      className={`p-4 transition-transform duration-300 hover:-translate-y-1 sm:px-6 ${index > 0 ? "border-t border-border/70 pt-8 sm:border-l sm:border-t-0 sm:pt-4" : ""}`}
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                      <p.icon className="h-5.5 w-5.5" />
                    </div>
                    <h3 className="mb-2 font-serif text-lg font-semibold text-foreground">
                      {p.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {p.body}
                    </p>
                  </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="container mx-auto px-4 pb-20">
          <div className="border-y border-border/70 py-8 sm:py-10">
            <motion.div
                className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
                variants={sectionHeaderVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.3 }}
            >
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-primary/80">
                  Curated inspiration
                </p>
                <h2 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">
                  Popular Places
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Start with a few of Sikkim's most searched destinations, then
                  open each place for travel timing, permits, and local guidance.
                </p>
              </div>
              <Link
                  href="/destinations"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </motion.div>

            {loadError && (
                <p className="mb-4 text-sm text-destructive">{loadError}</p>
            )}

            <motion.div
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
                variants={gridContainerVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.15 }}
            >
              {popularDestinations.map((dest) => (
                  <motion.div key={dest.id} variants={gridItemVariants}>
                    <DestinationCard
                        dest={dest}
                        onClick={() => setSelectedId(dest.id)}
                    />
                  </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

      <DestinationDetailsDialog
            id={selectedId}
            open={selectedId !== null}
            onOpenChange={(open) => !open && setSelectedId(null)}
      />
      {previewingAdvisory && <AdvisoryPreview advisory={previewingAdvisory} onClose={() => setPreviewingAdvisory(null)} />}
      </div>
  );
}
