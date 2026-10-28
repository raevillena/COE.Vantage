import { useEffect, useRef, useState } from "react";
import { useSchedulePalette, type SchedulePalette } from "../../context/SchedulePaletteContext";

/** A palette shown as a small tile of its first four block colours. */
function PaletteChip({ palette, className = "" }: { palette: SchedulePalette; className?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-md bg-border-strong p-px ${className}`}>
      {palette.colors.slice(0, 4).map((c) => (
        <span key={c} className={`block ${c}`} />
      ))}
    </span>
  );
}

/**
 * Block colours for the schedule grid. Collapsed it shows the current palette; it opens on pointer hover or keyboard
 * focus to show every palette as a swatch, and a click or tap pins it open (for touch screens). Escape closes it.
 */
export function BlockColorPicker() {
  const { paletteId, palette, palettes, setPaletteId } = useSchedulePalette();
  const rootRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;

  // a tap or click outside releases a pinned panel
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinned]);

  const light = palettes.filter((p) => !p.id.endsWith("Dark"));
  const dark = palettes.filter((p) => p.id.endsWith("Dark"));

  const group = (label: string, list: SchedulePalette[]) => (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
      <div className="grid grid-cols-4 gap-1">
        {list.map((p) => {
          const selected = p.id === paletteId;
          return (
            <button
              key={p.id}
              type="button"
              title={p.label}
              aria-label={p.label}
              aria-pressed={selected}
              onClick={() => {
                setPaletteId(p.id);
                setPinned(false);
              }}
              className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-focus-ring ${
                selected
                  ? "border-primary bg-primary-muted/60 font-semibold text-foreground"
                  : "border-transparent text-foreground-muted hover:border-border hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <PaletteChip palette={p} className="h-7 w-9" />
              <span className="max-w-full truncate">{p.label.replace(" (dark)", "")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setPinned(false);
          setHover(false);
          setFocus(false);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Block colors: ${palette.label}`}
        onClick={() => setPinned((v) => !v)}
        className="inline-flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-surface"
      >
        Block colors
        <PaletteChip palette={palette} className="h-5 w-6" />
      </button>
      {open && (
        // pt-1.5 keeps the pointer inside the hover area while it travels from the button to the swatches
        <div className="absolute right-0 top-full z-30 pt-1.5">
          <div className="w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-border bg-surface p-3 shadow-lg">
            {group("Light theme", light)}
            {group("Dark theme", dark)}
          </div>
        </div>
      )}
    </div>
  );
}
