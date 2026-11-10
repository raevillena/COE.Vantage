import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage, type AcademicYear } from "../../types/api";
import { useAppSelector } from "../../store/hooks";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { HelpTip } from "../../components/ui/helpTip";
import { filterSelectClass } from "../../components/ui/listFilters";
import { calendarTerm } from "../../utils/currentTerm";

type Kind = "MIDTERM" | "FINAL";
const KIND_LABEL: Record<Kind, string> = { MIDTERM: "Midterm", FINAL: "Final" };
const SEMESTER_LABEL: Record<number, string> = { 1: "1st Sem", 2: "2nd Sem", 3: "Mid Year" };

interface Period { id: string; kind: Kind; startDate: string; endDate: string; isOpen: boolean; openedByName: string | null }
interface RoomRow { id: string; name: string; capacity: number; isLab: boolean; departmentId: string; department: { id: string; name: string; code: string | null } }
interface Item { subjectId: string; subjectCode: string; subjectName: string; studentClassId: string; className: string; studentCount: number; reserved: Record<Kind, number> }
interface Block {
  id: string; kind: Kind; roomId: string; roomName: string; roomDepartmentId: string;
  subjectId: string; subjectCode: string; subjectName: string; studentClassId: string; className: string;
  ownerId: string; ownerName: string; date: string; startTime: string; endTime: string;
  removalRequest: { id: string; message: string | null; requestedByName: string } | null;
}
interface RemovalRequest { id: string; status: "PENDING" | "DECLINED"; message: string | null; requestedByName: string; ownerName: string; reservationId: string; description: string }

/** The grid runs 6:00 AM to 10:00 PM in half-hour rows. */
const DAY_START = 6 * 60;
const DAY_END = 22 * 60;
const STEP = 30;
const ROWS = (DAY_END - DAY_START) / STEP;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clock = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const daysBetween = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`) && out.length < 31; d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
};

function SubjectChip({ item, picked, onPick }: { item: Item; picked: boolean; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `item|${item.subjectId}|${item.studentClassId}`, data: { item } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onPick}
      className={`cursor-grab rounded-md border px-3 py-2 text-sm active:cursor-grabbing ${picked ? "border-primary bg-primary-muted" : "border-border bg-surface hover:bg-surface-hover"} ${isDragging ? "opacity-50" : ""}`}
      aria-label={`Subject ${item.subjectCode} ${item.className}`}
    >
      <div className="font-medium text-foreground">{item.subjectCode} · {item.className}</div>
      <div className="truncate text-xs text-foreground-muted">{item.subjectName}</div>
    </div>
  );
}

function Cell({ date, minute, onPlot, picked }: { date: string; minute: number; onPlot: () => void; picked: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell|${date}|${toTime(minute)}` });
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={-1}
      aria-label={`Plot on ${date} at ${toTime(minute)}`}
      onClick={onPlot}
      className={`border-b border-l border-border/60 ${minute % 60 === 0 ? "border-t-border" : ""} ${isOver ? "bg-primary/20" : picked ? "cursor-copy hover:bg-primary-muted/50" : ""}`}
    />
  );
}

export function ExamRoomReservationPage() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role ?? "";
  const canPlot = ["FACULTY", "CHAIRMAN", "DEAN", "COLLEGE_SECRETARY"].includes(role);
  const managesRounds = role === "ADMIN" || role === "COLLEGE_SECRETARY";

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [kind, setKind] = useState<Kind>("MIDTERM");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [requests, setRequests] = useState<{ incoming: RemovalRequest[]; outgoing: RemovalRequest[] }>({ incoming: [], outgoing: [] });
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Item | null>(null);
  const [plan, setPlan] = useState<{ item: Item; date: string; minute: number } | null>(null);
  const [duration, setDuration] = useState(90);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Block | null>(null);
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const period = periods.find((p) => p.kind === kind) ?? null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setYears(data);
      const term = calendarTerm(data);
      if (term) {
        setAcademicYearId(term.academicYearId);
        setSemester(term.semester);
      } else setLoading(false);
    }).catch(() => setLoading(false));
    apiClient.get<RoomRow[]>("/exam-rooms/rooms").then(({ data }) => setRooms(data)).catch(() => setRooms([]));
  }, []);

  const term = useMemo(() => ({ academicYearId, semester }), [academicYearId, semester]);

  const load = useCallback(async () => {
    if (!academicYearId) return;
    const params = { academicYearId, semester };
    try {
      const [p, b, r, i] = await Promise.all([
        apiClient.get<Period[]>("/exam-rooms/periods", { params }),
        apiClient.get<Block[]>("/exam-rooms/reservations", { params: { ...params, kind } }),
        apiClient.get<{ incoming: RemovalRequest[]; outgoing: RemovalRequest[] }>("/exam-rooms/removal-requests"),
        canPlot ? apiClient.get<Item[]>("/exam-rooms/my-items", { params }) : Promise.resolve({ data: [] as Item[] }),
      ]);
      setPeriods(p.data);
      setBlocks(b.data);
      setRequests(r.data);
      setItems(i.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not load the exam rooms"));
    } finally {
      setLoading(false);
    }
  }, [academicYearId, semester, kind, canPlot]);

  useEffect(() => {
    void load();
  }, [load]);

  // the room: one of the person's own department's rooms to start with
  useEffect(() => {
    if (roomId || rooms.length === 0) return;
    setRoomId((rooms.find((r) => r.departmentId === user?.departmentId) ?? rooms[0]).id);
  }, [rooms, roomId, user?.departmentId]);

  useEffect(() => {
    setStartDate(period?.startDate ?? "");
    setEndDate(period?.endDate ?? "");
  }, [period?.startDate, period?.endDate]);

  const days = useMemo(() => (period ? daysBetween(period.startDate, period.endDate) : []), [period]);
  const room = rooms.find((r) => r.id === roomId) ?? null;
  const roomBlocks = blocks.filter((b) => b.roomId === roomId);
  const blocksIn = (id: string) => blocks.filter((b) => b.roomId === id).length;
  const plottingOpen = Boolean(period?.isOpen);
  const roomGroups = useMemo(() => {
    const map = new Map<string, RoomRow[]>();
    for (const r of rooms) map.set(r.department.name, [...(map.get(r.department.name) ?? []), r]);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rooms]);

  const startPlot = (item: Item, date: string, minute: number) => {
    if (!plottingOpen) {
      toast.error(period ? "This round is not open yet. The college secretary opens it." : "The exam dates have not been set yet.");
      return;
    }
    setDuration(90);
    setPlan({ item, date, minute });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = (event.active.data.current as { item?: Item } | undefined)?.item;
    const over = typeof event.over?.id === "string" ? event.over.id : "";
    const [tag, date, time] = over.split("|");
    if (item && tag === "cell") startPlot(item, date, toMin(time));
  };

  const run = async (action: () => Promise<unknown>, done: string, fail: string) => {
    setSaving(true);
    try {
      await action();
      toast.success(done);
      await load();
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, fail));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reserve = async () => {
    if (!plan || !room) return;
    const end = plan.minute + duration;
    if (end > DAY_END) {
      toast.error("That runs past 10:00 PM. Pick a shorter length or an earlier start.");
      return;
    }
    const ok = await run(
      () => apiClient.post("/exam-rooms/reservations", { ...term, kind, roomId: room.id, subjectId: plan.item.subjectId, studentClassId: plan.item.studentClassId, date: plan.date, startTime: toTime(plan.minute), endTime: toTime(end) }),
      "Room reserved",
      "Could not reserve the room"
    );
    if (ok) {
      setPlan(null);
      setPicked(null);
    }
  };

  const isOwner = (b: Block) => b.ownerId === user?.id;
  const isRoomChairman = (b: Block) => role === "CHAIRMAN" && !!user?.departmentId && user.departmentId === b.roomDepartmentId;
  const closeBlock = () => {
    setSelected(null);
    setMessage("");
  };

  const saveDates = () =>
    run(() => apiClient.put("/exam-rooms/periods", { ...term, kind, startDate, endDate }), "Exam dates saved", "Could not save the dates");
  const toggleOpen = () => period && run(() => apiClient.put(`/exam-rooms/periods/${period.id}/open`, { open: !period.isOpen }), period.isOpen ? "Closed for plotting" : "Open for plotting", "Could not change it");

  if (loading) {
    return (
      <div className="flex justify-center py-12" aria-busy="true">
        <Spinner />
      </div>
    );
  }

  const year = years.find((y) => y.id === academicYearId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Exam Room Reservation</h1>
          <HelpTip>
            Plot your exams into rooms for the exam week. Drag one of your subjects onto a room's grid (or pick it, then click a time). First plotted, first served: a room cannot be double-booked, and a class cannot have two exams at once. The chairman of a room's department can remove a block or ask its owner to free it.
          </HelpTip>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
            Academic year
            <select className={filterSelectClass} value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)} aria-label="Academic year">
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
            Current Semester
            <select className={filterSelectClass} value={semester} onChange={(e) => setSemester(Number(e.target.value))} aria-label="Current Semester">
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{SEMESTER_LABEL[n]}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div role="tablist" aria-label="Exam round" className="flex gap-2">
        {(["MIDTERM", "FINAL"] as Kind[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md border px-4 py-1.5 text-sm font-medium ${kind === k ? "border-primary bg-primary-muted text-primary" : "border-border bg-surface text-foreground-muted hover:bg-surface-hover"}`}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4" aria-label={`${KIND_LABEL[kind]} exam round`}>
        {period ? (
          <p className="text-sm text-foreground" role="status">
            <strong>{KIND_LABEL[kind]} exams</strong> {dayLabel(period.startDate)} to {dayLabel(period.endDate)}
            {" · "}
            {period.isOpen ? (
              <span className="font-medium text-success">Open for plotting{period.openedByName ? ` (opened by ${period.openedByName})` : ""}</span>
            ) : (
              <span className="font-medium text-warning">Closed: the college secretary opens it for plotting</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-foreground-muted" role="status">The {KIND_LABEL[kind]} exam dates have not been set yet{managesRounds ? "." : ": the college secretary sets them."}</p>
        )}
        {managesRounds && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              First day
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={filterSelectClass} aria-label="First exam day" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground-muted">
              Last day
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={filterSelectClass} aria-label="Last exam day" />
            </label>
            <Button type="button" variant="secondary" disabled={saving || !startDate || !endDate || (period?.startDate === startDate && period?.endDate === endDate)} onClick={() => void saveDates()}>
              Save dates
            </Button>
            {period && (
              <Button type="button" disabled={saving} onClick={() => void toggleOpen()}>
                {period.isOpen ? "Close plotting" : "Open for plotting"}
              </Button>
            )}
          </div>
        )}
      </section>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <aside className="space-y-2" aria-label="My subjects">
            <h2 className="text-sm font-semibold text-foreground">My subjects this semester</h2>
            {!canPlot ? (
              <p className="text-sm text-foreground-muted">Only people who teach can plot exams. You can look at the rooms and remove blocks.</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-foreground-muted">You have no teaching load in {year?.name ?? "this term"}, {SEMESTER_LABEL[semester]}.</p>
            ) : (
              <>
                {items.map((item) => (
                  <div key={`${item.subjectId}|${item.studentClassId}`}>
                    <SubjectChip item={item} picked={picked?.subjectId === item.subjectId && picked.studentClassId === item.studentClassId} onPick={() => setPicked((p) => (p?.subjectId === item.subjectId && p.studentClassId === item.studentClassId ? null : item))} />
                    <p className="px-1 pt-0.5 text-xs text-foreground-muted">{item.reserved[kind] > 0 ? `${item.reserved[kind]} block${item.reserved[kind] === 1 ? "" : "s"} plotted` : "Not plotted yet"}</p>
                  </div>
                ))}
                <p className="text-xs text-foreground-muted">Drag a subject onto the grid, or pick it and click a time.</p>
              </>
            )}
          </aside>

          <section className="min-w-0 space-y-3" aria-label="Room grid">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                Room
                <select className={filterSelectClass} value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Room">
                  {roomGroups.map(([department, list]) => (
                    <optgroup key={department} label={department}>
                      {list.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} · {blocksIn(r.id)} block{blocksIn(r.id) === 1 ? "" : "s"}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {room && <span className="text-sm text-foreground-muted">{room.department.name} · seats {room.capacity}{room.isLab ? " · laboratory" : ""}</span>}
            </div>

            {days.length === 0 ? (
              <p className="rounded-lg border border-border bg-surface p-6 text-sm text-foreground-muted">No exam dates to show yet.</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface" data-testid="exam-grid">
                <div
                  className="relative grid min-w-max"
                  style={{ gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(8rem, 1fr))`, gridTemplateRows: `2.25rem repeat(${ROWS}, 1.5rem)` }}
                >
                  <div className="sticky left-0 top-0 z-30 border-b border-border bg-surface-muted" />
                  {days.map((d) => (
                    <div key={d} className="sticky top-0 z-20 border-b border-l border-border bg-surface-muted px-2 py-2 text-center text-xs font-semibold text-foreground">{dayLabel(d)}</div>
                  ))}
                  {Array.from({ length: ROWS }, (_, row) => {
                    const minute = DAY_START + row * STEP;
                    return (
                      <div key={`t${row}`} style={{ gridColumn: 1, gridRow: row + 2 }} className="sticky left-0 z-10 bg-surface pr-2 text-right text-[11px] leading-6 text-foreground-muted">
                        {minute % 60 === 0 ? clock(toTime(minute)) : ""}
                      </div>
                    );
                  })}
                  {days.map((d, col) =>
                    Array.from({ length: ROWS }, (_, row) => (
                      <div key={`${d}${row}`} style={{ gridColumn: col + 2, gridRow: row + 2 }} className="contents">
                        <Cell date={d} minute={DAY_START + row * STEP} onPlot={() => picked && startPlot(picked, d, DAY_START + row * STEP)} picked={!!picked} />
                      </div>
                    ))
                  )}
                  {roomBlocks.map((b) => {
                    const col = days.indexOf(b.date);
                    if (col < 0) return null;
                    const rowStart = Math.max(0, (toMin(b.startTime) - DAY_START) / STEP);
                    const rowEnd = Math.min(ROWS, (toMin(b.endTime) - DAY_START) / STEP);
                    const mine = isOwner(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelected(b)}
                        style={{ gridColumn: col + 2, gridRow: `${rowStart + 2} / ${rowEnd + 2}` }}
                        className={`z-[5] m-px overflow-hidden rounded border px-1.5 py-0.5 text-left text-xs leading-tight ${mine ? "border-primary bg-primary-muted text-foreground" : "border-border-strong bg-surface-muted text-foreground"} hover:shadow`}
                        aria-label={`Block ${b.subjectCode} ${b.className} ${b.date} ${b.startTime} to ${b.endTime} by ${b.ownerName}`}
                      >
                        <div className="truncate font-semibold">{b.subjectCode} · {b.className}</div>
                        <div className="truncate text-foreground-muted">{b.ownerName}</div>
                        {b.removalRequest && <div className="truncate font-medium text-warning">Removal requested</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </DndContext>

      {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2" aria-label="Removal requests">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">Asked of you</h2>
            {requests.incoming.length === 0 ? (
              <p className="mt-2 text-sm text-foreground-muted">Nobody has asked you to free a block.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {requests.incoming.map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="text-foreground">{q.description}</p>
                    <p className="text-foreground-muted">{q.requestedByName} asks you to free it{q.message ? `: ${q.message}` : "."}</p>
                    <div className="mt-1.5 flex gap-2">
                      <Button type="button" disabled={saving} onClick={() => void run(() => apiClient.post(`/exam-rooms/removal-requests/${q.id}/respond`, { accept: true }), "Block removed", "Could not answer")}>Accept and remove</Button>
                      <Button type="button" variant="secondary" disabled={saving} onClick={() => void run(() => apiClient.post(`/exam-rooms/removal-requests/${q.id}/respond`, { accept: false }), "Request declined", "Could not answer")}>Decline</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {requests.outgoing.length > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <h2 className="text-sm font-semibold text-foreground">Asked by you</h2>
              <ul className="mt-2 space-y-3">
                {requests.outgoing.map((q) => (
                  <li key={q.id} className="text-sm">
                    <p className="text-foreground">{q.description}</p>
                    <p className="text-foreground-muted">{q.ownerName}: {q.status === "PENDING" ? "waiting for an answer" : "declined"}</p>
                    <button type="button" className="mt-1 text-sm font-medium text-primary hover:underline" onClick={() => void run(() => apiClient.delete(`/exam-rooms/removal-requests/${q.id}`), q.status === "PENDING" ? "Request withdrawn" : "Cleared", "Could not clear it")}>
                      {q.status === "PENDING" ? "Withdraw" : "Clear"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <Dialog.Root open={plan !== null} onOpenChange={(open) => !open && setPlan(null)}>
        <Dialog.Content title="Reserve this room" description={plan ? `${plan.item.subjectCode} · ${plan.item.className} in ${room?.name ?? "the room"}` : undefined}>
          {plan && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-foreground">{dayLabel(plan.date)}, from {clock(toTime(plan.minute))}</p>
              <label className="flex flex-col gap-1 font-medium text-foreground">
                How long
                <select className={filterSelectClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Exam length">
                  {[60, 90, 120, 150, 180, 240].map((m) => (
                    <option key={m} value={m}>{m / 60} hour{m === 60 ? "" : "s"} (until {clock(toTime(Math.min(plan.minute + m, DAY_END + 24 * 60)))})</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-foreground-muted">First plotted, first served: if the room or the class is already taken at that time, you will be told who holds it.</p>
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setPlan(null)}>Cancel</Button>
                <Button type="button" disabled={saving} onClick={() => void reserve()}>{saving ? "Reserving…" : "Reserve"}</Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={selected !== null} onOpenChange={(open) => !open && closeBlock()}>
        <Dialog.Content title={selected ? `${selected.subjectCode} · ${selected.className}` : "Block"} description={selected ? `${selected.roomName}, ${dayLabel(selected.date)} ${clock(selected.startTime)} to ${clock(selected.endTime)}` : undefined}>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="text-foreground">{selected.subjectName}</p>
              <p className="text-foreground-muted">Reserved by {selected.ownerName}.</p>
              {selected.removalRequest && (
                <p className="rounded-md bg-warning-muted px-3 py-2 text-foreground">
                  {selected.removalRequest.requestedByName} asked for this block to be freed{selected.removalRequest.message ? `: ${selected.removalRequest.message}` : "."}
                </p>
              )}
              {isRoomChairman(selected) && !isOwner(selected) && !selected.removalRequest && (
                <label className="flex flex-col gap-1 font-medium text-foreground">
                  Message to the owner (optional)
                  <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-normal" aria-label="Message to the owner" />
                </label>
              )}
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" onClick={closeBlock}>Close</Button>
                {isOwner(selected) && (
                  <Button type="button" variant="danger" disabled={saving} onClick={() => void run(() => apiClient.delete(`/exam-rooms/reservations/${selected.id}`), "Block removed", "Could not remove it").then((ok) => ok && closeBlock())}>
                    Remove my block
                  </Button>
                )}
                {!isOwner(selected) && isRoomChairman(selected) && !selected.removalRequest && (
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => void run(() => apiClient.post(`/exam-rooms/reservations/${selected.id}/removal-request`, { message }), "Request sent", "Could not send the request").then((ok) => ok && closeBlock())}>
                    Ask the owner to remove it
                  </Button>
                )}
                {!isOwner(selected) && (isRoomChairman(selected) || role === "ADMIN") && (
                  <Button type="button" variant="danger" disabled={saving} onClick={() => void run(() => apiClient.delete(`/exam-rooms/reservations/${selected.id}`), "Block removed", "Could not remove it").then((ok) => ok && closeBlock())}>
                    Remove now
                  </Button>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
