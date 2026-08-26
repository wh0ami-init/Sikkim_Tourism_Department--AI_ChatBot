import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Info,
  List,
  MousePointer2,
  MapPin,
  RotateCw,
} from "lucide-react";
import { fetchDestinations, type DestinationSummary } from "@/lib/api";

type RailControl = "automatic" | "manual";

const AUTO_SLIDE_DELAY_MS = 16_000;
const AUTO_RAIL_NOTES_DELAY_MS = 9_000;

function wrapIndex(index: number, total: number) {
  return total ? (index + total) % total : 0;
}

function getInitialRailControl(): RailControl {
  if (typeof window === "undefined") return "automatic";
  try {
    return localStorage.getItem("explore-rail-control") === "manual"
      ? "manual"
      : "automatic";
  } catch {
    return "automatic";
  }
}

export default function Explore() {
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"about" | "frames">("about");
  const [railControl, setRailControl] = useState<RailControl>(
    getInitialRailControl,
  );
  const [activeImageReady, setActiveImageReady] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const controller = new AbortController();
    fetchDestinations(undefined, undefined, controller.signal)
      .then((rows) => {
        setDestinations(rows.slice(0, 10));
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Failed to load cinematic destinations:", err);
        setLoadError("Could not load destinations. Please refresh the page.");
      });
    return () => controller.abort();
  }, []);

  const activeDestination = destinations[activeIndex] ?? null;
  const sceneReady = Boolean(
    loadError ||
    activeImageReady ||
    (activeDestination && !activeDestination.imageUrl),
  );

  const previewDestinations = useMemo(() => {
    if (!destinations.length) return [];
    return Array.from(
      { length: Math.min(destinations.length, 4) },
      (_, offset) => {
        const index = wrapIndex(activeIndex + offset, destinations.length);
        return {
          destination: destinations[index],
          index,
          active: offset === 0,
        };
      },
    );
  }, [activeIndex, destinations]);

  const previous = useCallback(() => {
    setActiveIndex((current) => wrapIndex(current - 1, destinations.length));
  }, [destinations.length]);

  const next = useCallback(() => {
    setActiveIndex((current) => wrapIndex(current + 1, destinations.length));
  }, [destinations.length]);

  useEffect(() => {
    destinations.forEach((destination) => {
      if (!destination.imageUrl) return;
      const image = new Image();
      image.src = destination.imageUrl;
    });
  }, [destinations]);

  useEffect(() => {
    if (!activeImageReady && activeDestination && !activeDestination.imageUrl) {
      setActiveImageReady(true);
    }
  }, [activeDestination, activeImageReady]);

  useEffect(() => {
    if (
      destinations.length < 2 ||
      shouldReduceMotion ||
      railControl === "manual" ||
      !sceneReady
    )
      return;
    const interval = window.setInterval(next, AUTO_SLIDE_DELAY_MS);
    return () => window.clearInterval(interval);
  }, [destinations.length, next, railControl, sceneReady, shouldReduceMotion]);

  useEffect(() => {
    try {
      localStorage.setItem("explore-rail-control", railControl);
    } catch {
      /* Ignore storage failures; the visible control still works for the session. */
    }
  }, [railControl]);

  useEffect(() => {
    if (railControl !== "automatic") return;
    setSidebarMode("about");
    if (shouldReduceMotion || !activeDestination) return;
    const timeout = window.setTimeout(
      () => setSidebarMode("frames"),
      AUTO_RAIL_NOTES_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [activeDestination?.id, railControl, shouldReduceMotion]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous]);

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#061713] text-white">
      <AnimatePresence initial={false}>
        {activeDestination?.imageUrl && (
          <motion.img
            key={activeDestination.id}
            src={activeDestination.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.025 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 1.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            aria-hidden="true"
            draggable={false}
            onLoad={() => setActiveImageReady(true)}
          />
        )}
      </AnimatePresence>

      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,18,15,0.92)_0%,rgba(3,18,15,0.54)_42%,rgba(3,18,15,0.12)_72%,rgba(3,18,15,0.46)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,18,15,0.30)_0%,rgba(3,18,15,0.04)_42%,rgba(3,18,15,0.92)_100%)]" />
      <div
        className="cinematic-grain pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden="true"
      />

      <AnimatePresence>
        {!sceneReady && (
          <motion.div
            className="absolute inset-0 z-30 bg-[#061713]"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.65,
              ease: "easeOut",
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <main
        className={`relative container mx-auto flex h-[100dvh] flex-col px-4 pb-5 pt-16 transition-opacity duration-500 sm:px-6 lg:pt-20 ${sceneReady ? "opacity-100" : "opacity-0"}`}
      >
        <section className="grid flex-1 items-end gap-5 pb-3 pt-8 lg:pr-28 lg:pb-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeDestination?.id ?? "loading"}
              className="max-w-3xl"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 34 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -18 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.72,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              {loadError ? (
                <p className="max-w-md rounded-xl border border-red-300/30 bg-red-950/50 p-4 text-sm text-red-100 backdrop-blur-md">
                  {loadError}
                </p>
              ) : activeDestination ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-white/74">
                    <span className="inline-flex items-center gap-2">
                      <MapPin
                        className="h-3.5 w-3.5 text-amber-200"
                        aria-hidden="true"
                      />
                      {activeDestination.district} District
                    </span>
                    <span
                      className="h-1 w-1 rounded-full bg-white/50"
                      aria-hidden="true"
                    />
                    <span className="capitalize">
                      {activeDestination.category}
                    </span>
                  </div>
                  <h1 className="mt-5 max-w-4xl font-serif text-5xl font-bold leading-[0.92] tracking-normal text-white [text-shadow:0_22px_60px_rgba(0,0,0,0.44)] sm:text-7xl lg:text-8xl">
                    {activeDestination.name}
                  </h1>
                </>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </section>

        {sceneReady && (
          <motion.aside
            className={`fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 overflow-hidden border border-white/14 bg-black/24 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-2xl transition-[border-radius] duration-300 lg:block ${
              sidebarMode === "about"
                ? "w-80 rounded-[1.6rem]"
                : "w-[4.625rem] rounded-full"
            }`}
            initial={shouldReduceMotion ? false : { opacity: 0, x: 24 }}
            animate={{
              opacity: 1,
              x: 0,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.46,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <AnimatePresence mode="wait">
              {sidebarMode === "about" && activeDestination ? (
                <motion.div
                  key={`rail-about-${activeDestination.id}`}
                  initial={shouldReduceMotion ? false : { opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, x: 18 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.34,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[0.62rem] font-bold uppercase tracking-[0.2em] text-amber-100/80">
                      Now Viewing
                    </p>
                    <button
                      type="button"
                      onClick={() => setSidebarMode("frames")}
                      className="focus-ring rounded-full border border-white/12 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                      aria-label="Show journey frames"
                    >
                      <List className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <h2 className="mt-4 font-serif text-3xl font-bold leading-tight text-white">
                    {activeDestination.name}
                  </h2>
                  <p className="mt-3 line-clamp-4 text-sm leading-7 text-white/72">
                    {activeDestination.description}
                  </p>
                  <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                    <p className="flex items-center justify-between gap-3 text-xs text-white/62">
                      <span>District</span>
                      <strong className="text-right font-semibold text-white/88">
                        {activeDestination.district}
                      </strong>
                    </p>
                    <p className="flex items-center justify-between gap-3 text-xs text-white/62">
                      <span>Best Time</span>
                      <strong className="text-right font-semibold text-white/88">
                        {activeDestination.bestTimeToVisit}
                      </strong>
                    </p>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-black/18 p-1">
                    <button
                      type="button"
                      onClick={() => setRailControl("automatic")}
                      className={`focus-ring flex h-9 items-center justify-center gap-2 rounded-full text-xs font-semibold transition ${railControl === "automatic" ? "bg-white text-[#0b3a31]" : "text-white/68 hover:bg-white/10 hover:text-white"}`}
                    >
                      <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setRailControl("manual")}
                      className={`focus-ring flex h-9 items-center justify-center gap-2 rounded-full text-xs font-semibold transition ${railControl === "manual" ? "bg-white text-[#0b3a31]" : "text-white/68 hover:bg-white/10 hover:text-white"}`}
                    >
                      <MousePointer2
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Manual
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="rail-frames"
                  initial={shouldReduceMotion ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, x: 12 }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.3,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="flex flex-col items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setRailControl((current) =>
                        current === "automatic" ? "manual" : "automatic",
                      )
                    }
                    className={`focus-ring flex h-10 w-10 items-center justify-center rounded-full border transition ${
                      railControl === "automatic"
                        ? "border-amber-200/45 bg-amber-200 text-[#0b3a31]"
                        : "border-white/12 bg-white/10 text-white/76 hover:bg-white/16 hover:text-white"
                    }`}
                    aria-label={
                      railControl === "automatic"
                        ? "Switch sticky rail to manual"
                        : "Switch sticky rail to automatic"
                    }
                    title={
                      railControl === "automatic"
                        ? "Automatic rail"
                        : "Manual rail"
                    }
                  >
                    {railControl === "automatic" ? (
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <MousePointer2 className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarMode("about")}
                    className="focus-ring flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white/76 transition hover:bg-white/16 hover:text-white"
                    aria-label="Show destination information"
                  >
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {previewDestinations.map(({ destination, index, active }) => (
                    <button
                      key={`${destination.id}-${index}`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      aria-label={`Show ${destination.name}`}
                      aria-current={active ? "true" : undefined}
                      className={`focus-ring relative h-12 w-12 overflow-hidden rounded-full border transition-all duration-300 ${
                        active
                          ? "border-amber-200/80 p-0.5 shadow-[0_0_0_4px_rgba(253,230,138,0.12)]"
                          : "border-white/12 opacity-72 hover:opacity-100"
                      }`}
                    >
                      {destination.imageUrl ? (
                        <img
                          src={destination.imageUrl}
                          alt=""
                          className="h-full w-full rounded-full object-cover object-center"
                        />
                      ) : (
                        <span
                          className="block h-full w-full rounded-full"
                          style={{
                            backgroundColor: destination.imagePlaceholder,
                          }}
                        />
                      )}
                    </button>
                  ))}
                  <span className="py-1 font-serif text-xs font-semibold text-white/64 [writing-mode:vertical-rl]">
                    {destinations.length
                      ? `${String(activeIndex + 1).padStart(2, "0")} / ${String(destinations.length).padStart(2, "0")}`
                      : "00 / 00"}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.aside>
        )}

        <motion.footer
          className="flex flex-col gap-4 border-t border-white/14 pt-4 lg:pr-28 sm:flex-row sm:items-center sm:justify-between"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.65,
            delay: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={previous}
              aria-label="Previous destination"
              className="focus-ring flex h-11 w-11 items-center justify-center rounded-full border border-white/16 bg-black/18 text-white backdrop-blur-md transition hover:-translate-x-0.5 hover:bg-white/14"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next destination"
              className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#0b3a31] shadow-lg transition hover:translate-x-0.5 hover:bg-amber-100"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link
              href={
                activeDestination
                  ? `/destinations?preview=${activeDestination.id}`
                  : "/destinations"
              }
              className="focus-ring ml-2 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/16 bg-black/18 px-4 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/14"
            >
              Continue to guide{" "}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="hidden max-w-full gap-2 overflow-x-auto pb-1 lg:flex">
            {destinations.map((destination, index) => (
              <button
                key={destination.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show ${destination.name}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className={`h-2.5 shrink-0 rounded-full transition-all duration-300 ${index === activeIndex ? "w-10 bg-amber-200" : "w-2.5 bg-white/32 hover:bg-white/55"}`}
              />
            ))}
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:hidden">
            {previewDestinations.map(({ destination, index, active }) => (
              <button
                key={`mobile-${destination.id}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show ${destination.name}`}
                aria-current={active ? "true" : undefined}
                className={`focus-ring relative h-14 w-14 shrink-0 overflow-hidden rounded-full border transition-all duration-300 ${
                  active
                    ? "border-amber-200/80 p-0.5"
                    : "border-white/12 opacity-72"
                }`}
              >
                {destination.imageUrl ? (
                  <img
                    src={destination.imageUrl}
                    alt=""
                    className="h-full w-full rounded-full object-cover object-center"
                  />
                ) : (
                  <span
                    className="block h-full w-full rounded-full"
                    style={{ backgroundColor: destination.imagePlaceholder }}
                  />
                )}
              </button>
            ))}
          </div>
        </motion.footer>
      </main>
    </div>
  );
}
