import { useCallback, useEffect, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { apiClient } from "../../api/apiClient";
import type { FacultyLoad, AcademicYear, UserListItem, StudentClass, Room } from "../../types/api";
import type { SubjectDragItem, LoadDragItem } from "../../components/scheduler/schedulerTypes";
import type { AssignmentFormValues } from "../../components/scheduler/AssignmentForm";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import { CurriculumSubjectTree } from "../../components/scheduler/CurriculumSubjectTree";
import {
  ScheduleSlotOverlay,
  parseSlotId,
  type PendingAssignmentBlock,
} from "../../components/scheduler/ScheduleSlotOverlay";
import { AssignmentForm } from "../../components/scheduler/AssignmentForm";
import { AddFacultyLoadModal } from "../../components/addFacultyLoadModal/AddFacultyLoadModal";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import toast from "react-hot-toast";
import { hourToTimeString } from "../../components/scheduler/scheduleGridConstants";

type ViewMode = "class" | "faculty";

/** Pre-filled when dropping a subject on a slot; or empty when opening "Add load" without drop. */
interface PendingAssignment {
  subjectId?: string;
  subjectCode?: string;
  subjectName?: string;
  studentClassId?: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  facultyId?: string;
  roomId?: string;
}

export function SchedulerPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("class");
  const [studentClasses, setStudentClasses] = useState<StudentClass[]>([]);
  const [studentClassId, setStudentClassId] = useState("");
  const [faculties, setFaculties] = useState<UserListItem[]>([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState("");
  const [loads, setLoads] = useState<FacultyLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<SubjectDragItem | null>(null);
  const [activeDragLoad, setActiveDragLoad] = useState<FacultyLoad | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const [editingLoadId, setEditingLoadId] = useState<string | null>(null);
  const [editingLoad, setEditingLoad] = useState<FacultyLoad | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  /** When false, main schedule shows only up to 6 PM; "+" expands to show later hours. */
  const [showLateHours, setShowLateHours] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomLoads, setRoomLoads] = useState<FacultyLoad[]>([]);
  const [roomLoadsLoading, setRoomLoadsLoading] = useState(false);

  useEffect(() => {
    apiClient.get("/academic-years").then(({ data }) => {
      setAcademicYears(data);
      const active = data.find((y: AcademicYear) => y.isActive);
      if (active) setAcademicYearId(active.id);
    });
    apiClient.get("/users?role=FACULTY").then(({ data }) => setFaculties(data));
    apiClient.get("/student-classes").then(({ data }) => setStudentClasses(data));
    apiClient.get<Room[]>("/rooms").then(({ data }) => setRooms(data));
  }, []);

  useEffect(() => {
    if (!academicYearId || !selectedRoomId) {
      setRoomLoads([]);
      return;
    }
    setRoomLoadsLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), roomId: selectedRoomId });
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setRoomLoads(data))
      .finally(() => setRoomLoadsLoading(false));
  }, [academicYearId, semester, selectedRoomId]);

  const refreshLoads = useCallback(() => {
    if (!academicYearId) return;
    const params = new URLSearchParams({ academicYearId, semester: String(semester) });
    if (viewMode === "class" && studentClassId) params.set("studentClassId", studentClassId);
    if (viewMode === "faculty" && selectedFacultyId) params.set("facultyId", selectedFacultyId);
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setLoads(data));
  }, [academicYearId, semester, viewMode, studentClassId, selectedFacultyId]);

  const refreshRoomLoads = useCallback(() => {
    if (!academicYearId || !selectedRoomId) return;
    setRoomLoadsLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), roomId: selectedRoomId });
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setRoomLoads(data))
      .finally(() => setRoomLoadsLoading(false));
  }, [academicYearId, semester, selectedRoomId]);

  useEffect(() => {
    if (!academicYearId) {
      setLoads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester) });
    if (viewMode === "class" && studentClassId) params.set("studentClassId", studentClassId);
    if (viewMode === "faculty" && selectedFacultyId) params.set("facultyId", selectedFacultyId);
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setLoads(data))
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [academicYearId, semester, viewMode, studentClassId, selectedFacultyId]);

  useEffect(() => {
    if (!editingLoadId) {
      setEditingLoad(null);
      return;
    }
    apiClient.get<FacultyLoad>(`/faculty-loads/${editingLoadId}`).then(({ data }) => setEditingLoad(data)).catch(() => setEditingLoad(null));
  }, [editingLoadId]);


  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragging(false);
    setActiveDragItem(null);
    setActiveDragLoad(null);
    setOverSlotId(null);
    const { active, over } = event;
    if (!over?.id || typeof over.id !== "string") return;
    const slot = parseSlotId(over.id);
    if (!slot) return;

    const data = active.data.current as SubjectDragItem | LoadDragItem | undefined;
    if (data?.type === "load") {
      const startTime = hourToTimeString(slot.hour);
      const endTime = hourToTimeString(slot.hour + 1);
      const load = data.load;
      apiClient
        .patch(`/faculty-loads/${load.id}`, {
          facultyId: load.facultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          dayOfWeek: slot.dayOfWeek,
          startTime,
          endTime,
          semester,
          academicYearId,
        })
        .then(() => {
          refreshLoads();
          refreshRoomLoads();
          setEditingLoadId(null);
          toast.success("Assignment moved");
        })
        .catch(() => toast.error("Failed to move"));
      return;
    }

    if (data?.type !== "subject") return;
    const startTime = hourToTimeString(slot.hour);
    const endTime = hourToTimeString(slot.hour + 1);
    setPendingAssignment({
      subjectId: data.subjectId,
      subjectCode: data.code,
      subjectName: data.name,
      studentClassId: viewMode === "class" ? studentClassId : undefined,
      dayOfWeek: slot.dayOfWeek,
      startTime,
      endTime,
    });
    setEditingLoadId(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    const data = event.active.data.current as SubjectDragItem | LoadDragItem | undefined;
    if (data?.type === "subject") {
      setActiveDragItem(data);
      setActiveDragLoad(null);
    } else if (data?.type === "load") {
      setActiveDragLoad(data.load);
      setActiveDragItem(null);
    } else {
      setActiveDragItem(null);
      setActiveDragLoad(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const id = event.over?.id;
    if (typeof id === "string" && /^slot-\d+-\d+$/.test(id)) setOverSlotId(id);
    else setOverSlotId(null);
  };

  const handleDragCancel = () => {
    setIsDragging(false);
    setActiveDragItem(null);
    setActiveDragLoad(null);
    setOverSlotId(null);
  };

  const handleLoadMove = useCallback(
    (load: FacultyLoad, payload: { dayOfWeek: number; startTime: string; endTime: string }) => {
      apiClient
        .patch(`/faculty-loads/${load.id}`, {
          facultyId: load.facultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          dayOfWeek: payload.dayOfWeek,
          startTime: payload.startTime,
          endTime: payload.endTime,
          semester,
          academicYearId,
        })
        .then(() => {
          refreshLoads();
          refreshRoomLoads();
          setEditingLoadId(null);
          toast.success("Assignment moved");
        })
        .catch(() => toast.error("Failed to move"));
    },
    [academicYearId, semester, refreshLoads, refreshRoomLoads]
  );

  const handleLoadResize = useCallback(
    (load: FacultyLoad, payload: { startTime: string; endTime: string }) => {
      apiClient
        .patch(`/faculty-loads/${load.id}`, {
          facultyId: load.facultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          dayOfWeek: load.dayOfWeek,
          startTime: payload.startTime,
          endTime: payload.endTime,
          semester,
          academicYearId,
        })
        .then(() => {
          refreshLoads();
          refreshRoomLoads();
          toast.success("Time updated");
        })
        .catch(() => toast.error("Failed to resize"));
    },
    [academicYearId, semester, refreshLoads, refreshRoomLoads]
  );

  const showAssignmentForm = pendingAssignment !== null || editingLoadId !== null;
  const assignmentInitialValues: Partial<AssignmentFormValues> = editingLoad
    ? {
        facultyId: editingLoad.facultyId,
        subjectId: editingLoad.subjectId,
        studentClassId: editingLoad.studentClassId,
        roomId: editingLoad.roomId,
        dayOfWeek: editingLoad.dayOfWeek,
        startTime: editingLoad.startTime,
        endTime: editingLoad.endTime,
      }
    : pendingAssignment
      ? {
          subjectId: pendingAssignment.subjectId,
          studentClassId: pendingAssignment.studentClassId ?? studentClassId,
          dayOfWeek: pendingAssignment.dayOfWeek,
          startTime: pendingAssignment.startTime,
          endTime: pendingAssignment.endTime,
        }
      : {};

  const clearAssignmentPanel = () => {
    setPendingAssignment(null);
    setEditingLoadId(null);
  };

  const showGrid = academicYearId && (viewMode === "class" ? studentClassId : viewMode === "faculty" ? selectedFacultyId : false);

  const SCHEDULE_HOUR_END_DEFAULT = 18;
  const SCHEDULE_HOUR_END_FULL = 21;
  const scheduleHourEnd = showLateHours ? SCHEDULE_HOUR_END_FULL : SCHEDULE_HOUR_END_DEFAULT;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[400px] ">
      <h1 className="text-2xl font-semibold text-foreground mb-4">Scheduler</h1>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[160px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic Year</label>
          <Select.Root value={academicYearId || "__none__"} onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}>
            <Select.Trigger aria-label="Academic year" className="w-full">
              <Select.Value placeholder="Academic Year" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="__none__">Academic Year</Select.Item>
              {academicYears.map((y) => (
                <Select.Item key={y.id} value={y.id}>
                  {y.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Semester</label>
          <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
            <Select.Trigger aria-label="Semester" className="w-[100px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">Sem 1</Select.Item>
              <Select.Item value="2">Sem 2</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">View:</span>
          <Select.Root value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <Select.Trigger aria-label="View mode" className="w-[140px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="class">Class schedule</Select.Item>
              <Select.Item value="faculty">Faculty schedule</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        {viewMode === "class" && (
          <div className="min-w-[180px]">
            <label className="mb-1 block text-sm font-medium text-foreground">Student Class</label>
            <Select.Root value={studentClassId || "__none__"} onValueChange={(v) => setStudentClassId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Student class" className="w-full">
                <Select.Value placeholder="Select class" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select class</Select.Item>
                {studentClasses.map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        )}
        {viewMode === "faculty" && (
          <div className="min-w-[180px]">
            <label className="mb-1 block text-sm font-medium text-foreground">Faculty</label>
            <Select.Root value={selectedFacultyId || "__none__"} onValueChange={(v) => setSelectedFacultyId(v === "__none__" ? "" : v)}>
              <Select.Trigger aria-label="Faculty" className="w-full">
                <Select.Value placeholder="Select faculty" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="__none__">Select faculty</Select.Item>
                {faculties.map((f) => (
                  <Select.Item key={f.id} value={f.id}>
                    {f.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        )}
        {academicYearId && (
          <Button type="button" onClick={() => setAddModalOpen(true)}>
            Add load
          </Button>
        )}
      </div>

      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
      >
        {/* Grid: 3 cols (3 : 6 : 3); center has 2 rows (title + content) */}
        <div
          className="flex-1 min-h-0 grid border border-border rounded bg-surface"
          style={{ gridTemplateColumns: "minmax(18rem, 2fr) minmax(0, 5fr) minmax(0, 5fr)", gridTemplateRows: "1fr" }}
        >
          <aside className="flex flex-col border-r border-border p-3 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <CurriculumSubjectTree />
            </div>
          </aside>

          {/* Center: 2 rows — title row + schedule content row; padding matches left/right panes */}
          <main className="min-h-0 overflow-hidden flex flex-col p-3" style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div className="shrink-0 mb-2">
              {viewMode === "class" && <h2 className="text-sm font-semibold text-foreground mb-2">Class schedule</h2>}
              {viewMode === "faculty" && <h2 className="text-sm font-semibold text-foreground mb-2">Faculty schedule</h2>}
            </div>
            <div className="min-h-0 flex flex-col overflow-hidden w-full min-w-[800px]">
              {loading ? (
                <div className="flex-1 flex items-center justify-center rounded border border-border bg-surface" aria-busy="true">
                  <Spinner />
                </div>
              ) : !showGrid ? (
                <div className="flex-1 flex items-center justify-center rounded border border-border bg-surface p-8 text-center">
                  <p className="text-foreground-muted">
                    {viewMode === "class" ? "Select a student class to view or build its schedule." : "Select a faculty to view their schedule."}
                  </p>
                </div>
              ) : (
                <div className="shrink-0 h-[28rem] w-full overflow-x-auto overflow-y-hidden relative">
                  <div className="relative min-w-[800px] w-full inline-block">
                    <ScheduleGrid
                      loads={loads}
                      wrapInScroll={false}
                      selectedLoadId={editingLoadId}
                      hourEnd={scheduleHourEnd}
                      onLoadClick={(load) => {
                        setEditingLoadId(load.id);
                        setPendingAssignment(null);
                      }}
                      onLoadMove={academicYearId ? handleLoadMove : undefined}
                      onLoadResize={academicYearId ? handleLoadResize : undefined}
                    />
                    <ScheduleSlotOverlay
                      active={isDragging}
                      activeDragItem={activeDragItem}
                      overSlotId={overSlotId}
                      hourEnd={scheduleHourEnd}
                      pendingAssignment={(() => {
                        if (
                          pendingAssignment?.dayOfWeek == null ||
                          pendingAssignment?.startTime == null ||
                          pendingAssignment?.endTime == null
                        )
                          return null;
                        const block: PendingAssignmentBlock = {
                          dayOfWeek: pendingAssignment.dayOfWeek,
                          startTime: pendingAssignment.startTime,
                          endTime: pendingAssignment.endTime,
                          subjectCode: pendingAssignment.subjectCode ?? "—",
                        };
                        if (pendingAssignment.subjectName) block.subjectName = pendingAssignment.subjectName;
                        return block;
                      })()}
                    />
                    {!showLateHours && (
                      <button
                        type="button"
                        onClick={() => setShowLateHours(true)}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded border border-border bg-surface text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface-muted focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label="Show hours after 6 PM"
                      >
                        + After 6 PM
                      </button>
                    )}
                    {showLateHours && (
                      <button
                        type="button"
                        onClick={() => setShowLateHours(false)}
                        className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded border border-border bg-surface text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface-muted focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                        aria-label="Hide hours after 6 PM"
                      >
                        − Hide after 6 PM
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Room availability: scrolls when content is long; main class table above has fixed height */}
              {academicYearId && (
                <div className="flex-1 min-h-0 flex flex-col border-t border-border pt-3 mt-3 overflow-hidden w-full">
                  <h3 className="text-sm font-semibold text-foreground mb-2 shrink-0">Room availability</h3>
                  <div className="flex flex-wrap items-center gap-3 mb-2 shrink-0">
                    <div className="min-w-[200px]">
                      <label className="sr-only">Room</label>
                      <Select.Root
                        value={selectedRoomId || "__none__"}
                        onValueChange={(v) => setSelectedRoomId(v === "__none__" ? "" : v)}
                      >
                        <Select.Trigger aria-label="Select room to preview" className="w-full">
                          <Select.Value placeholder="Select room" />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="__none__">Select room</Select.Item>
                          {rooms.map((r) => (
                            <Select.Item key={r.id} value={r.id}>
                              {r.name}
                              {r.isLab ? " (Lab)" : ""} — cap. {r.capacity}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Root>
                    </div>
                    {selectedRoomId && (
                      <span className="text-xs text-foreground-muted">
                        {rooms.find((r) => r.id === selectedRoomId)?.name} · same year &amp; semester as above
                      </span>
                    )}
                  </div>
                  {selectedRoomId && (
                    <div className="flex-1 min-h-0 w-full rounded border border-border bg-surface overflow-auto">
                      {roomLoadsLoading ? (
                        <div className="flex items-center justify-center py-12" aria-busy="true">
                          <Spinner />
                        </div>
                      ) : (
                        <ScheduleGrid
                          loads={roomLoads}
                          readOnly
                          wrapInScroll={false}
                          hourEnd={scheduleHourEnd}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          <aside className="flex flex-col border-l border-border p-3 min-h-0 overflow-hidden">
            <h2 className="text-sm font-semibold text-foreground mb-2 shrink-0">Assignment</h2>
            <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
              {!showAssignmentForm ? (
                <p className="text-sm text-foreground-muted">
                  Drop a subject from the left onto a time slot, or click &quot;Add load&quot; to add an entry. Click a block to edit or delete.
                </p>
              ) : academicYearId && (editingLoadId ? editingLoad : true) ? (
                <AssignmentForm
                  academicYearId={academicYearId}
                  semester={semester}
                  initialValues={assignmentInitialValues}
                  editingLoadId={editingLoadId ?? undefined}
                  onSaved={() => {
                    refreshLoads();
                    refreshRoomLoads();
                    clearAssignmentPanel();
                  }}
                  onCancel={clearAssignmentPanel}
                />
              ) : (
                <Spinner />
              )}
            </div>
          </aside>
        </div>

        {/* Custom drag preview: subject card (from curriculum) or load block (moving assignment) */}
        <DragOverlay dropAnimation={null}>
          {activeDragItem ? (
            <div
              className="flex items-center gap-1.5 rounded border border-primary bg-surface px-2 py-1 text-xs text-foreground shadow-md pointer-events-none max-w-[200px]"
              aria-hidden
            >
              <span className="font-medium truncate shrink-0">{activeDragItem.code}</span>
              <span className="truncate text-foreground-muted min-w-0">{activeDragItem.name}</span>
              {activeDragItem.isLab && <span className="text-foreground-muted shrink-0">(L)</span>}
            </div>
          ) : activeDragLoad ? (
            <div
              className="rounded border-2 border-primary bg-surface px-2 py-1.5 text-xs text-foreground shadow-lg pointer-events-none min-w-[120px] max-w-[200px]"
              aria-hidden
            >
              <div className="font-medium truncate">
                {[activeDragLoad.subject?.code ?? "—", activeDragLoad.room?.name].filter(Boolean).join(" · ")}
              </div>
              {activeDragLoad.faculty?.name && (
                <div className="truncate text-foreground-muted text-[10px]">
                  {activeDragLoad.faculty.name.split(/\s+/).length > 1
                    ? `${activeDragLoad.faculty.name.split(/\s+/)[0].charAt(0)}. ${activeDragLoad.faculty.name.split(/\s+/).pop()}`
                    : activeDragLoad.faculty.name}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {addModalOpen && academicYearId && (
        <AddFacultyLoadModal
          academicYearId={academicYearId}
          semester={semester}
          onClose={() => setAddModalOpen(false)}
          onSaved={() => {
            refreshLoads();
            refreshRoomLoads();
            setAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
