import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SchedulePaletteId =
  | "balanced"
  | "soft"
  | "vivid"
  | "cool"
  | "warm"
  | "earth"
  | "ocean"
  | "forest"
  | "balancedDark"
  | "softDark"
  | "vividDark"
  | "coolDark"
  | "warmDark"
  | "earthDark"
  | "oceanDark"
  | "forestDark";

export interface SchedulePalette {
  id: SchedulePaletteId;
  label: string;
  description: string;
  /** Tailwind utility classes used for subject backgrounds, one per distinct subject. */
  colors: string[];
}

const ALL_PALETTES: SchedulePalette[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Clear but not too strong; good default for most screens.",
    colors: [
      "bg-blue-200 dark:bg-blue-700",
      "bg-emerald-200 dark:bg-emerald-700",
      "bg-amber-200 dark:bg-amber-600",
      "bg-violet-200 dark:bg-violet-700",
      "bg-rose-200 dark:bg-rose-700",
      "bg-cyan-200 dark:bg-cyan-700",
      "bg-orange-200 dark:bg-orange-600",
      "bg-lime-200 dark:bg-lime-600",
      "bg-fuchsia-200 dark:bg-fuchsia-700",
      "bg-teal-200 dark:bg-teal-700",
      "bg-sky-200 dark:bg-sky-700",
      "bg-pink-200 dark:bg-pink-700",
    ],
  },
  {
    id: "soft",
    label: "Soft",
    description: "Muted, low-contrast fills that recede into the background.",
    colors: [
      "bg-blue-200/80 dark:bg-blue-700/70",
      "bg-emerald-200/80 dark:bg-emerald-700/70",
      "bg-amber-200/80 dark:bg-amber-700/70",
      "bg-violet-200/80 dark:bg-violet-800/70",
      "bg-rose-200/80 dark:bg-rose-700/70",
      "bg-cyan-200/80 dark:bg-cyan-700/70",
      "bg-orange-200/80 dark:bg-orange-700/70",
      "bg-lime-200/80 dark:bg-lime-700/70",
      "bg-fuchsia-200/80 dark:bg-fuchsia-700/70",
      "bg-teal-200/80 dark:bg-teal-700/70",
      "bg-sky-200/80 dark:bg-sky-700/70",
      "bg-pink-200/80 dark:bg-pink-700/70",
    ],
  },
  {
    id: "vivid",
    label: "Vivid",
    description: "High-contrast, saturated colors for maximum separation.",
    colors: [
      "bg-blue-500 dark:bg-blue-400",
      "bg-emerald-500 dark:bg-emerald-400",
      "bg-amber-400 dark:bg-amber-300",
      "bg-violet-500 dark:bg-violet-400",
      "bg-rose-500 dark:bg-rose-400",
      "bg-cyan-500 dark:bg-cyan-400",
      "bg-orange-500 dark:bg-orange-400",
      "bg-lime-500 dark:bg-lime-400",
      "bg-fuchsia-500 dark:bg-fuchsia-400",
      "bg-teal-500 dark:bg-teal-400",
      "bg-sky-500 dark:bg-sky-400",
      "bg-pink-500 dark:bg-pink-400",
    ],
  },
  {
    id: "cool",
    label: "Cool",
    description: "Blues, cyans, teals, and violets only.",
    colors: [
      "bg-blue-300 dark:bg-blue-600",
      "bg-indigo-300 dark:bg-indigo-600",
      "bg-violet-300 dark:bg-violet-600",
      "bg-cyan-300 dark:bg-cyan-600",
      "bg-sky-300 dark:bg-sky-600",
      "bg-teal-300 dark:bg-teal-600",
      "bg-blue-400 dark:bg-blue-500",
      "bg-indigo-400 dark:bg-indigo-500",
      "bg-violet-400 dark:bg-violet-500",
      "bg-cyan-400 dark:bg-cyan-500",
      "bg-sky-400 dark:bg-sky-500",
      "bg-teal-400 dark:bg-teal-500",
    ],
  },
  {
    id: "warm",
    label: "Warm",
    description: "Ambers, oranges, roses, and reds only.",
    colors: [
      "bg-amber-300 dark:bg-amber-600",
      "bg-orange-300 dark:bg-orange-600",
      "bg-rose-300 dark:bg-rose-600",
      "bg-red-300 dark:bg-red-600",
      "bg-yellow-400 dark:bg-yellow-500",
      "bg-orange-400 dark:bg-orange-500",
      "bg-amber-400 dark:bg-amber-500",
      "bg-rose-400 dark:bg-rose-500",
      "bg-red-400 dark:bg-red-500",
      "bg-pink-300 dark:bg-pink-600",
      "bg-amber-500 dark:bg-amber-400",
      "bg-orange-500 dark:bg-orange-400",
    ],
  },
  {
    id: "earth",
    label: "Earth",
    description: "Natural tones: stone, amber, lime, emerald, teal.",
    colors: [
      "bg-stone-300 dark:bg-stone-600",
      "bg-amber-300 dark:bg-amber-600",
      "bg-lime-300 dark:bg-lime-600",
      "bg-emerald-300 dark:bg-emerald-600",
      "bg-teal-300 dark:bg-teal-600",
      "bg-yellow-300 dark:bg-yellow-600",
      "bg-stone-400 dark:bg-stone-500",
      "bg-amber-400 dark:bg-amber-500",
      "bg-lime-400 dark:bg-lime-500",
      "bg-emerald-400 dark:bg-emerald-500",
      "bg-teal-400 dark:bg-teal-500",
      "bg-amber-200 dark:bg-amber-700",
    ],
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Water-inspired: blues, cyans, teals, and sky.",
    colors: [
      "bg-blue-200 dark:bg-blue-700",
      "bg-blue-300 dark:bg-blue-600",
      "bg-cyan-200 dark:bg-cyan-700",
      "bg-cyan-300 dark:bg-cyan-600",
      "bg-teal-200 dark:bg-teal-700",
      "bg-teal-300 dark:bg-teal-600",
      "bg-sky-200 dark:bg-sky-700",
      "bg-sky-300 dark:bg-sky-600",
      "bg-indigo-200 dark:bg-indigo-700",
      "bg-indigo-300 dark:bg-indigo-600",
      "bg-blue-400 dark:bg-blue-500",
      "bg-cyan-400 dark:bg-cyan-500",
    ],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Greens: emerald, lime, teal, and green.",
    colors: [
      "bg-emerald-300 dark:bg-emerald-600",
      "bg-emerald-400 dark:bg-emerald-500",
      "bg-lime-300 dark:bg-lime-600",
      "bg-lime-400 dark:bg-lime-500",
      "bg-teal-300 dark:bg-teal-600",
      "bg-teal-400 dark:bg-teal-500",
      "bg-green-300 dark:bg-green-600",
      "bg-green-400 dark:bg-green-500",
      "bg-emerald-200 dark:bg-emerald-700",
      "bg-lime-200 dark:bg-lime-700",
      "bg-teal-200 dark:bg-teal-700",
      "bg-green-200 dark:bg-green-700",
    ],
  },
  // Dark-theme–tuned variants: deeper shades so blocks read well in dark mode.
  {
    id: "balancedDark",
    label: "Balanced (dark)",
    description: "Balanced palette tuned for dark theme; deeper shades.",
    colors: [
      "bg-blue-300 dark:bg-blue-800",
      "bg-emerald-300 dark:bg-emerald-800",
      "bg-amber-300 dark:bg-amber-700",
      "bg-violet-300 dark:bg-violet-800",
      "bg-rose-300 dark:bg-rose-800",
      "bg-cyan-300 dark:bg-cyan-800",
      "bg-orange-300 dark:bg-orange-700",
      "bg-lime-300 dark:bg-lime-700",
      "bg-fuchsia-300 dark:bg-fuchsia-800",
      "bg-teal-300 dark:bg-teal-800",
      "bg-sky-300 dark:bg-sky-800",
      "bg-pink-300 dark:bg-pink-800",
    ],
  },
  {
    id: "softDark",
    label: "Soft (dark)",
    description: "Soft palette tuned for dark theme; muted deeper fills.",
    colors: [
      "bg-blue-200/90 dark:bg-blue-800/85",
      "bg-emerald-200/90 dark:bg-emerald-800/85",
      "bg-amber-200/90 dark:bg-amber-800/85",
      "bg-violet-200/90 dark:bg-violet-800/85",
      "bg-rose-200/90 dark:bg-rose-800/85",
      "bg-cyan-200/90 dark:bg-cyan-800/85",
      "bg-orange-200/90 dark:bg-orange-800/85",
      "bg-lime-200/90 dark:bg-lime-800/85",
      "bg-fuchsia-200/90 dark:bg-fuchsia-800/85",
      "bg-teal-200/90 dark:bg-teal-800/85",
      "bg-sky-200/90 dark:bg-sky-800/85",
      "bg-pink-200/90 dark:bg-pink-800/85",
    ],
  },
  {
    id: "vividDark",
    label: "Vivid (dark)",
    description: "Vivid palette tuned for dark theme; strong but not glaring.",
    colors: [
      "bg-blue-500 dark:bg-blue-600",
      "bg-emerald-500 dark:bg-emerald-600",
      "bg-amber-400 dark:bg-amber-600",
      "bg-violet-500 dark:bg-violet-600",
      "bg-rose-500 dark:bg-rose-600",
      "bg-cyan-500 dark:bg-cyan-600",
      "bg-orange-500 dark:bg-orange-600",
      "bg-lime-500 dark:bg-lime-600",
      "bg-fuchsia-500 dark:bg-fuchsia-600",
      "bg-teal-500 dark:bg-teal-600",
      "bg-sky-500 dark:bg-sky-600",
      "bg-pink-500 dark:bg-pink-600",
    ],
  },
  {
    id: "coolDark",
    label: "Cool (dark)",
    description: "Cool palette tuned for dark theme.",
    colors: [
      "bg-blue-300 dark:bg-blue-800",
      "bg-indigo-300 dark:bg-indigo-800",
      "bg-violet-300 dark:bg-violet-800",
      "bg-cyan-300 dark:bg-cyan-800",
      "bg-sky-300 dark:bg-sky-800",
      "bg-teal-300 dark:bg-teal-800",
      "bg-blue-400 dark:bg-blue-700",
      "bg-indigo-400 dark:bg-indigo-700",
      "bg-violet-400 dark:bg-violet-700",
      "bg-cyan-400 dark:bg-cyan-700",
      "bg-sky-400 dark:bg-sky-700",
      "bg-teal-400 dark:bg-teal-700",
    ],
  },
  {
    id: "warmDark",
    label: "Warm (dark)",
    description: "Warm palette tuned for dark theme.",
    colors: [
      "bg-amber-300 dark:bg-amber-700",
      "bg-orange-300 dark:bg-orange-700",
      "bg-rose-300 dark:bg-rose-700",
      "bg-red-300 dark:bg-red-700",
      "bg-yellow-400 dark:bg-yellow-600",
      "bg-orange-400 dark:bg-orange-600",
      "bg-amber-400 dark:bg-amber-600",
      "bg-rose-400 dark:bg-rose-600",
      "bg-red-400 dark:bg-red-600",
      "bg-pink-300 dark:bg-pink-700",
      "bg-amber-500 dark:bg-amber-500",
      "bg-orange-500 dark:bg-orange-500",
    ],
  },
  {
    id: "earthDark",
    label: "Earth (dark)",
    description: "Earth palette tuned for dark theme.",
    colors: [
      "bg-stone-400 dark:bg-stone-700",
      "bg-amber-300 dark:bg-amber-700",
      "bg-lime-300 dark:bg-lime-700",
      "bg-emerald-300 dark:bg-emerald-700",
      "bg-teal-300 dark:bg-teal-700",
      "bg-yellow-400 dark:bg-yellow-600",
      "bg-stone-500 dark:bg-stone-600",
      "bg-amber-400 dark:bg-amber-600",
      "bg-lime-400 dark:bg-lime-600",
      "bg-emerald-400 dark:bg-emerald-600",
      "bg-teal-400 dark:bg-teal-600",
      "bg-amber-200 dark:bg-amber-800",
    ],
  },
  {
    id: "oceanDark",
    label: "Ocean (dark)",
    description: "Ocean palette tuned for dark theme.",
    colors: [
      "bg-blue-300 dark:bg-blue-800",
      "bg-blue-400 dark:bg-blue-700",
      "bg-cyan-300 dark:bg-cyan-800",
      "bg-cyan-400 dark:bg-cyan-700",
      "bg-teal-300 dark:bg-teal-800",
      "bg-teal-400 dark:bg-teal-700",
      "bg-sky-300 dark:bg-sky-800",
      "bg-sky-400 dark:bg-sky-700",
      "bg-indigo-300 dark:bg-indigo-800",
      "bg-indigo-400 dark:bg-indigo-700",
      "bg-blue-500 dark:bg-blue-600",
      "bg-cyan-500 dark:bg-cyan-600",
    ],
  },
  {
    id: "forestDark",
    label: "Forest (dark)",
    description: "Forest palette tuned for dark theme.",
    colors: [
      "bg-emerald-300 dark:bg-emerald-700",
      "bg-emerald-400 dark:bg-emerald-600",
      "bg-lime-300 dark:bg-lime-700",
      "bg-lime-400 dark:bg-lime-600",
      "bg-teal-300 dark:bg-teal-700",
      "bg-teal-400 dark:bg-teal-600",
      "bg-green-300 dark:bg-green-700",
      "bg-green-400 dark:bg-green-600",
      "bg-emerald-400 dark:bg-emerald-800",
      "bg-lime-400 dark:bg-lime-800",
      "bg-teal-400 dark:bg-teal-800",
      "bg-green-400 dark:bg-green-800",
    ],
  },
];

const DEFAULT_PALETTE_ID: SchedulePaletteId = "balanced";

function getPaletteById(id: SchedulePaletteId | null | undefined): SchedulePalette {
  return ALL_PALETTES.find((p) => p.id === id) ?? ALL_PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID)!;
}

const VALID_PALETTE_IDS: SchedulePaletteId[] = [
  "balanced",
  "soft",
  "vivid",
  "cool",
  "warm",
  "earth",
  "ocean",
  "forest",
  "balancedDark",
  "softDark",
  "vividDark",
  "coolDark",
  "warmDark",
  "earthDark",
  "oceanDark",
  "forestDark",
];

function getInitialPaletteId(): SchedulePaletteId {
  if (typeof window === "undefined") return DEFAULT_PALETTE_ID;
  const raw = window.localStorage.getItem("schedulePalette");
  if (raw && VALID_PALETTE_IDS.includes(raw as SchedulePaletteId)) return raw as SchedulePaletteId;
  return DEFAULT_PALETTE_ID;
}

interface SchedulePaletteContextValue {
  paletteId: SchedulePaletteId;
  palette: SchedulePalette;
  palettes: SchedulePalette[];
  setPaletteId: (id: SchedulePaletteId) => void;
}

const SchedulePaletteContext = createContext<SchedulePaletteContextValue | undefined>(undefined);

export function SchedulePaletteProvider({ children }: { children: ReactNode }) {
  const [paletteId, setPaletteId] = useState<SchedulePaletteId>(() => getInitialPaletteId());

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("schedulePalette", paletteId);
    }
  }, [paletteId]);

  const palette = useMemo(() => getPaletteById(paletteId), [paletteId]);

  const value = useMemo<SchedulePaletteContextValue>(
    () => ({
      paletteId,
      palette,
      palettes: ALL_PALETTES,
      setPaletteId,
    }),
    [paletteId, palette],
  );

  return <SchedulePaletteContext.Provider value={value}>{children}</SchedulePaletteContext.Provider>;
}

export function useSchedulePalette(): SchedulePaletteContextValue {
  const ctx = useContext(SchedulePaletteContext);
  if (!ctx) {
    throw new Error("useSchedulePalette must be used within a SchedulePaletteProvider");
  }
  return ctx;
}

export const SCHEDULE_PALETTES: ReadonlyArray<SchedulePalette> = ALL_PALETTES;

