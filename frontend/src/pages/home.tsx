import { useState, useEffect } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
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

const heroTaglines = [
  "Welcome to Sikkim",
  "Sikkim — Where Every Peak Tells a Story",
  "Sikkim — India's First Fully Organic State",
];

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
      className="overflow-hidden rounded-2xl border border-amber-700/10 bg-background/70 shadow-sm dark:bg-card/70"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start gap-3 border-b border-amber-700/10 bg-amber-100/35 p-4 dark:bg-amber-400/5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div><h3 className="font-serif text-lg font-bold text-foreground">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
      </div>
      <div className="max-h-[29rem] divide-y divide-amber-700/10 overflow-y-auto">
        {advisories.map((advisory, index) => {
          const documentUrl = advisory.has_file ? advisoryFileUrl(advisory.id) : advisory.source_url;
          const canVisit = advisory.has_file || advisory.source_url.startsWith("https://sikkimtourism.gov.in/");
          return <motion.article key={advisory.id} className={`interactive-lift relative overflow-hidden ${index === 0 ? "bg-amber-100/55 p-4 dark:bg-amber-400/10" : "p-4"}`} initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.4, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}>
            {index === 0 && <motion.span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] origin-top bg-amber-600" initial={shouldReduceMotion ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} />}
            <div className="relative flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{advisory.issue_date}</p>{index === 0 && <motion.span className="inline-flex items-center gap-1.5 rounded-full bg-amber-700 px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-wide text-white shadow-sm" initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.35, delay: 0.25, ease: "easeOut" }}><span className="h-1.5 w-1.5 rounded-full bg-amber-100" />Newly issued</motion.span>}</div>
            <h4 className="relative mt-2 text-sm font-semibold leading-snug text-foreground">{advisory.title}</h4>
            {advisory.district && <p className="relative mt-1 text-xs text-muted-foreground">{advisory.district} District</p>}
            <div className="relative mt-3 flex flex-wrap gap-3 text-sm font-semibold text-primary">
              {advisory.has_file && <button type="button" onClick={() => onPreview(advisory)} className="inline-flex items-center gap-1 hover:underline"><Eye className="h-3.5 w-3.5" />Preview</button>}
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
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(true);

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
    const controller = new AbortController();
    const loadAdvisories = () => Promise.all([
        fetchAdvisories("road_status", controller.signal),
        fetchAdvisories("cancellation_order", controller.signal),
        fetchAdvisories("tender", controller.signal),
      ])
          .then(([road_status, cancellation_order, tender]) => setAdvisories({ road_status, cancellation_order, tender }))
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === "AbortError") return;
            console.error("Failed to load official advisories:", err);
          });
    void loadAdvisories();
    const refresh = window.setInterval(() => void loadAdvisories(), 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineVisible(false);
      setTimeout(() => {
        setTaglineIndex((i) => (i + 1) % heroTaglines.length);
        setTaglineVisible(true);
      }, 600);
    }, 10000);
    return () => clearInterval(interval);
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
      label: "Monasteries & Sacred Sites",
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
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,21,18,0.18)_0%,rgba(5,21,18,0.52)_26%,rgba(5,21,18,0.72)_65%,rgba(244,248,246,0.96)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(233,169,59,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(39,122,107,0.28),transparent_34%)]" />
          </div>

          <div className="relative container mx-auto flex min-h-[78vh] flex-1 flex-col items-center justify-between px-4 pb-6 pt-24 text-center sm:min-h-screen sm:pb-10 sm:pt-28">
            <div className="flex w-full flex-1 flex-col items-center justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-md animate-rise-fade">
                <MountainSnow className="h-3.5 w-3.5" />
                Government of Sikkim &middot; Tourism &amp; Civil Aviation Dept.
              </div>

              <div className="mt-6 max-w-5xl px-4 sm:px-6">
                <h1
                    key={taglineIndex}
                    className={`mx-auto max-w-4xl font-serif text-4xl font-bold leading-[1.05] tracking-tight text-white [text-shadow:0_4px_28px_rgba(0,0,0,0.45)] sm:text-6xl ${
                        taglineVisible ? "animate-rise-fade" : "animate-fade-out-rise"
                    }`}
                    style={
                      taglineIndex === 0 ? { animationDelay: "100ms" } : undefined
                    }
                >
                  {heroTaglines[taglineIndex]}
                </h1>

                <p
                    className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/90 [text-shadow:0_2px_16px_rgba(0,0,0,0.4)] animate-rise-fade sm:text-xl"
                    style={{ animationDelay: "220ms" }}
                >
                  Where snow peaks meet prayer flags, monasteries keep centuries
                  of silence, and every valley has a story. Ask our assistant
                  about permits, routes, and the best time to visit — anytime.
                </p>

                <div
                    className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-rise-fade"
                    style={{ animationDelay: "340ms" }}
                >
                  <Link
                      href="/destinations"
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_16px_40px_rgba(39,122,107,0.32)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_46px_rgba(39,122,107,0.38)]"
                  >
                    Explore destinations <ArrowRight className="h-4 w-4" />
                  </Link>
                  <span className="inline-flex items-center rounded-full border border-white/20 px-4 py-3 text-sm text-white/90 [text-shadow:0_2px_10px_rgba(0,0,0,0.4)]">
                  Or click the chat icon to ask a question
                </span>
                </div>
              </div>
            </div>

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
          <div className="rounded-[2rem] border border-amber-300/45 bg-amber-50/75 p-5 shadow-[0_16px_40px_rgba(146,64,14,0.08)] backdrop-blur-xl dark:border-amber-400/20 dark:bg-amber-950/20 sm:p-7">
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

        <section className="container mx-auto px-4 py-14 sm:py-20">
          <div className="rounded-[2rem] border border-border/70 bg-white/72 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-card/72 sm:p-8 lg:p-10">
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
              {pillars.map((p) => (
                  <motion.div
                      key={p.title}
                      variants={pillarItemVariants}
                      className="rounded-[1.6rem] border border-border/70 bg-gradient-to-b from-white to-white/70 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(39,122,107,0.12)] dark:from-card dark:to-card/80"
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
          <div className="rounded-[2rem] border border-border/70 bg-white/72 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:bg-card/72 sm:p-8">
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
