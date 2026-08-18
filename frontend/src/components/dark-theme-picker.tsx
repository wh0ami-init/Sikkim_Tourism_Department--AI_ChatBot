/**
 * "Dark-mode surface color picker" component. Lets the user pick a preset or a custom HSL base color; hitting "Set" recolors every dark-mode surface (backgrounds, cards, panels, nav, dialogs) to match, and persists the choice to localStorage.
 *
 * Only meaningful in dark mode — the trigger is disabled in light mode,
 * since light mode always stays the site's default palette. Lets the user
 * pick a preset or a custom HSL base color; hitting "Set" recolors every
 * dark-mode surface (backgrounds, cards, panels, nav, dialogs) to match,
 * and persists the choice to localStorage.
 */

import { useEffect, useState } from "react";
import { Palette, Check, RotateCcw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  DARK_PRESETS,
  applyDarkPaletteVars,
  getSavedDarkPalette,
  resetDarkPalette,
  saveDarkPalette,
  type DarkHSL,
} from "@/lib/dark-palette";

const DEFAULT_PALETTE: DarkHSL = { h: 170, s: 32, l: 8 };

export function DarkThemePicker({
  theme,
  triggerClassName,
}: {
  theme: "light" | "dark";
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DarkHSL>(
    () => getSavedDarkPalette() ?? DEFAULT_PALETTE,
  );
  const [savedActive, setSavedActive] = useState<DarkHSL | null>(() =>
    getSavedDarkPalette(),
  );

  // Live-preview the draft color while the popover is open (dark mode only),
  // but don't persist until "Set" is pressed.
  useEffect(() => {
    if (!open || theme !== "dark") return;
    applyDarkPaletteVars(draft);
    return () => {
      // Revert preview to the actually-saved color when closing without saving.
      applyDarkPaletteVars(savedActive ?? DEFAULT_PALETTE);
      if (!savedActive) resetDarkPalette();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, theme]);

  const handleSet = () => {
    saveDarkPalette(draft);
    applyDarkPaletteVars(draft);
    setSavedActive(draft);
    setOpen(false);
  };

  const handleReset = () => {
    resetDarkPalette();
    setSavedActive(null);
    setDraft(DEFAULT_PALETTE);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={theme !== "dark"}
          aria-label="Choose dark mode color"
          title={
            theme === "dark"
              ? "Choose dark mode color"
              : "Switch to dark mode to customize its color"
          }
          className={
            triggerClassName ??
            "flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-white/70 text-muted-foreground transition-all duration-200 hover:border-border hover:bg-white hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 dark:bg-card/70 dark:hover:bg-card"
          }
        >
          <Palette className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Dark mode color
        </p>

        <Tabs defaultValue="presets">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="presets">Presets</TabsTrigger>
            <TabsTrigger value="custom">Custom (HSL)</TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="mt-3">
            <div className="grid grid-cols-3 gap-2.5">
              {DARK_PRESETS.map((preset) => {
                const isActive =
                  draft.h === preset.value.h &&
                  draft.s === preset.value.s &&
                  draft.l === preset.value.l;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDraft(preset.value)}
                    title={preset.label}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-105 ${
                        isActive ? "border-primary" : "border-border/60"
                      }`}
                      style={{
                        background: `hsl(${preset.value.h} ${preset.value.s}% ${preset.value.l}%)`,
                      }}
                    >
                      {isActive && (
                        <Check className="h-4 w-4 text-white drop-shadow" />
                      )}
                    </span>
                    <span className="max-w-[4.5rem] truncate text-[0.62rem] leading-tight text-muted-foreground">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-3 space-y-4">
            <div
              className="h-14 w-full rounded-xl border border-border/60"
              style={{
                background: `hsl(${draft.h} ${draft.s}% ${draft.l}%)`,
              }}
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Hue</span>
                <span>{Math.round(draft.h)}°</span>
              </div>
              <Slider
                min={0}
                max={360}
                step={1}
                value={[draft.h]}
                onValueChange={([h]) => setDraft((d) => ({ ...d, h }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Saturation</span>
                <span>{Math.round(draft.s)}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[draft.s]}
                onValueChange={([s]) => setDraft((d) => ({ ...d, s }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Lightness</span>
                <span>{Math.round(draft.l)}%</span>
              </div>
              {/* Capped at 35% so the result still reads as a dark surface */}
              <Slider
                min={2}
                max={35}
                step={1}
                value={[draft.l]}
                onValueChange={([l]) => setDraft((d) => ({ ...d, l }))}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </button>
          <button
            type="button"
            onClick={handleSet}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"
          >
            Set
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
