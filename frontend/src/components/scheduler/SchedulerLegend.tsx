import { Info } from "lucide-react";
import { DropdownMenu } from "../ui/dropdownMenu";
import { useSchedulePalette } from "../../context/SchedulePaletteContext";

/** Classes mirror the subject rows in CurriculumSubjectTree. */
const STATUS_ROWS = [
  { cls: "border-rose-500 bg-rose-200 dark:border-rose-500/70 dark:bg-rose-800/90", label: "Not scheduled yet" },
  { cls: "border-amber-500 bg-amber-200 dark:border-amber-500/70 dark:bg-amber-800/90", label: "Partly scheduled" },
  { cls: "border-emerald-500 bg-emerald-200 dark:border-emerald-500/70 dark:bg-emerald-800/90", label: "Fully scheduled" },
  { cls: "border-blue-500 bg-blue-200 dark:border-blue-500/70 dark:bg-blue-800/90", label: "Over-scheduled" },
] as const;

function Row({ mark, children }: { mark: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[13px] leading-snug text-foreground">
      <span aria-hidden className="flex w-9 shrink-0 items-center justify-center">{mark}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Heading({ id, children, hint }: { id: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <h3 id={id} className="text-xs font-semibold text-foreground">{children}</h3>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-foreground-muted">{hint}</p>}
    </div>
  );
}

/** Button + panel shell shared by the two legends. */
function LegendPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-surface data-[state=open]:bg-surface-hover data-[state=open]:text-foreground"
        >
          <Info size={14} aria-hidden />
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" sideOffset={6} className="w-72 max-w-[calc(100vw-2rem)] p-3" aria-label={label}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

/** Status colours of the subjects in the curriculum pane. Sits in that pane's header. */
export function SubjectStatusLegend() {
  return (
    <LegendPopover label="Legend">
      <section aria-labelledby="legend-subjects">
        <Heading id="legend-subjects" hint="Hours scheduled for the class against the hours a week the subject needs.">
          Subject list
        </Heading>
        <ul className="space-y-1.5">
          {STATUS_ROWS.map((row) => (
            <Row key={row.label} mark={<span className={`h-4 w-7 rounded border ${row.cls}`} />}>
              {row.label}
            </Row>
          ))}
        </ul>
      </section>
    </LegendPopover>
  );
}

/** Colours and markers of the blocks on the schedule grid. Sits in the schedule panel header. */
export function BlockLegend() {
  const { palette } = useSchedulePalette();
  return (
    <LegendPopover label="Legend">
      <section aria-labelledby="legend-blocks">
        <Heading id="legend-blocks">Blocks on the grid</Heading>
        <ul className="space-y-1.5">
          <Row
            mark={
              <span className="flex gap-px">
                {palette.colors.slice(0, 3).map((c) => (
                  <span key={c} className={`h-4 w-2.5 first:rounded-l last:rounded-r ${c}`} />
                ))}
              </span>
            }
          >
            Each subject has its own colour. Change the set with Block colors.
          </Row>
          <Row mark={<span className="h-4 w-7 rounded border-2 border-dashed border-foreground-muted bg-surface-muted" />}>
            Dashed border: laboratory-only subject
          </Row>
          <Row mark={<span className="h-4 w-7 rounded border-2 border-amber-500 bg-amber-100 ring-1 ring-amber-500/50 dark:border-amber-400 dark:bg-amber-900/40" />}>
            Amber outline: awaiting approval
          </Row>
          <Row mark={<span className="h-4 w-7 rounded bg-danger/20 ring-1 ring-danger" />}>
            Red: conflict with another block
          </Row>
          <Row mark={<span className="h-4 w-7 rounded bg-surface-muted ring-2 ring-primary" />}>
            Blue ring: selected block
          </Row>
          <Row mark={<span className="rounded bg-black/10 px-1 text-[9px] font-semibold uppercase tracking-wide dark:bg-white/20">Split</span>}>
            Class split between instructors
          </Row>
          <Row mark={<span className="text-xs">🔒</span>}>Room closed for this term</Row>
        </ul>
      </section>
    </LegendPopover>
  );
}
