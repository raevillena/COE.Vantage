import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

interface HelpTipProps {
  /** The explanation shown in the popover. Keep it to a couple of plain sentences. */
  children: React.ReactNode;
  /** Accessible name of the icon button. Defaults to "More information". */
  label?: string;
  className?: string;
}

const POPOVER_WIDTH = 288; // 18rem
const GAP = 8;

/**
 * A small (?) icon that explains a control or section. Opens on hover, keyboard focus or click/tap and
 * closes on Escape or when focus or the pointer leaves. The popover renders in a portal so dialogs and
 * scroll containers never clip it.
 */
export function HelpTip({ children, label = "More information", className = "" }: HelpTipProps) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const above = r.bottom + 120 > window.innerHeight && r.top > 140;
    setPos({ top: above ? r.top - GAP : r.bottom + GAP, left, above });
  }, []);

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    place();
    setOpen(true);
  };
  const hide = () => {
    if (pinned) return;
    hideTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPinned(false);
        e.stopPropagation();
      }
    };
    const onScroll = () => place();
    const onDown = (e: MouseEvent) => {
      if (!buttonRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={() => {
          setPinned(false);
          hide();
        }}
        onClick={() => {
          if (open && pinned) {
            setPinned(false);
            setOpen(false);
          } else {
            setPinned(true);
            show();
          }
        }}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 ${className}`}
      >
        <CircleHelp size={16} aria-hidden />
      </button>
      {open && pos
        ? createPortal(
            <div
              id={id}
              role="tooltip"
              onMouseEnter={show}
              onMouseLeave={hide}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: Math.min(POPOVER_WIDTH, window.innerWidth - 16),
                transform: pos.above ? "translateY(-100%)" : undefined,
                zIndex: 60,
              }}
              className="rounded-md border border-border bg-surface px-3 py-2 text-left text-xs font-normal leading-relaxed text-foreground shadow-lg"
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
