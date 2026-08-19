import { useState, useEffect } from "react";
import { DestinationCard } from "@/components/destination-card";
import { DestinationDetailsDialog } from "@/components/destination-details-dialog";
import { Input } from "@/components/ui/input";
import { Search, Filter, MapPin, MountainSnow } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchDestinations,
  fetchCategories,
  type DestinationSummary,
} from "@/lib/api";

function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function Destinations() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 350);

  // The admin console opens this route with ?preview=<id>, letting an editor
  // verify the exact public-facing destination view in a separate tab.
  useEffect(() => {
    const previewId = Number(new URLSearchParams(window.location.search).get("preview"));
    if (Number.isInteger(previewId) && previewId > 0) setSelectedId(previewId);
  }, []);

  useEffect(() => {
    fetchCategories()
        .then(setCategories)
        .catch((err: unknown) =>
            console.error("Failed to load categories:", err),
        );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    fetchDestinations(
        debouncedSearch || undefined,
        category !== "all" ? category : undefined,
        controller.signal,
    )
        .then(setDestinations)
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          console.error("Failed to load destinations:", err);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, category]);

  const isFiltered = debouncedSearch || category !== "all";

  return (
      <div className="flex flex-1 flex-col bg-transparent">
        <div className="relative overflow-hidden border-b border-border/50">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(39,122,107,0.10),rgba(39,122,107,0.02)),radial-gradient(circle_at_top_left,rgba(233,169,59,0.16),transparent_26%),radial-gradient(circle_at_top_right,rgba(39,122,107,0.14),transparent_32%)]" />
          <div className="animate-ambient-drift absolute -left-16 top-10 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
          <div className="animate-ambient-drift-delayed absolute -right-12 bottom-0 h-56 w-56 rounded-full bg-secondary/12 blur-3xl" />
          <div className="absolute inset-0 hidden dark:block dark:bg-black/25" />

          <div className="relative container mx-auto max-w-6xl px-4 py-14 md:py-18">
            <div className="mx-auto max-w-3xl text-center">
              <p className="mb-4 flex items-center justify-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-primary/80 animate-rise-fade">
                <MountainSnow className="h-3.5 w-3.5" />
                Official destination guide
              </p>
              <h1
                  className="font-serif text-4xl font-bold text-foreground animate-rise-fade md:text-5xl"
                  style={{ animationDelay: "80ms" }}
              >
                Explore Destinations
              </h1>
              <p
                  className="mt-4 text-lg leading-relaxed text-muted-foreground animate-rise-fade"
                  style={{ animationDelay: "160ms" }}
              >
                From the serene waters of Tsomgo Lake to the ancient walls of
                Rumtek Monastery, discover the beauty of the Himalayas.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-5xl rounded-[var(--radius-panel)] border border-border/70 bg-white/78 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl animate-rise-fade dark:bg-white/[0.06] dark:border-white/10 sm:p-5" style={{ animationDelay: "240ms" }}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground dark:text-white/50" />
                  <Input
                      placeholder="Search places, districts, or experiences..."
                      className="h-13 rounded-2xl border-border/70 bg-background/70 pl-11 text-base shadow-none dark:bg-white/10 dark:border-white/15 dark:text-white dark:placeholder:text-white/50"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-13 w-full rounded-2xl border-border/70 bg-background/70 px-4 shadow-none dark:bg-white/10 dark:border-white/15 sm:w-[230px]">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="All Categories" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">
                          {c}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto flex flex-1 px-4 py-8">
          <div className="w-full rounded-[var(--radius-panel)] border border-border/70 bg-white/72 p-6 shadow-[0_22px_56px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:bg-card/72 sm:p-8">
            {!isLoading && (
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground animate-rise-fade">
                    {isFiltered
                        ? `${destinations.length} result${destinations.length !== 1 ? "s" : ""} found`
                        : `${destinations.length} destination${destinations.length !== 1 ? "s" : ""} in Sikkim`}
                  </p>
                  {isFiltered && (
                      <button
                          onClick={() => {
                            setSearch("");
                            setCategory("all");
                          }}
                          className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                      >
                        Clear filters
                      </button>
                  )}
                </div>
            )}

            {isLoading ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                          key={i}
                          className="skeleton-shimmer h-[410px] rounded-[var(--radius-card)] border border-border/50"
                      />
                  ))}
                </div>
            ) : destinations.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {destinations.map((dest, i) => (
                      <div
                          key={dest.id}
                          className="animate-in slide-in-from-bottom-4 fade-in duration-500 fill-mode-both"
                          style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <DestinationCard
                            dest={dest}
                            onClick={() => setSelectedId(dest.id)}
                        />
                      </div>
                  ))}
                </div>
            ) : (
                <div className="animate-rise-fade rounded-[var(--radius-panel)] border border-dashed border-border bg-background/70 px-4 py-24 text-center">
                  <MapPin className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
                  <h3 className="mb-2 text-xl font-semibold text-foreground">
                    No destinations found
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your search or filters to find what you're looking
                    for.
                  </p>
                </div>
            )}
          </div>
        </div>

        <DestinationDetailsDialog
            id={selectedId}
            open={selectedId !== null}
            onOpenChange={(open) => !open && setSelectedId(null)}
        />
      </div>
  );
}
