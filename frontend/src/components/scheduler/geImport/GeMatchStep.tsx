import { DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { GripVertical, X } from "lucide-react";
import { Button } from "../../ui/button";
import { HelpTip } from "../../ui/helpTip";
import { DAY_NAMES, hoursLabel, rowKey, type ClassSubject, type GeRow } from "./geImportTypes";

const SKIP = "skip";

interface Props {
  rows: GeRow[];
  subjects: ClassSubject[];
  /** Manual choices: row key -> subject id, "skip", "none" (unmatched), or missing (use the automatic match). */
  assign: Record<string, string>;
  onAssign: (rowKey: string, value: string | null) => void;
}

/** What a row is matched to: the manual choice, else the subject with the same course code. */
export function effectiveSubjectId(row: GeRow, subjects: ClassSubject[], assign: Record<string, string>): string | null {
  const manual = assign[rowKey(row)];
  if (manual === "none") return null; // taken off its automatic match, waiting to be matched by hand
  if (manual) return manual;
  return subjects.find((s) => s.codeKey === row.codeKey && row.codeKey)?.id ?? null;
}

function describe(row: GeRow) {
  const days = row.days.map((d) => DAY_NAMES[d]).join("");
  return `${days} ${row.startTime}-${row.endTime}`;
}

function RowCard({ row, subjects, onAssign }: { row: GeRow; subjects: ClassSubject[]; onAssign: Props["onAssign"] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: rowKey(row) });
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`rounded border border-border bg-surface p-2 text-sm ${isDragging ? "relative z-50 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...listeners}
          {...attributes}
          className="mt-0.5 cursor-grab touch-none rounded p-0.5 text-foreground-muted hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-focus-ring"
          aria-label={`Drag ${row.code} onto a subject`}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {row.code} <span className="font-normal text-foreground-muted">{row.title}</span>
          </p>
          <p className="text-xs text-foreground-muted">
            {describe(row)} · {row.faculty || "No faculty"} · {row.room || "No room"}
          </p>
          <label className="sr-only" htmlFor={`match-${rowKey(row)}`}>Match {row.code} to</label>
          <select
            id={`match-${rowKey(row)}`}
            value=""
            onChange={(e) => e.target.value && onAssign(rowKey(row), e.target.value)}
            className="mt-1 w-full rounded border border-border-strong bg-surface px-2 py-1 text-xs text-foreground focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">Match to…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.code} {s.name}</option>
            ))}
            <option value={SKIP}>Not part of this class (skip)</option>
          </select>
        </div>
      </div>
    </li>
  );
}

function SubjectTarget({ subject, matched, onAssign }: { subject: ClassSubject; matched: GeRow[]; onAssign: Props["onAssign"] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `subject:${subject.id}` });
  return (
    <li
      ref={setNodeRef}
      className={`rounded border p-2 text-sm ${isOver ? "border-primary bg-primary-muted" : "border-border bg-surface"}`}
    >
      <p className="font-medium text-foreground">
        {subject.code} <span className="font-normal text-foreground-muted">{subject.name}</span>
      </p>
      <p className="text-xs text-foreground-muted">
        {subject.units} {subject.units === 1 ? "unit" : "units"}{subject.isLab ? ", lab" : ""} · needs {hoursLabel(subject.requiredMinutes)} a week
        {subject.scheduledMinutes > 0 ? `, ${hoursLabel(subject.scheduledMinutes)} already scheduled` : ""}
      </p>
      {matched.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {matched.map((r) => (
            <li key={rowKey(r)} className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 text-xs text-foreground">
              {r.code} {describe(r)}
              <button
                type="button"
                onClick={() => onAssign(rowKey(r), "none")}
                className="rounded p-0.5 text-foreground-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring"
                aria-label={`Unmatch ${r.code}`}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SkipZone({ rows, onAssign }: { rows: GeRow[]; onAssign: Props["onAssign"] }) {
  const { setNodeRef, isOver } = useDroppable({ id: SKIP });
  return (
    <div ref={setNodeRef} className={`mt-3 rounded border border-dashed p-2 text-sm ${isOver ? "border-primary bg-primary-muted" : "border-border-strong bg-surface-muted/40"}`}>
      <p className="text-xs font-medium text-foreground-muted">Drop here to skip rows that are not part of this class</p>
      {rows.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {rows.map((r) => (
            <li key={rowKey(r)} className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-xs text-foreground">
              {r.code}
              <button type="button" onClick={() => onAssign(rowKey(r), null)} className="rounded p-0.5 text-foreground-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring" aria-label={`Bring back ${r.code}`}>
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function GeMatchStep({ rows, subjects, assign, onAssign }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const state = rows.map((r) => ({ row: r, id: effectiveSubjectId(r, subjects, assign) }));
  const unmatched = state.filter((s) => !s.id).map((s) => s.row);
  const skipped = state.filter((s) => s.id === SKIP).map((s) => s.row);
  const bySubject = (id: string) => state.filter((s) => s.id === id).map((s) => s.row);
  const autoCount = state.filter((s) => s.id && s.id !== SKIP && !assign[rowKey(s.row)]).length;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const target = String(e.over.id);
    onAssign(String(e.active.id), target === SKIP ? SKIP : target.replace("subject:", ""));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
      <div className="mb-3 flex items-center gap-2 text-sm text-foreground-muted">
        <span>
          {autoCount} matched by course code, {unmatched.length} to match{skipped.length ? `, ${skipped.length} skipped` : ""}.
        </span>
        <HelpTip>
          Rows whose course code equals a subject of this class are matched for you. Drag the others onto the subject they belong to, or use the Match to list on the card. Several rows can go to one subject, for example a lecture and a lab of the same code.
        </HelpTip>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Rows from the file that need matching">
          <h3 className="mb-2 text-sm font-semibold text-foreground">From the file, to match</h3>
          {unmatched.length === 0 ? (
            <p className="rounded border border-border bg-surface-muted/40 px-3 py-6 text-center text-sm text-foreground-muted">Every row is matched.</p>
          ) : (
            <ul className="space-y-2">
              {unmatched.map((r) => (
                <RowCard key={rowKey(r)} row={r} subjects={subjects} onAssign={onAssign} />
              ))}
            </ul>
          )}
          <SkipZone rows={skipped} onAssign={onAssign} />
        </section>
        <section aria-label="Subjects of this class">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Subjects of this class</h3>
          {subjects.length === 0 ? (
            <p className="rounded border border-border bg-surface-muted/40 px-3 py-6 text-center text-sm text-foreground-muted">
              This class has no subjects for this year level and semester.
            </p>
          ) : (
            <ul className="space-y-2">
              {subjects.map((s) => (
                <SubjectTarget key={s.id} subject={s} matched={bySubject(s.id)} onAssign={onAssign} />
              ))}
            </ul>
          )}
        </section>
      </div>
      {unmatched.length > 0 && (
        <p className="mt-3 text-xs text-foreground-muted">
          Rows left unmatched are not added.{" "}
          <Button type="button" variant="ghost" size="xs" onClick={() => unmatched.forEach((r) => onAssign(rowKey(r), SKIP))}>
            Skip all {unmatched.length}
          </Button>
        </p>
      )}
    </DndContext>
  );
}
