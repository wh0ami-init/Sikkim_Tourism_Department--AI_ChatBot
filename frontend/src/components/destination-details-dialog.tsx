import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchDestination, type Destination } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Droplets,
  IndianRupee,
  Loader2,
  MapPin,
  Mountain,
  Navigation,
  Route,
  Thermometer,
  Ticket,
  Wind,
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWeather } from "@/hooks/use-weather";
import { AnimatePresence, motion } from "framer-motion";

// Add gallery photos here. Both formats are supported:
//   local file:      "/images/gangtok-mg-marg.jpg"  (put the file in frontend/public/images/)
//   Cloudinary URL:  "https://res.cloudinary.com/<your-cloud>/image/upload/v1234/gangtok-mg-marg.jpg"
// The key must exactly match the destination's URL slug from the Admin panel.
const destinationGallery: Record<string, string[]> = {
  gangtok: [
    "/images/D_D_Box/Gangtok/Mg_Marg.webp",
    "/images/D_D_Box/Gangtok/Rumtek_Monastery.webp",
    "/images/D_D_Box/Gangtok/Namgyal_Institute_of_Tibetology.webp",
    "/images/D_D_Box/Gangtok/Ropeway.webp",
    "/images/D_D_Box/Gangtok/Tashi_View_Point.webp",
    "/images/D_D_Box/Gangtok/Enchey_Monastery.webp",
  ],

  "gurudongmar-lake": [
    "/images/D_D_Box/Gurudongmar_Lake/G_L-02.webp",
    "/images/D_D_Box/Gurudongmar_Lake/G_L-01.webp",
    "/images/D_D_Box/Gurudongmar_Lake/G_L-03.webp",
  ],

  namchi: [
    "/images/D_D_Box/Namchi/Samdruptse.webp",
    "/images/D_D_Box/Namchi/Chardham.webp",
    "/images/D_D_Box/Namchi/Rock_Garden.webp",
    "/images/D_D_Box/Namchi/Ngadak_Monastery.webp",
  ],

  "nathu-la": [
    "/images/D_D_Box/Nathula/Border.webp",
    "/images/D_D_Box/Nathula/View_Point.webp",
    "/images/D_D_Box/Nathula/Snow_Peaks.webp",
    "/images/D_D_Box/Nathula/Glacier.webp",
  ],

  pelling: [
    "/images/D_D_Box/Pelling/Kanchenjunga_View.webp",
    "/images/D_D_Box/Pelling/Khecheopalri Lake.webp",
    "/images/D_D_Box/Pelling/Pemayangtse_Monastery.webp",
    "/images/D_D_Box/Pelling/Rabdentse_Ruins.webp",
    "/images/D_D_Box/Pelling/Singshore_Bridge.webp",
  ],

  ravangla: [
    "/images/D_D_Box/Ravangla/Buddha_Park.webp",
    "/images/D_D_Box/Ravangla/Ralong_Monastery.webp",
  ],

  "tsomgo-lake": [
    "/images/D_D_Box/Tsomgo_Lake/Lake_Freeze.webp",
    "/images/D_D_Box/Tsomgo_Lake/Flower_Bloom.webp",
    "/images/D_D_Box/Tsomgo_Lake/Yak_Rides.webp",
  ],

  yuksom: [
    "/images/D_D_Box/Yuksom/Dubdi_Monastery.webp",
    "/images/D_D_Box/Yuksom/Goechala_Trek.webp",
    "/images/D_D_Box/Yuksom/Norbugang.webp",
    "/images/D_D_Box/Yuksom/Kathok_Lake.webp",
  ],

  "yumthang-valley": [
    "/images/D_D_Box/Yumthang_Valley/Rhododendron.jpg",
    "/images/D_D_Box/Yumthang_Valley/Hotsprings.webp",
    "/images/D_D_Box/Yumthang_Valley/Shingba.webp",
  ],
};

const fallbackGallery = [
  "/images/Gangtok.png",
  "/images/Tsomgo_Lake.jpeg",
  "/images/Yumthang_Valley.jpeg",
];

function galleryFor(destination: Destination) {
  const curatedGallery = destinationGallery[destination.slug];
  return [
    ...new Set(
      [
        // A curated gallery is intentional and must remain exact — do not
        // quietly append the card cover or generic fallback photos to it.
        ...(curatedGallery?.length
          ? curatedGallery
          : [destination.imageUrl, ...fallbackGallery]),
      ].filter(Boolean) as string[],
    ),
  ];
}

const galleryCaptionOverrides: Record<string, string> = {
  "G_L-01": "Gurudongmar Lake",
  "G_L-02": "Gurudongmar Lake",
  "G_L-03": "Gurudongmar Lake",
};

function galleryCaption(image: string, destination: Destination) {
  const filename = decodeURIComponent(image.split("/").pop() ?? "")
    .replace(/\.[^.]+$/, "")
    .trim();
  if (!filename || /^v\d+$/i.test(filename)) return `${destination.name} scenic view`;
  if (galleryCaptionOverrides[filename]) return galleryCaptionOverrides[filename];
  return filename
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reachDetails(value: string, location: string) {
  const parts =
    value
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((item) => item.trim())
      .filter(Boolean) ?? [];
  return {
    intro: parts[0] ?? value,
    steps: parts.slice(1).length
      ? parts.slice(1)
      : [
          `Use the map to check the final approach and current road conditions for ${location}.`,
        ],
  };
}
function mapQuery(destination: Destination) {
  return destination.latitude != null && destination.longitude != null
    ? `${destination.latitude},${destination.longitude}`
    : `${destination.name}, ${destination.location}, Sikkim`;
}

function WeatherPanel({
  lat,
  lon,
  destName,
}: {
  lat: number | null;
  lon: number | null;
  destName: string;
}) {
  const { weather, loading, error } = useWeather(lat, lon);
  if (lat == null || lon == null) return null;
  return (
    <div className="border-l-2 border-primary/50 pl-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Thermometer className="h-4 w-4" /> Live weather{" "}
        <span className="font-normal text-muted-foreground">· {destName}</span>
      </div>
      {loading && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching conditions…
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-muted-foreground">
          Weather data is currently unavailable.
        </p>
      )}
      {weather && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"
        >
          <span className="flex items-center gap-2 text-foreground">
            <span
              className="text-2xl"
              role="img"
              aria-label={weather.condition}
            >
              {weather.emoji}
            </span>
            <strong className="text-lg">{weather.tempC}°C</strong>{" "}
            {weather.condition}
          </span>
          <span className="flex items-center gap-1.5">
            <Wind className="h-3.5 w-3.5 text-primary/70" />{" "}
            {weather.windspeedKmh} km/h wind
          </span>
          <span className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5 text-primary/70" />{" "}
            {weather.humidity}% humidity
          </span>
        </motion.div>
      )}
    </div>
  );
}

function InfoLine({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="border-border/70 px-0 py-5 sm:px-5 sm:[&:not(:first-child)]:border-l first:sm:pl-0 last:sm:pr-0">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
        {icon}
        {label}
      </div>
      <p className="break-words text-sm leading-6 text-muted-foreground">
        {value}
      </p>
    </div>
  );
}

export function DestinationDetailsDialog({
  id,
  open,
  onOpenChange,
}: {
  id: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [dest, setDest] = useState<Destination | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  useEffect(() => {
    if (!id || !open) return;
    setIsLoading(true);
    setDest(null);
    setFetchError(null);
    setFailedImages([]);
    setActiveImage(0);
    fetchDestination(id)
      .then(setDest)
      .catch((err: unknown) => {
        console.error("Failed to load destination details:", err);
        setFetchError("Could not load destination details. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }, [id, open]);
  const slides = useMemo(
    () =>
      dest
        ? galleryFor(dest).filter((image) => !failedImages.includes(image))
        : [],
    [dest, failedImages],
  );
  useEffect(() => {
    // A previous destination can have more photos than the next one. Keep the
    // selected index valid after changing dialogs or removing a failed image.
    setActiveImage((current) =>
      slides.length ? Math.min(current, slides.length - 1) : 0,
    );
  }, [slides.length]);
  const reach = useMemo(
    () => (dest ? reachDetails(dest.howToReach, dest.location) : null),
    [dest],
  );
  const query = dest ? mapQuery(dest) : "";
  useEffect(() => setActiveImage(0), [dest?.id]);
  useEffect(() => {
    if (activeImage >= slides.length) setActiveImage(0);
  }, [activeImage, slides.length]);
  useEffect(() => {
    if (!open || slides.length < 2) return;
    const timer = window.setInterval(
      () => setActiveImage((current) => (current + 1) % slides.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [open, slides.length]);
  const goTo = (next: number) =>
    setActiveImage((next + slides.length) % slides.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDefaultClose
        className="max-w-6xl overflow-hidden rounded-[var(--radius-panel)] border border-border/60 bg-background p-0 shadow-[0_36px_100px_rgba(15,23,42,0.24)]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{dest?.name ?? "Destination details"}</DialogTitle>
        </DialogHeader>
        {fetchError ? (
          <div className="flex h-96 flex-col items-center justify-center px-6 text-center">
            <p className="mb-2 font-medium text-destructive">
              Something went wrong
            </p>
            <p className="text-sm text-muted-foreground">{fetchError}</p>
          </div>
        ) : isLoading || !dest ? (
          <div className="flex h-96 flex-col items-center justify-center">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="font-medium text-muted-foreground">
              Loading destination…
            </p>
          </div>
        ) : (
          <div className="flex max-h-[88vh] flex-col">
            <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-3 sm:px-7">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                Destination guide
              </span>
              <button
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close destination details"
              >
                <span className="hidden sm:inline">Close</span>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid min-h-0 lg:h-[calc(88vh-3.25rem)] lg:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
              <div className="relative h-72 shrink-0 overflow-hidden border-b border-border/70 sm:h-[23rem] lg:h-full lg:border-b-0 lg:border-r">
                {slides.length ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={slides[activeImage]}
                      className="absolute inset-0 bg-slate-950"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.42, ease: "easeOut" }}
                    >
                      <img
                        src={slides[activeImage]}
                        alt=""
                        aria-hidden="true"
                        className="absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] max-w-none object-cover opacity-40 blur-2xl"
                      />
                      <img
                        src={slides[activeImage]}
                        alt={`${dest.name} gallery image ${activeImage + 1}`}
                        className="relative h-full w-full object-contain"
                        onError={() =>
                          setFailedImages((images) => [
                            ...images,
                            slides[activeImage],
                          ])
                        }
                      />
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div
                    className="flex h-full items-center justify-center text-white/25"
                    style={{
                      backgroundColor: dest.imagePlaceholder || "#6b7280",
                    }}
                  >
                    <Mountain className="h-20 w-20" />
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,21,18,0.05),rgba(5,21,18,0.18),rgba(5,21,18,0.84))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(233,169,59,0.24),transparent_30%)]" />
                {slides.length > 0 && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={slides[activeImage]}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.32, ease: "easeOut" }}
                      className="absolute left-1/2 top-[17%] z-10 -translate-x-1/2"
                    >
                      <span className="inline-flex max-w-[calc(100vw-4rem)] items-center gap-2 rounded-full border border-white/25 bg-slate-950/45 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg backdrop-blur-md sm:max-w-md sm:text-base">
                        <motion.span
                          initial={{ opacity: 0, scale: 0.55, x: 10, rotate: -18 }}
                          animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className="shrink-0"
                        >
                          <MapPin className="h-4 w-4 text-amber-300" aria-hidden="true" />
                        </motion.span>
                        <motion.span
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.26, delay: 0.18, ease: "easeOut" }}
                          className="truncate"
                        >
                          {galleryCaption(slides[activeImage], dest)}
                        </motion.span>
                      </span>
                    </motion.div>
                  </AnimatePresence>
                )}
                {slides.length > 1 && (
                  <>
                    <button
                      onClick={() => goTo(activeImage - 1)}
                      className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/25 bg-black/25 p-2 text-white transition hover:bg-black/55"
                      aria-label="Previous gallery image"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => goTo(activeImage + 1)}
                      className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/25 bg-black/25 p-2 text-white transition hover:bg-black/55"
                      aria-label="Next gallery image"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-0 left-0 w-full p-6 sm:p-8">
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Badge
                      variant="secondary"
                      className="rounded-full border-0 bg-white/92 px-3 py-1 text-[0.72rem] font-semibold capitalize text-slate-900"
                    >
                      {dest.category}
                    </Badge>
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90">
                      <MapPin className="h-4 w-4" /> {dest.district} District
                    </span>
                  </div>
                  <h2 className="max-w-3xl font-serif text-3xl font-bold leading-tight text-white sm:text-4xl">
                    {dest.name}
                  </h2>
                </div>
                {slides.length > 1 && (
                  <div className="absolute bottom-6 right-6 z-20 flex gap-1.5 sm:bottom-8 sm:right-8">
                    {slides.map((image, index) => (
                      <button
                        key={image}
                        onClick={() => setActiveImage(index)}
                        aria-label={`View gallery image ${index + 1}`}
                        className={`h-1.5 rounded-full transition-all ${index === activeImage ? "w-7 bg-white" : "w-1.5 bg-white/55 hover:bg-white/90"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <ScrollArea className="min-h-0 shrink lg:h-full">
                <motion.div
                  key={dest.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="px-6 py-7 sm:px-8 sm:py-9"
                >
                  <section className="grid gap-8 pb-8 lg:grid-cols-[1.25fr_0.75fr]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                        About this place
                      </p>
                      <h3 className="mb-4 font-serif text-2xl font-semibold text-foreground">
                        A Sikkim travel snapshot
                      </h3>
                      <p className="max-w-3xl break-words leading-8 text-muted-foreground">
                        {dest.description}
                      </p>
                    </div>
                    <div className="border-l-2 border-secondary/60 pl-5">
                      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Plan with confidence
                      </p>
                      <WeatherPanel
                        lat={dest.latitude}
                        lon={dest.longitude}
                        destName={dest.name}
                      />
                    </div>
                  </section>
                  <section className="grid border-y border-border/70 py-1 sm:grid-cols-3">
                    {dest.entryFee && (
                      <InfoLine
                        icon={<IndianRupee className="h-4 w-4" />}
                        label="Entry fee"
                        value={dest.entryFee}
                      />
                    )}
                    <InfoLine
                      icon={<CalendarDays className="h-4 w-4" />}
                      label="Best time to visit"
                      value={dest.bestTimeToVisit}
                    />
                    <InfoLine
                      icon={<Ticket className="h-4 w-4" />}
                      label="Permits"
                      value={dest.permitsRequired}
                    />
                  </section>
                  <section className="grid gap-8 border-b border-border/70 py-8 lg:grid-cols-[1fr_0.95fr]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Getting there
                      </p>
                      <h3 className="mb-4 flex items-center gap-2 font-serif text-2xl font-semibold">
                        <Route className="h-5 w-5 text-primary" /> How to reach
                      </h3>
                      <p className="break-words leading-7 text-muted-foreground">
                        {reach?.intro}
                      </p>
                      {reach && reach.steps.length > 0 && (
                        <ol className="mt-5 space-y-3">
                          {reach.steps.map((step, index) => (
                            <li
                              key={`${step}-${index}`}
                              className="flex gap-3 text-sm leading-6 text-muted-foreground"
                            >
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <div className="min-h-[17rem] overflow-hidden rounded-[var(--radius-card)] border border-border/70 bg-muted/20">
                      <iframe
                        title={`Map of ${dest.name}`}
                        src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
                        className="h-full min-h-[17rem] w-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary underline-offset-4 transition hover:underline lg:col-start-2"
                    >
                      <Navigation className="h-4 w-4" /> Open directions in
                      Google Maps
                    </a>
                  </section>
                  {dest.highlights.length > 0 && (
                    <section className="pt-8">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Highlights
                      </p>
                      <h3 className="mb-5 font-serif text-2xl font-semibold">
                        What makes this place special
                      </h3>
                      <ul className="grid sm:grid-cols-2">
                        {dest.highlights.map((highlight, index) => (
                          <li
                            key={`${highlight}-${index}`}
                            className="flex gap-3 border-t border-border/60 py-4 text-sm leading-6 text-muted-foreground sm:odd:pr-6 sm:even:border-l sm:even:pl-6"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </motion.div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
