import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import type { AcademicYear, StudentClass, Subject } from "../../types/api";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { HelpTip } from "../../components/ui/helpTip";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";

interface Busy {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  held: boolean;
}
interface SharedRoom {
  id: string;
  name: string;
  capacity: number;
  isLab: boolean;
  hasComputer: boolean;
  hasAC: boolean;
  collegeId: string;
  collegeName: string;
  departmentName: string;
  busy: Busy[];
}
interface Block {
  id: string;
  roomId: string;
  roomName: string;
  roomDepartmentName: string | null;
  className: string;
  subjectCode: string;
  subjectName: string;
  facultyName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  semester: number;
  hostCollegeName?: string;
}
interface Approval {
  id: string;
  departmentId: string;
  departmentName: string;
  status: string;
  decidedByName: string | null;
  decidedAt: string | null;
  notes: string | null;
}
interface ShareRequest {
  id: string;
  status: string;
  guestCollegeName: string;
  hostCollegeName: string;
  academicYearName: string;
  semester: number;
  blockCount: number;
  note: string | null;
  submittedByName: string;
  decidedByName: string | null;
  decisionNotes: string | null;
  createdAt: string;
  approvals: Approval[];
}
interface RequestDetail extends Omit<ShareRequest, "blockCount"> {
  blocks: Block[];
  actions: { chairmanDecides: boolean; secretaryDecides: boolean; canCancel: boolean };
}
interface FacultyOption {
  id: string;
  name: string;
}

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEMESTERS = [
  { value: 1, label: "1st Sem" },
  { value: 2, label: "2nd Sem" },
  { value: 3, label: "Mid Year" },
];
const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_CHAIRMAN: { label: "Waiting for chairmen", cls: "bg-warning/15 text-warning" },
  PENDING_SECRETARY: { label: "Waiting for college secretary", cls: "bg-warning/15 text-warning" },
  APPROVED: { label: "Approved", cls: "bg-success/15 text-success" },
  REJECTED: { label: "Rejected", cls: "bg-danger/15 text-danger" },
  CANCELLED: { label: "Cancelled", cls: "bg-surface-hover text-foreground-muted" },
};
const selectClass =
  "h-10 rounded border border-border-strong bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring";

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
/** The server takes times such as 7:30. */
const clock = (t: string) => t.replace(/^0/, "");
const DAY_START = 7 * 60;
const DAY_END = 21 * 60;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-surface-hover text-foreground-muted" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

/** One week of a room as thin day strips; taken time is shaded, time held by a waiting request is hatched. */
function WeekStrip({ busy }: { busy: Busy[] }) {
  return (
    <div className="space-y-0.5" aria-label="Room use this week">
      {[1, 2, 3, 4, 5, 6].map((d) => (
        <div key={d} className="flex items-center gap-1.5">
          <span className="w-7 text-[10px] text-foreground-muted">{DAYS[d]}</span>
          <div className="relative h-2.5 flex-1 rounded-sm bg-success/15">
            {busy
              .filter((b) => b.dayOfWeek === d)
              .map((b, i) => {
                const left = ((Math.max(minutes(b.startTime), DAY_START) - DAY_START) / (DAY_END - DAY_START)) * 100;
                const width = ((Math.min(minutes(b.endTime), DAY_END) - Math.max(minutes(b.startTime), DAY_START)) / (DAY_END - DAY_START)) * 100;
                return (
                  <span
                    key={i}
                    className={`absolute inset-y-0 rounded-sm ${b.held ? "bg-warning/60" : "bg-foreground-muted/60"}`}
                    style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                    title={`${b.startTime}-${b.endTime}${b.held ? " (held by a request)" : ""}`}
                  />
                );
              })}
          </div>
        </div>
      ))}
      <div className="flex justify-between pl-9 text-[9px] text-foreground-muted">
        <span>7</span>
        <span>12</span>
        <span>17</span>
        <span>21</span>
      </div>
    </div>
  );
}

function BlockLine({ b, showRoom = true }: { b: Block; showRoom?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border py-1.5 text-sm last:border-b-0">
      {showRoom && <span className="w-36 font-medium text-foreground">{b.roomName}</span>}
      <span className="w-28 text-foreground">
        {DAYS[b.dayOfWeek]} {b.startTime}–{b.endTime}
      </span>
      <span className="text-foreground">
        {b.subjectCode} <span className="text-foreground-muted">{b.subjectName}</span>
      </span>
      <span className="text-foreground-muted">{b.className}</span>
      {b.facultyName && <span className="text-foreground-muted">· {b.facultyName}</span>}
    </li>
  );
}

// ------------------------------------------------------------------ add a block to the drafts

function DraftDialog({
  room,
  term,
  onClose,
  onAdded,
}: {
  room: SharedRoom;
  term: { academicYearId: string; semester: number };
  onClose: () => void;
  onAdded: () => void;
}) {
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<FacultyOption[]>([]);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("08:30");
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<StudentClass[]>("/student-classes").then(({ data }) => setClasses(data)).catch(() => setClasses([]));
    apiClient.get<Subject[]>("/subjects").then(({ data }) => setSubjects(data)).catch(() => setSubjects([]));
    apiClient.get<FacultyOption[]>("/users/assignable-faculty").then(({ data }) => setFaculty(data)).catch(() => setFaculty([]));
  }, []);

  const cls = classes.find((c) => c.id === classId);
  const subjectChoices = useMemo(
    () => subjects.filter((s) => !cls || (s as Subject & { curriculumId?: string | null }).curriculumId === cls.curriculumId),
    [subjects, cls]
  );
  const body = {
    roomId: room.id,
    ...term,
    studentClassId: classId,
    subjectId,
    facultyId: facultyId || null,
    dayOfWeek: day,
    startTime: clock(start),
    endTime: clock(end),
  };
  const ready = Boolean(classId && subjectId && start && end);

  // check the block while the form changes, so the person sees why it will not fit before saving
  useEffect(() => {
    if (!ready) {
      setProblems([]);
      return;
    }
    const handle = setTimeout(() => {
      apiClient
        .post<{ problems: string[] }>("/room-share/drafts/preview", body)
        .then(({ data }) => setProblems(data.problems))
        .catch((err) => setProblems([getApiErrorMessage(err, "Could not check this block.")]));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, subjectId, facultyId, day, start, end]);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.post("/room-share/drafts", body);
      toast.success("Added to your drafts");
      onAdded();
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not add the block"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content title={`Draft a block in ${room.name}`} description={`${room.collegeName} · ${room.departmentName}. Your college secretary submits the drafts as a request.`}>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-foreground-muted">Class</span>
            <select className={`${selectClass} w-full`} value={classId} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>
              <option value="">Choose a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-foreground-muted">Subject</span>
            <select className={`${selectClass} w-full`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
              <option value="">Choose a subject</option>
              {subjectChoices.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-foreground-muted">Faculty (optional)</span>
            <select className={`${selectClass} w-full`} value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
              <option value="">No faculty yet</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-foreground-muted">Day</span>
              <select className={`${selectClass} w-full`} value={day} onChange={(e) => setDay(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>{DAYS[d]}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-foreground-muted">From</span>
              <input type="time" className={`${selectClass} w-full`} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-foreground-muted">To</span>
              <input type="time" className={`${selectClass} w-full`} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <WeekStrip busy={room.busy} />
          {problems.length > 0 && (
            <ul className="space-y-1 rounded border border-danger/40 bg-danger/10 p-2 text-sm text-danger" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!ready || problems.length > 0 || saving}>Add to drafts</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

// ------------------------------------------------------------------ one request, as the approvers see it

function RequestDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiClient.get<RequestDetail>(`/room-share/requests/${id}`).then(({ data }) => setDetail(data)).catch(() => toast.error("Could not load the request"));
  }, [id]);
  useEffect(load, [load]);

  const act = async (kind: "approve" | "reject" | "cancel") => {
    setBusy(true);
    try {
      if (kind === "cancel") await apiClient.post(`/room-share/requests/${id}/cancel`);
      else await apiClient.post(`/room-share/requests/${id}/${kind}`, { notes: notes.trim() || null });
      toast.success(kind === "approve" ? "Approved" : kind === "reject" ? "Rejected" : "Request cancelled");
      onChanged();
      if (kind === "cancel") onClose();
      else load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "That did not work"));
    } finally {
      setBusy(false);
    }
  };

  const byRoom = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const b of detail?.blocks ?? []) map.set(b.roomName, [...(map.get(b.roomName) ?? []), b]);
    return [...map];
  }, [detail]);

  const decides = detail?.actions.chairmanDecides || detail?.actions.secretaryDecides;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content title="Room request" className="max-w-3xl">
        {!detail ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="mt-2 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={detail.status} />
              <span className="text-foreground">{detail.guestCollegeName} → {detail.hostCollegeName}</span>
              <span className="text-foreground-muted">{detail.academicYearName}, {SEMESTERS.find((s) => s.value === detail.semester)?.label}</span>
            </div>
            {detail.note && <p className="text-sm text-foreground-muted">Note from {detail.submittedByName}: {detail.note}</p>}

            <div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">Approval</h3>
              <ol className="space-y-1 text-sm">
                {detail.approvals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-48 text-foreground">Chairman, {a.departmentName}</span>
                    <StatusBadge status={a.status === "PENDING" ? "PENDING_CHAIRMAN" : a.status} />
                    {a.decidedByName && <span className="text-foreground-muted">{a.decidedByName}</span>}
                    {a.notes && <span className="text-foreground-muted">“{a.notes}”</span>}
                  </li>
                ))}
                <li className="flex flex-wrap items-center gap-2">
                  <span className="w-48 text-foreground">College secretary, {detail.hostCollegeName}</span>
                  {detail.status === "APPROVED" ? <StatusBadge status="APPROVED" /> : detail.status === "PENDING_SECRETARY" ? <StatusBadge status="PENDING_SECRETARY" /> : <span className="text-foreground-muted">After the chairmen</span>}
                  {detail.decidedByName && detail.status !== "PENDING_CHAIRMAN" && <span className="text-foreground-muted">{detail.decidedByName}</span>}
                </li>
              </ol>
              <p className="mt-1 text-xs text-foreground-muted">The dean sees this request and is notified; the dean does not approve it.</p>
            </div>

            <div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">New blocks ({detail.blocks.length})</h3>
              <div className="max-h-72 space-y-3 overflow-y-auto rounded border border-border p-3" tabIndex={0} aria-label="New blocks">
                {byRoom.map(([room, blocks]) => (
                  <section key={room}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{room}{blocks[0].roomDepartmentName ? ` · ${blocks[0].roomDepartmentName}` : ""}</h4>
                    <ul>{blocks.map((b) => <BlockLine key={b.id} b={b} showRoom={false} />)}</ul>
                  </section>
                ))}
              </div>
            </div>

            {decides && (
              <label className="block text-sm">
                <span className="mb-1 block text-foreground-muted">Note (needed to reject)</span>
                <input className={`${selectClass} w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </label>
            )}
            {detail.decisionNotes && <p className="text-sm text-foreground-muted">Decision note: {detail.decisionNotes}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {detail.actions.canCancel && <Button variant="dangerOutline" disabled={busy} onClick={() => act("cancel")}>Cancel request</Button>}
              {decides && (
                <>
                  <Button variant="dangerOutline" disabled={busy || !notes.trim()} onClick={() => act("reject")}>Reject</Button>
                  <Button disabled={busy} onClick={() => act("approve")}>{detail.actions.secretaryDecides ? "Give final approval" : "Approve for my department"}</Button>
                </>
              )}
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

// ------------------------------------------------------------------ the page

type Tab = "rooms" | "drafts" | "requests";

export function RoomSharingPage() {
  const user = useAppSelector((s) => s.auth.user);
  const isChairman = user?.role === "CHAIRMAN";
  const isSecretary = user?.role === "COLLEGE_SECRETARY";
  const [tab, setTab] = useState<Tab>("rooms");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [minCapacity, setMinCapacity] = useState("");
  const [labOnly, setLabOnly] = useState(false);
  const [rooms, setRooms] = useState<SharedRoom[] | null>(null);
  const [drafts, setDrafts] = useState<Block[] | null>(null);
  const [requests, setRequests] = useState<ShareRequest[] | null>(null);
  const [side, setSide] = useState<"guest" | "host">("guest");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [drafting, setDrafting] = useState<SharedRoom | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiClient
      .get<AcademicYear[]>("/academic-years/for-schedules")
      .then(({ data }) => {
        setYears(data);
        const active = data.find((y) => y.isActive) ?? data[0];
        if (active) {
          setYearId(active.id);
          setSemester(active.currentSemester ?? 1);
        }
      })
      .catch(() => setYears([]));
  }, []);

  const loadRooms = useCallback(() => {
    if (!yearId) return;
    setRooms(null);
    const params = new URLSearchParams({ academicYearId: yearId, semester: String(semester) });
    if (Number(minCapacity) > 0) params.set("minCapacity", minCapacity);
    if (labOnly) params.set("isLab", "true");
    apiClient.get<SharedRoom[]>(`/room-share/rooms?${params}`).then(({ data }) => setRooms(data)).catch(() => setRooms([]));
  }, [yearId, semester, minCapacity, labOnly]);
  const loadDrafts = useCallback(() => {
    apiClient.get<Block[]>("/room-share/drafts").then(({ data }) => setDrafts(data)).catch(() => setDrafts([]));
  }, []);
  const loadRequests = useCallback(() => {
    apiClient.get<ShareRequest[]>(`/room-share/requests?side=${side}`).then(({ data }) => setRequests(data)).catch(() => setRequests([]));
  }, [side]);

  useEffect(loadRooms, [loadRooms]);
  useEffect(loadDrafts, [loadDrafts]);
  useEffect(loadRequests, [loadRequests]);

  const byCollege = useMemo(() => {
    const map = new Map<string, SharedRoom[]>();
    for (const r of rooms ?? []) map.set(r.collegeName, [...(map.get(r.collegeName) ?? []), r]);
    return [...map];
  }, [rooms]);

  const removeDraft = async (id: string) => {
    try {
      await apiClient.delete(`/room-share/drafts/${id}`);
      setPicked((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      loadDrafts();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove the draft"));
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiClient.post("/room-share/requests", { draftIds: [...picked], note: note.trim() || null });
      toast.success("Request submitted. The chairmen of the rooms approve first.");
      setPicked(new Set());
      setNote("");
      loadDrafts();
      loadRooms();
      setSide("guest");
      setTab("requests");
      loadRequests();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not submit the request"));
    } finally {
      setSubmitting(false);
    }
  };

  const draftGroups = useMemo(() => {
    const map = new Map<string, Block[]>();
    for (const d of drafts ?? []) {
      const key = `${d.hostCollegeName} · ${SEMESTERS.find((s) => s.value === d.semester)?.label}`;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map];
  }, [drafts]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "rooms", label: "Available rooms" },
    { key: "drafts", label: "Drafts", count: drafts?.length },
    { key: "requests", label: "Requests" },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground">Room sharing</h1>
        <HelpTip>
          Once a college locks a semester, its rooms are open to other colleges for the time they are free. Chairmen draft blocks, the college secretary submits them as a request, the chairman of each room's department approves first, then the host college secretary gives the final approval. Deans view and are notified.
        </HelpTip>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-focus-ring ${tab === t.key ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"}`}
          >
            {t.label}
            {t.count ? <span className="ml-1.5 rounded-full bg-primary-muted px-1.5 text-xs text-primary">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "rooms" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-foreground-muted">Academic year</span>
              <select className={selectClass} value={yearId} onChange={(e) => setYearId(e.target.value)}>
                {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-foreground-muted">Semester</span>
              <select className={selectClass} value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
                {SEMESTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-foreground-muted">Seats at least</span>
              <input type="number" min={1} className={`${selectClass} w-28`} value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} />
            </label>
            <label className="flex h-10 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={labOnly} onChange={(e) => setLabOnly(e.target.checked)} /> Laboratories only
            </label>
          </div>
          {rooms === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : byCollege.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-foreground-muted">
              No rooms are open for this semester yet. A college's rooms open to others when it locks the semester.
            </p>
          ) : (
            byCollege.map(([college, list]) => (
              <section key={college}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">{college}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((r) => (
                    <article key={r.id} className="rounded-lg border border-border bg-surface p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium text-foreground">{r.name}</h3>
                          <p className="text-xs text-foreground-muted">
                            {r.departmentName} · {r.capacity} seats{r.isLab ? " · Laboratory" : ""}{r.hasComputer ? " · Computers" : ""}{r.hasAC ? " · A/C" : ""}
                          </p>
                        </div>
                        {isChairman && <Button size="xs" onClick={() => setDrafting(r)}>Draft a block</Button>}
                      </div>
                      <div className="mt-2"><WeekStrip busy={r.busy} /></div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
          <p className="text-xs text-foreground-muted">Shaded time is taken; amber time is held by a request waiting for approval.</p>
        </div>
      )}

      {tab === "drafts" && (
        <div className="space-y-4">
          {drafts === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : drafts.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-foreground-muted">
              {isChairman ? "You have no drafts. Pick a room under Available rooms and draft a block." : "No chairman has drafted a block yet."}
            </p>
          ) : (
            draftGroups.map(([group, blocks]) => (
              <section key={group} className="rounded-lg border border-border bg-surface p-3">
                <h2 className="mb-1 text-sm font-semibold text-foreground">{group}</h2>
                <ul>
                  {blocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-3">
                      {isSecretary && (
                        <input
                          type="checkbox"
                          aria-label={`Include ${b.subjectCode} in ${b.roomName}`}
                          checked={picked.has(b.id)}
                          onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(b.id); else n.delete(b.id); return n; })}
                        />
                      )}
                      <ul className="flex-1"><BlockLine b={b} /></ul>
                      {(isChairman || isSecretary) && <Button size="xs" variant="ghost" onClick={() => removeDraft(b.id)}>Remove</Button>}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          {isSecretary && (drafts?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
              <label className="min-w-64 flex-1 text-sm">
                <span className="mb-1 block text-foreground-muted">Note for the approvers (optional)</span>
                <input className={`${selectClass} w-full`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </label>
              <Button disabled={picked.size === 0 || submitting} onClick={submit}>
                Submit {picked.size || ""} {picked.size === 1 ? "block" : "blocks"} as a request
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-3">
          <div className="flex gap-2 text-sm">
            <Button size="sm" variant={side === "guest" ? "primary" : "secondary"} onClick={() => setSide("guest")}>Asked by us</Button>
            <Button size="sm" variant={side === "host" ? "primary" : "secondary"} onClick={() => setSide("host")}>Asked of us</Button>
          </div>
          {requests === null ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : requests.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-foreground-muted">No requests here yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-hover text-xs uppercase tracking-wide text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2">From → to</th>
                    <th className="px-3 py-2">Term</th>
                    <th className="px-3 py-2">Blocks</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 text-foreground">{r.guestCollegeName} → {r.hostCollegeName}</td>
                      <td className="px-3 py-2 text-foreground-muted">{r.academicYearName}, {SEMESTERS.find((s) => s.value === r.semester)?.label}</td>
                      <td className="px-3 py-2">{r.blockCount}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-foreground-muted">{new Date(r.createdAt).toLocaleDateString()} · {r.submittedByName}</td>
                      <td className="px-3 py-2 text-right"><Button size="xs" variant="secondary" onClick={() => setOpenId(r.id)}>Open</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {drafting && <DraftDialog room={drafting} term={{ academicYearId: yearId, semester }} onClose={() => setDrafting(null)} onAdded={() => { loadDrafts(); loadRooms(); }} />}
      {openId && <RequestDialog id={openId} onClose={() => setOpenId(null)} onChanged={() => { loadRequests(); loadRooms(); }} />}
    </div>
  );
}
