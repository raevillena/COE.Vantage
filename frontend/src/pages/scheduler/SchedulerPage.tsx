import { useCallback, useEffect, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { apiClient } from "../../api/apiClient";
import type {
  FacultyLoad,
  AcademicYear,
  UserListItem,
  StudentClass,
  Room,
  CopyFacultyLoadsSummary,
  AutoAssignSummary,
} from "../../types/api";
import { getApiErrorMessage } from "../../types/api";
import type { SubjectDragItem, LoadDragItem } from "../../components/scheduler/schedulerTypes";
import type { AssignmentFormValues } from "../../components/scheduler/AssignmentForm";
import { ScheduleGrid } from "../../components/scheduleGrid/ScheduleGrid";
import {
  CurriculumSubjectTree,
  type CurriculumSubjectTreeProps,
} from "../../components/scheduler/CurriculumSubjectTree";
import {
  ScheduleSlotOverlay,
  parseSlotId,
  slotStartTime,
  type PendingAssignmentBlock,
} from "../../components/scheduler/ScheduleSlotOverlay";
import { AvailabilityOverlay } from "../../components/scheduler/AvailabilityOverlay";
import { AssignmentForm } from "../../components/scheduler/AssignmentForm";
import { AddFacultyLoadModal } from "../../components/addFacultyLoadModal/AddFacultyLoadModal";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { Dialog } from "../../components/ui/dialog";
import toast from "react-hot-toast";
import {
  timeToMinutes,
  minutesToTimeString,
  SLOT_HEIGHT,
} from "../../components/scheduler/scheduleGridConstants";
import { LoadBlockPreview } from "../../components/scheduleGrid/ScheduleGrid";
import { useSchedulePalette, type SchedulePaletteId } from "../../context/SchedulePaletteContext";

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

interface MoveConflictState {
  load: FacultyLoad;
  targetDayOfWeek: number;
  targetStartTime: string;
  targetEndTime: string;
  facultyConflict: boolean;
  roomConflict: boolean;
}

const SUGGESTION_HOUR_START = 7;
const SUGGESTION_HOUR_END = 18;
const SUGGESTION_SLOT_MINUTES = 60;

function isIntervalFree(
  dayOfWeek: number,
  startMinutes: number,
  endMinutes: number,
  classLoads: FacultyLoad[],
  facultyLoads: FacultyLoad[],
  roomLoads: FacultyLoad[]
): boolean {
  const overlaps = (load: FacultyLoad) => {
    if (load.dayOfWeek !== dayOfWeek) return false;
    const loadStart = timeToMinutes(load.startTime);
    const loadEnd = timeToMinutes(load.endTime);
    return loadEnd > startMinutes && loadStart < endMinutes;
  };
  return (
    !classLoads.some(overlaps) &&
    !facultyLoads.some(overlaps) &&
    !roomLoads.some(overlaps)
  );
}

function suggestFirstFreeSlot(
  classLoads: FacultyLoad[],
  facultyLoads: FacultyLoad[],
  roomLoads: FacultyLoad[]
): { dayOfWeek: number; startTime: string; endTime: string } | null {
  const stepMinutes = 15;
  const duration = SUGGESTION_SLOT_MINUTES;
  const days: number[] = [1, 2, 3, 4, 5, 6];

  for (const day of days) {
    for (
      let start = SUGGESTION_HOUR_START * 60;
      start + duration <= SUGGESTION_HOUR_END * 60;
      start += stepMinutes
    ) {
      const end = start + duration;
      if (isIntervalFree(day, start, end, classLoads, facultyLoads, roomLoads)) {
        return {
          dayOfWeek: day,
          startTime: minutesToTimeString(start),
          endTime: minutesToTimeString(end),
        };
      }
    }
  }
  return null;
}

function slotConflictsWithLoads(
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  classLoads: FacultyLoad[],
  facultyLoads: FacultyLoad[],
  roomLoads: FacultyLoad[]
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (!start || !end || end <= start) return true;
  return !isIntervalFree(dayOfWeek, start, end, classLoads, facultyLoads, roomLoads);
}

function SchedulePaletteSelect() {
  const { paletteId, palettes, setPaletteId } = useSchedulePalette();
  return (
    <Select.Root value={paletteId} onValueChange={(v) => setPaletteId(v as SchedulePaletteId)}>
      <Select.Trigger aria-label="Block color palette" className="w-[120px]">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {palettes.map((p) => (
          <Select.Item key={p.id} value={p.id}>
            {p.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
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
  const [overlayFacultyId, setOverlayFacultyId] = useState("");
  const [overlayRoomId, setOverlayRoomId] = useState("");
  const [overlayFacultyLoads, setOverlayFacultyLoads] = useState<FacultyLoad[]>([]);
  const [overlayFacultyLoading, setOverlayFacultyLoading] = useState(false);
  const [overlayRoomLoads, setOverlayRoomLoads] = useState<FacultyLoad[]>([]);
  const [overlayClassId, setOverlayClassId] = useState("");
  const [overlayClassLoads, setOverlayClassLoads] = useState<FacultyLoad[]>([]);
  const [pendingAssignmentDragged, setPendingAssignmentDragged] = useState(false);
  const [resizingLoadId, setResizingLoadId] = useState<string | null>(null);
  const [moveConflict, setMoveConflict] = useState<MoveConflictState | null>(null);
  const [autoScheduling, setAutoScheduling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySourceAcademicYearId, setCopySourceAcademicYearId] = useState("");
  const [copySourceSemester, setCopySourceSemester] = useState(1);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copySummary, setCopySummary] = useState<CopyFacultyLoadsSummary | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [autoSummaryDialogOpen, setAutoSummaryDialogOpen] = useState(false);
  const [autoSummary, setAutoSummary] = useState<AutoAssignSummary | null>(null);

  const currentClass =
    viewMode === "class" && studentClassId
      ? studentClasses.find((c) => c.id === studentClassId)
      : undefined;
  const currentCurriculumId = currentClass?.curriculumId ?? "";
  const currentYearLevel = currentClass?.yearLevel ?? undefined;

  const currentAcademicYear = academicYears.find((y) => y.id === academicYearId);
  const previousAcademicYears = academicYears.filter((y) => y.id !== academicYearId);

  // In faculty view, keep overlay faculty in sync with the selected faculty so pending blocks
  // and the faculty preview table work the same way as in class view.
  useEffect(() => {
    if (viewMode === "faculty") {
      setOverlayFacultyId(selectedFacultyId || "");
    }
  }, [viewMode, selectedFacultyId]);

  // When switching back to class view, clear any class overlay id/loads so only faculty/room
  // overlays are shown in that mode.
  useEffect(() => {
    if (viewMode === "class") {
      setOverlayClassId("");
      setOverlayClassLoads([]);
    }
  }, [viewMode]);

  // When switching view mode or changing class, reset side previews so they don't show stale schedules.
  useEffect(() => {
    setOverlayFacultyId("");
    setOverlayRoomId("");
    setOverlayFacultyLoads([]);
    setOverlayRoomLoads([]);
    setSelectedRoomId("");
  }, [viewMode, studentClassId]);

  const handleAutoSchedule = async () => {
    if (!academicYearId || !studentClassId) return;
    setAutoScheduling(true);
    setAutoSummary(null);
    try {
      const { data } = await apiClient.post<AutoAssignSummary>("/faculty-loads/auto-assign", {
        academicYearId,
        semester,
        studentClassId,
      });
      await Promise.all([refreshLoads(), refreshRoomLoads()]);
      setAutoSummary(data);
      setAutoSummaryDialogOpen(true);
      const assignedCount = data.assigned.length;
      const skippedCount = data.skipped.length;
      toast.success(
        assignedCount || skippedCount
          ? `Assigned ${assignedCount} block${assignedCount === 1 ? "" : "s"}${skippedCount ? `, ${skippedCount} skipped.` : "."}`
          : "No new blocks assigned (all remaining subjects could not be scheduled)."
      );
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Auto-schedule failed"));
    } finally {
      setAutoScheduling(false);
    }
  };

  const handleResetSchedule = async () => {
    if (!academicYearId || !studentClassId) return;
    const confirmed = window.confirm("This will remove all loads for this class in the selected academic year and semester. Continue?");
    if (!confirmed) return;
    setResetting(true);
    try {
      await apiClient.post("/faculty-loads/reset", {
        academicYearId,
        semester,
        studentClassId,
      });
      await Promise.all([refreshLoads(), refreshRoomLoads()]);
      toast.success("Schedule reset for this class");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Reset failed"));
    } finally {
      setResetting(false);
    }
  };

  const handleOpenCopyDialog = () => {
    if (!academicYearId || !studentClassId || previousAcademicYears.length === 0) return;
    const defaultSourceAy = previousAcademicYears[0]?.id ?? "";
    setCopySourceAcademicYearId(defaultSourceAy);
    setCopySourceSemester(semester);
    setCopySummary(null);
    setCopyError(null);
    setCopyDialogOpen(true);
  };

  const handleCopySchedule = async () => {
    if (!academicYearId || !studentClassId || !copySourceAcademicYearId) return;
    setCopyLoading(true);
    setCopyError(null);
    try {
      const { data } = await apiClient.post<CopyFacultyLoadsSummary>(
        "/faculty-loads/copy-from-previous",
        {
          studentClassId,
          sourceAcademicYearId: copySourceAcademicYearId,
          sourceSemester: copySourceSemester,
          targetAcademicYearId: academicYearId,
          targetSemester: semester,
        }
      );
      setCopySummary(data);
      await Promise.all([refreshLoads(), refreshRoomLoads()]);
      const copiedCount = data.copied.length;
      const skippedCount = data.skipped.length;
      toast.success(
        copiedCount || skippedCount
          ? `Copied ${copiedCount} block${copiedCount === 1 ? "" : "s"}, skipped ${skippedCount}.`
          : "No blocks were copied from the selected term."
      );
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Copy schedule failed");
      setCopyError(msg);
      toast.error(msg);
    } finally {
      setCopyLoading(false);
    }
  };

  /** Require 8px movement before starting a drag so clicks on blocks are treated as clicks, not drags. */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    apiClient.get<AcademicYear[]>("/academic-years/for-schedules").then(({ data }) => {
      setAcademicYears(data);
      if (data.length >= 1) {
        const active = data.find((y) => y.isActive);
        setAcademicYearId(active?.id ?? data[0].id);
      }
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
    const activeId = typeof active.id === "string" ? active.id : "";
    if (data?.type === "load" && activeId.startsWith("main-load-")) {
      const load = data.load;
      // Preserve original duration when moving; snap start to 15-min slot
      const startTime = slotStartTime(slot);
      const durationMinutes = Math.max(
        15,
        timeToMinutes(load.endTime) - timeToMinutes(load.startTime)
      );
      const endTime = minutesToTimeString(
        timeToMinutes(startTime) + durationMinutes
      );
      // If the target slot is busy according to current overlays (ignoring this load itself),
      // show a conflict prompt instead of moving immediately.
      const intervalOverlaps = (startA: string, endA: string, startB: string, endB: string) => {
        const aStart = timeToMinutes(startA);
        const aEnd = timeToMinutes(endA);
        const bStart = timeToMinutes(startB);
        const bEnd = timeToMinutes(endB);
        return aStart < bEnd && aEnd > bStart;
      };
      const facultyConflict =
        overlayFacultyId &&
        load.facultyId &&
        overlayFacultyId === load.facultyId &&
        overlayFacultyLoads.some(
          (l) =>
            l.id !== load.id &&
            l.dayOfWeek === slot.dayOfWeek &&
            intervalOverlaps(startTime, endTime, l.startTime, l.endTime)
        );
      const roomConflict =
        overlayRoomId &&
        load.roomId &&
        overlayRoomId === load.roomId &&
        overlayRoomLoads.some(
          (l) =>
            l.id !== load.id &&
            l.dayOfWeek === slot.dayOfWeek &&
            intervalOverlaps(startTime, endTime, l.startTime, l.endTime)
        );
      if (facultyConflict || roomConflict) {
        setMoveConflict({
          load,
          targetDayOfWeek: slot.dayOfWeek,
          targetStartTime: startTime,
          targetEndTime: endTime,
          facultyConflict: Boolean(facultyConflict),
          roomConflict: Boolean(roomConflict),
        });
        return;
      }
      const updated = {
        ...load,
        dayOfWeek: slot.dayOfWeek,
        startTime,
        endTime,
      };
      setLoads((prev) => prev.map((l) => (l.id === load.id ? updated : l)));
      setRoomLoads((prev) => prev.map((l) => (l.id === load.id ? updated : l)));
      if (load.id === editingLoadId) {
        setEditingLoad((prev) => (prev ? { ...prev, ...updated } : null));
      }
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
          toast.success("Assignment moved");
          refreshOverlayForLoad(updated);
        })
        .catch((err) => {
          toast.error(getApiErrorMessage(err, "Move failed"));
          refreshLoads();
          refreshRoomLoads();
          if (load.id === editingLoadId) {
            setEditingLoad(null);
            setEditingLoadId(null);
          }
        });
      return;
    }

    if (data?.type !== "subject") return;
    // New assignment: start with no fixed day/time so we don't place a default block on the grid.
    // User will pick faculty/room and choose a time (with overlays showing busy slots) before saving.
    setPendingAssignment({
      subjectId: data.subjectId,
      subjectCode: data.code,
      subjectName: data.name,
      studentClassId: viewMode === "class" ? studentClassId : overlayClassId || undefined,
    });
    setPendingAssignmentDragged(false);
    setEditingLoadId(null);
    // In faculty view, keep the overlay faculty tied to the selected faculty so
    // suggestions and pending block behave like in class view.
    setOverlayFacultyId(viewMode === "faculty" ? selectedFacultyId : "");
    setOverlayRoomId("");
  };

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    const data = event.active.data.current as SubjectDragItem | LoadDragItem | undefined;
    const activeId = typeof event.active.id === "string" ? event.active.id : "";
    if (data?.type === "subject") {
      setActiveDragItem(data);
      setActiveDragLoad(null);
    } else if (data?.type === "load" && activeId.startsWith("main-load-")) {
      setActiveDragLoad(data.load);
      setActiveDragItem(null);
      // While dragging an existing load, show availability overlay for that load's faculty/room
      // so the user can see busy slots while moving it.
      setOverlayFacultyId(data.load.facultyId ?? "");
      setOverlayRoomId(data.load.roomId ?? "");
    } else {
      setActiveDragItem(null);
      setActiveDragLoad(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const id = event.over?.id;
    if (typeof id === "string" && /^slot-\d+-\d+(-\d+)?$/.test(id)) setOverSlotId(id);
    else setOverSlotId(null);
  };

  const handleDragCancel = () => {
    setIsDragging(false);
    setActiveDragItem(null);
    setActiveDragLoad(null);
    setOverSlotId(null);
  };

  const refreshOverlayForLoad = useCallback(
    (load: FacultyLoad) => {
      if (overlayFacultyId && load.facultyId && overlayFacultyId === load.facultyId) {
        setOverlayFacultyLoads((prev) => {
          const exists = prev.some((l) => l.id === load.id);
          if (exists) {
            return prev.map((l) => (l.id === load.id ? load : l));
          }
          return [...prev, load];
        });
      }
      if (overlayRoomId && load.roomId && overlayRoomId === load.roomId) {
        setOverlayRoomLoads((prev) => {
          const exists = prev.some((l) => l.id === load.id);
          if (exists) {
            return prev.map((l) => (l.id === load.id ? load : l));
          }
          return [...prev, load];
        });
      }
    },
    [overlayFacultyId, overlayRoomId]
  );

  const handleResolveFacultyConflict = useCallback(
    async (newFacultyId: string) => {
      if (!moveConflict || !academicYearId) return;
      const { load, targetDayOfWeek, targetStartTime, targetEndTime } = moveConflict;
      try {
        await apiClient.patch(`/faculty-loads/${load.id}`, {
          facultyId: newFacultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: load.roomId,
          dayOfWeek: targetDayOfWeek,
          startTime: targetStartTime,
          endTime: targetEndTime,
          semester,
          academicYearId,
        });
        toast.success("Faculty updated");
        setMoveConflict(null);
        refreshLoads();
        refreshRoomLoads();
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Update failed"));
      }
    },
    [moveConflict, academicYearId, semester, refreshLoads, refreshRoomLoads]
  );

  const handleResolveRoomConflict = useCallback(
    async (newRoomId: string) => {
      if (!moveConflict || !academicYearId) return;
      const { load, targetDayOfWeek, targetStartTime, targetEndTime } = moveConflict;
      try {
        await apiClient.patch(`/faculty-loads/${load.id}`, {
          facultyId: load.facultyId,
          subjectId: load.subjectId,
          studentClassId: load.studentClassId,
          roomId: newRoomId,
          dayOfWeek: targetDayOfWeek,
          startTime: targetStartTime,
          endTime: targetEndTime,
          semester,
          academicYearId,
        });
        toast.success("Room updated");
        setMoveConflict(null);
        refreshLoads();
        refreshRoomLoads();
      } catch (err) {
        toast.error(getApiErrorMessage(err, "Update failed"));
      }
    },
    [moveConflict, academicYearId, semester, refreshLoads, refreshRoomLoads]
  );

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
          refreshOverlayForLoad({ ...load, ...payload });
          setEditingLoadId(null);
          toast.success("Assignment moved");
        })
        .catch((err) => toast.error(getApiErrorMessage(err, "Move failed")));
    },
    [academicYearId, semester, refreshLoads, refreshRoomLoads, refreshOverlayForLoad]
  );

  const handleLoadResize = useCallback(
    (load: FacultyLoad, payload: { startTime: string; endTime: string }) => {
      const updated = { ...load, startTime: payload.startTime, endTime: payload.endTime };
      setLoads((prev) =>
        prev.map((l) => (l.id === load.id ? updated : l))
      );
      setRoomLoads((prev) =>
        prev.map((l) => (l.id === load.id ? updated : l))
      );
      if (overlayFacultyId && load.facultyId && overlayFacultyId === load.facultyId) {
        setOverlayFacultyLoads((prev) => {
          const exists = prev.some((l) => l.id === load.id);
          if (exists) {
            return prev.map((l) => (l.id === load.id ? updated : l));
          }
          return [...prev, updated];
        });
      }
      if (overlayClassId && load.studentClassId && overlayClassId === load.studentClassId) {
        setOverlayClassLoads((prev) => {
          const exists = prev.some((l) => l.id === load.id);
          if (exists) {
            return prev.map((l) => (l.id === load.id ? updated : l));
          }
          return [...prev, updated];
        });
      }
      if (load.id === editingLoadId) {
        setEditingLoad((prev) =>
          prev ? { ...prev, startTime: payload.startTime, endTime: payload.endTime } : null
        );
      }
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
          toast.success("Time updated");
          refreshOverlayForLoad(updated);
        })
        .catch((err) => {
          toast.error(getApiErrorMessage(err, "Resize failed"));
          refreshLoads();
          refreshRoomLoads();
        });
    },
    [academicYearId, semester, editingLoadId, overlayFacultyId, overlayClassId, refreshLoads, refreshRoomLoads, refreshOverlayForLoad]
  );

  const showAssignmentForm = pendingAssignment !== null || editingLoadId !== null;
  let assignmentInitialValues: Partial<AssignmentFormValues> = editingLoad
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

  if (viewMode === "faculty" && selectedFacultyId) {
    assignmentInitialValues = {
      ...assignmentInitialValues,
      facultyId: selectedFacultyId,
    };
  }

  const clearAssignmentPanel = () => {
    setPendingAssignment(null);
    setPendingAssignmentDragged(false);
    setEditingLoadId(null);
    setMoveConflict(null);
  };

  useEffect(() => {
    if (!overlayFacultyId || !academicYearId) {
      setOverlayFacultyLoads([]);
      setOverlayFacultyLoading(false);
      return;
    }
    setOverlayFacultyLoading(true);
    const params = new URLSearchParams({ academicYearId, semester: String(semester), facultyId: overlayFacultyId });
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setOverlayFacultyLoads(data))
      .catch(() => setOverlayFacultyLoads([]))
      .finally(() => setOverlayFacultyLoading(false));
  }, [academicYearId, semester, overlayFacultyId]);

  useEffect(() => {
    if (!overlayRoomId || !academicYearId) {
      setOverlayRoomLoads([]);
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), roomId: overlayRoomId });
    apiClient.get<FacultyLoad[]>(`/faculty-loads?${params}`).then(({ data }) => setOverlayRoomLoads(data)).catch(() => setOverlayRoomLoads([]));
  }, [academicYearId, semester, overlayRoomId]);

  useEffect(() => {
    if (!overlayClassId || !academicYearId) {
      setOverlayClassLoads([]);
      return;
    }
    const params = new URLSearchParams({ academicYearId, semester: String(semester), studentClassId: overlayClassId });
    apiClient
      .get<FacultyLoad[]>(`/faculty-loads?${params}`)
      .then(({ data }) => setOverlayClassLoads(data))
      .catch(() => setOverlayClassLoads([]));
  }, [academicYearId, semester, overlayClassId]);

  // When adding a new assignment and a faculty has been selected, suggest the first free 1-hour slot
  // that works for the current class (in class view) and the selected faculty. This sets day/time so
  // the pending block becomes visible on the grid.
  useEffect(() => {
    if (!pendingAssignment) return;
    if (pendingAssignment.dayOfWeek != null && pendingAssignment.startTime && pendingAssignment.endTime) return;
    if (pendingAssignmentDragged) return;
    if (!overlayFacultyId) return;

    let classLoadsForSuggestion: FacultyLoad[] = [];
    const effectiveClassId =
      viewMode === "class" ? studentClassId : pendingAssignment.studentClassId ?? studentClassId;
    if (effectiveClassId) {
      classLoadsForSuggestion = loads.filter((l) => l.studentClassId === effectiveClassId);
    }

    const suggestion = suggestFirstFreeSlot(
      classLoadsForSuggestion,
      overlayFacultyLoads,
      [] // no room constraint yet
    );
    if (!suggestion) return;

    setPendingAssignment((prev) => {
      if (!prev) return prev;
      if (prev.dayOfWeek != null && prev.startTime && prev.endTime) return prev;
      if (prev.subjectId !== pendingAssignment.subjectId) return prev;
      return {
        ...prev,
        dayOfWeek: suggestion.dayOfWeek,
        startTime: suggestion.startTime,
        endTime: suggestion.endTime,
      };
    });
  }, [pendingAssignment, pendingAssignmentDragged, overlayFacultyId, overlayFacultyLoads, viewMode, studentClassId, loads]);

  // When a room is selected, ensure the current suggested slot is also free for that room.
  // If not, search again including room loads and move the pending block to a fully free slot.
  useEffect(() => {
    if (!pendingAssignment) return;
    if (
      pendingAssignment.dayOfWeek == null ||
      !pendingAssignment.startTime ||
      !pendingAssignment.endTime
    )
      return;
    if (!overlayRoomId || overlayRoomLoads.length === 0) return;
    if (pendingAssignmentDragged) return;

    let classLoadsForSuggestion: FacultyLoad[] = [];
    const effectiveClassId =
      viewMode === "class" ? studentClassId : pendingAssignment.studentClassId ?? studentClassId;
    if (effectiveClassId) {
      classLoadsForSuggestion = loads.filter((l) => l.studentClassId === effectiveClassId);
    }

    const conflicts = slotConflictsWithLoads(
      pendingAssignment.dayOfWeek,
      pendingAssignment.startTime,
      pendingAssignment.endTime,
      classLoadsForSuggestion,
      overlayFacultyLoads,
      overlayRoomLoads
    );
    if (!conflicts) return;

    const suggestion = suggestFirstFreeSlot(
      classLoadsForSuggestion,
      overlayFacultyLoads,
      overlayRoomLoads
    );
    if (!suggestion) return;

    setPendingAssignment((prev) => {
      if (!prev) return prev;
      if (
        prev.dayOfWeek !== pendingAssignment.dayOfWeek ||
        prev.startTime !== pendingAssignment.startTime ||
        prev.endTime !== pendingAssignment.endTime
      ) {
        return prev;
      }
      return {
        ...prev,
        dayOfWeek: suggestion.dayOfWeek,
        startTime: suggestion.startTime,
        endTime: suggestion.endTime,
      };
    });
  }, [pendingAssignment, pendingAssignmentDragged, overlayRoomId, overlayRoomLoads, overlayFacultyLoads, viewMode, studentClassId, loads]);

  const showGrid = academicYearId && (viewMode === "class" ? studentClassId : viewMode === "faculty" ? selectedFacultyId : false);

  const SCHEDULE_HOUR_END_DEFAULT = 18;
  const SCHEDULE_HOUR_END_FULL = 21;
  const scheduleHourEnd = showLateHours ? SCHEDULE_HOUR_END_FULL : SCHEDULE_HOUR_END_DEFAULT;

  return (
    <div className="flex flex-col min-h-[400px] h-auto overflow-y-auto">
      <h1 className="text-2xl font-semibold text-foreground mb-4 shrink-0">Scheduler</h1>
      <div className="mb-4 flex flex-col gap-3 shrink-0 w-full 2xl:flex-row 2xl:items-end 2xl:justify-between">
        {/* Filters group */}
        <div className="flex flex-wrap items-end justify-center gap-3 2xl:justify-start">
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
                    {y.isActive ? `${y.name} (current)` : y.name}
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
                <Select.Item value="1">1st Sem</Select.Item>
                <Select.Item value="2">2nd Sem</Select.Item>
                <Select.Item value="3">Mid Year</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-sm font-medium text-foreground">View</label>
            <Select.Root value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <Select.Trigger aria-label="View mode" className="w-full">
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
        </div>

        {/* Actions group */}
        <div className="flex flex-wrap items-end gap-2 w-full justify-center 2xl:w-auto 2xl:justify-end">
          {viewMode === "class" && academicYearId && studentClassId && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={handleAutoSchedule}
                disabled={autoScheduling}
                className="flex items-center gap-1.5 px-2 sm:px-3 text-xs sm:text-sm"
                title="Auto-schedule remaining subjects for this class"
              >
                <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center">
                  {/* clock icon */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="7" />
                    <path d="M12 9v4l2 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="hidden sm:inline">
                  {autoScheduling ? "Auto-scheduling…" : "Auto-schedule"}
                </span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleOpenCopyDialog}
                disabled={previousAcademicYears.length === 0 || copyLoading}
                className="flex items-center gap-1.5 px-2 sm:px-3 text-xs sm:text-sm"
                title="Copy schedule from a previous term"
              >
                <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center">
                  {/* copy icon */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="9" width="11" height="11" rx="1.5" />
                    <rect x="4" y="4" width="11" height="11" rx="1.5" />
                  </svg>
                </span>
                <span className="hidden sm:inline">
                  {copyLoading ? "Copying…" : "Copy previous"}
                </span>
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleResetSchedule}
                disabled={resetting}
                className="flex items-center gap-1.5 px-2 sm:px-3 text-xs sm:text-sm"
                title="Remove all loads for this class in the selected term"
              >
                <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center">
                  {/* reset icon */}
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path
                      d="M4 4v6h6M20 20v-6h-6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.5 17.5A7 7 0 0 0 18 12M17.5 6.5A7 7 0 0 0 6 12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="hidden sm:inline">
                  {resetting ? "Resetting…" : "Reset"}
                </span>
              </Button>
            </>
          )}
          {academicYearId && (
            <Button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="flex items-center gap-1.5 px-2 sm:px-3 text-xs sm:text-sm"
              title="Add a new faculty load"
            >
              <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center">
                {/* plus icon */}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
              <span className="hidden sm:inline">Add load</span>
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground-muted">Block colors</span>
            <SchedulePaletteSelect />
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
      >
        {/* <1280px: single column — main panel, then curriculum, then assignment.
            1280–1535px (xl): 2-column grid (3:9) with main spanning both columns on first row; side panes below.
            >=1536px (2xl): 3-column layout (curriculum | main | assignment). */}
        <div
          className="flex-1 min-h-0 grid grid-cols-1 xl:[grid-template-columns:3fr_9fr] 2xl:[grid-template-columns:minmax(18rem,2fr)_minmax(0,5fr)_minmax(0,5fr)] xl:[grid-auto-rows:auto] border border-border rounded bg-surface"
        >
          <aside className="order-2 xl:order-none 2xl:order-none flex flex-col border-r-0 2xl:border-r border-border border-b 2xl:border-b-0 p-3 min-h-[260px] max-h-[37rem] overflow-hidden xl:[grid-column:1] xl:[grid-row:1] 2xl:[grid-column:1] 2xl:[grid-row:1]">
            <div className="flex-1 min-h-0 overflow-auto">
              <CurriculumSubjectTree
                {...({
                  curriculumId: viewMode === "class" ? currentCurriculumId ?? undefined : undefined,
                  yearLevel: viewMode === "class" ? currentYearLevel : undefined,
                  semester: viewMode === "class" ? semester : undefined,
                  classLoads: viewMode === "class" ? loads : undefined,
                } satisfies CurriculumSubjectTreeProps)}
              />
            </div>
          </aside>

          {/* Center: 2 rows — title row + schedule content row.
              Base/xl: first row, full width (xl: spans both columns in 3:9 grid); 2xl: middle column. */}
          <main
            className="order-1 xl:order-none 2xl:order-none xl:col-span-1 2xl:col-span-1 min-h-0 overflow-hidden flex flex-col p-3 min-h-[50vh] 2xl:min-h-0 xl:[grid-column:2] xl:[grid-row:1] 2xl:[grid-column:2] 2xl:[grid-row:1]"
            style={{ display: "grid", gridTemplateRows: "auto 1fr" }}
          >
            <div className="shrink-0 mb-2">
              {viewMode === "class" && <h2 className="text-sm font-semibold text-foreground mb-2">Class schedule</h2>}
              {viewMode === "faculty" && <h2 className="text-sm font-semibold text-foreground mb-2">Faculty schedule</h2>}
            </div>
            <div className="min-h-0 flex flex-col overflow-hidden w-full min-w-0 overflow-x-auto">
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
                <div className="shrink-0 min-h-0 w-full overflow-auto relative" style={{ maxHeight: "42rem" }}>
                  <div className="relative min-w-[600px] md:min-w-[800px] w-full">
                    <ScheduleGrid
                      loads={loads}
                      wrapInScroll={false}
                      selectedLoadId={editingLoadId}
                      hourEnd={scheduleHourEnd}
                      draggableIdPrefix="main"
                      onLoadClick={(load) => {
                        setEditingLoadId(load.id);
                        setPendingAssignment(null);
                        // Sync side panels: faculty + room preview should follow the clicked block.
                        setOverlayFacultyId(load.facultyId ?? "");
                        setOverlayRoomId(load.roomId ?? "");
                        if (load.roomId) setSelectedRoomId(load.roomId);
                      }}
                      onLoadMove={academicYearId ? handleLoadMove : undefined}
                      onLoadResize={academicYearId ? handleLoadResize : undefined}
                      onLoadResizeStart={(load) => {
                        setResizingLoadId(load.id);
                        setOverlayFacultyId(load.facultyId ?? "");
                        setOverlayRoomId(load.roomId ?? "");
                      }}
                      onLoadResizeEnd={() => {
                        setResizingLoadId(null);
                      }}
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
                      onPendingMove={(payload) => {
                        setPendingAssignment((prev) => (prev ? { ...prev, ...payload } : prev));
                        setPendingAssignmentDragged(true);
                      }}
                    />
                    {(pendingAssignment !== null || activeDragLoad || resizingLoadId) &&
                      (overlayFacultyId || overlayRoomId || (viewMode === "faculty" && overlayClassId)) && (
                      <AvailabilityOverlay
                        facultyLoads={overlayFacultyLoads}
                        roomLoads={overlayRoomLoads}
                        classLoads={viewMode === "faculty" ? overlayClassLoads : []}
                        hourEnd={scheduleHourEnd}
                      />
                      )}
                    {moveConflict && (
                      <div className="absolute inset-0 z-30 flex items-start justify-center pointer-events-none">
                        <div className="mt-10 max-w-sm rounded-lg border border-border bg-surface shadow-lg p-3 text-xs text-foreground pointer-events-auto">
                          <div className="font-semibold mb-1">Cannot drop here</div>
                          <div className="mb-2">
                            This time conflicts with the{" "}
                            {moveConflict.facultyConflict && moveConflict.roomConflict
                              ? "faculty and room schedule"
                              : moveConflict.facultyConflict
                              ? "faculty schedule"
                              : "room schedule"}
                            .
                          </div>
                          <div className="mb-2 text-foreground-muted">
                            Day {moveConflict.targetDayOfWeek}, {moveConflict.targetStartTime}–
                            {moveConflict.targetEndTime}
                          </div>
                          {moveConflict.facultyConflict && (
                            <div className="mb-2">
                              <label className="mb-1 block text-[11px] font-medium text-foreground">
                                Change faculty
                              </label>
                              <Select.Root
                                value="__none__"
                                onValueChange={(v) => {
                                  if (v === "__none__") return;
                                  handleResolveFacultyConflict(v);
                                }}
                              >
                                <Select.Trigger aria-label="New faculty" className="w-full">
                                  <Select.Value placeholder="Select new faculty" />
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
                          {moveConflict.roomConflict && (
                            <div className="mb-2">
                              <label className="mb-1 block text-[11px] font-medium text-foreground">
                                Change room
                              </label>
                              <Select.Root
                                value="__none__"
                                onValueChange={(v) => {
                                  if (v === "__none__") return;
                                  handleResolveRoomConflict(v);
                                }}
                              >
                                <Select.Trigger aria-label="New room" className="w-full">
                                  <Select.Value placeholder="Select new room" />
                                </Select.Trigger>
                                <Select.Content>
                                  <Select.Item value="__none__">Select room</Select.Item>
                                  {rooms.map((r) => (
                                    <Select.Item key={r.id} value={r.id}>
                                      {r.name}
                                    </Select.Item>
                                  ))}
                                </Select.Content>
                              </Select.Root>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Button type="button" variant="secondary" onClick={() => setMoveConflict(null)}>
                              Close
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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
            </div>
          </main>

          <aside className="order-3 xl:order-none 2xl:order-none xl:col-span-2 2xl:col-span-1 flex flex-col border-l-0 2xl:border-l border-border border-t 2xl:border-t-0 p-3 min-h-0 overflow-hidden max-h-[35vh] 2xl:max-h-none xl:[grid-column:1/3] xl:[grid-row:2] 2xl:[grid-column:3] 2xl:[grid-row:1]">
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
                  formKey={editingLoadId ?? pendingAssignment?.subjectId ?? ""}
                  initialValuesReady={editingLoadId ? editingLoad?.id === editingLoadId : true}
                  editingLoadId={editingLoadId ?? undefined}
                  liveTime={
                    !editingLoadId && pendingAssignment && pendingAssignment.dayOfWeek != null &&
                    pendingAssignment.startTime && pendingAssignment.endTime
                      ? {
                          dayOfWeek: pendingAssignment.dayOfWeek,
                          startTime: pendingAssignment.startTime,
                          endTime: pendingAssignment.endTime,
                        }
                      : undefined
                  }
                  facultyLoadsOverride={
                    editingLoad?.facultyId
                      ? loads.filter((l) => l.facultyId === editingLoad.facultyId)
                      : undefined
                  }
                  showFacultySchedulePreview={false}
                  lockFaculty={viewMode === "faculty"}
                  lockStudentClass={viewMode === "class"}
                  onFacultyIdChange={(id) => {
                    setOverlayFacultyId(id);
                  }}
                  onStudentClassIdChange={(id) => {
                    if (viewMode === "faculty") {
                      setOverlayClassId(id);
                    }
                  }}
                  onRoomIdChange={(id) => {
                    setOverlayRoomId(id);
                  }}
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

          {/* Faculty + room availability row: full width, split into two cards on wide screens */}
          {academicYearId && (
            <section className="order-4 xl:order-none 2xl:order-none border-t border-border p-3 min-h-0 overflow-hidden xl:[grid-column:1/3] xl:[grid-row:3] 2xl:[grid-column:1/4] 2xl:[grid-row:2]">
              <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-2">
                {/* Room availability (left) */}
                <div className="flex flex-col min-h-0 rounded border border-border bg-surface p-3">
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
                  {selectedRoomId ? (
                    <div className="flex-1 min-h-0 w-full rounded border border-border bg-surface-muted/40 overflow-auto">
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
                          draggableIdPrefix="room"
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-muted">
                      Select a room to preview its schedule for this term.
                    </p>
                  )}
                </div>

                {/* Faculty schedule preview (right) */}
                <div className="flex flex-col min-h-0 rounded border border-border bg-surface p-3">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Faculty schedule</h3>
                  <div className="flex flex-wrap items-center gap-3 mb-2 shrink-0">
                    <div className="min-w-[200px]">
                      <label className="sr-only">Faculty</label>
                      <Select.Root
                        value={overlayFacultyId || "__none__"}
                        onValueChange={(v) => setOverlayFacultyId(v === "__none__" ? "" : v)}
                      >
                        <Select.Trigger aria-label="Select faculty to preview" className="w-full">
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
                  </div>
                  {overlayFacultyId ? (
                    <div className="flex-1 min-h-0 w-full rounded border border-border bg-surface-muted/40 overflow-auto">
                      {overlayFacultyLoading ? (
                        <div className="flex items-center justify-center py-12" aria-busy="true">
                          <Spinner />
                        </div>
                      ) : overlayFacultyLoads.length ? (
                        <ScheduleGrid
                          loads={overlayFacultyLoads}
                          readOnly
                          wrapInScroll={false}
                          hourEnd={scheduleHourEnd}
                          draggableIdPrefix="faculty-preview"
                        />
                      ) : (
                        <p className="px-3 py-2 text-xs text-foreground-muted">
                          No schedule found for the selected faculty in this term.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-muted">
                      Select a faculty to preview their weekly schedule here.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
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
            (() => {
              let dropTimeLabel: string | null = null;
              let timeRangeLabel: string | null = null;
              if (overSlotId) {
                const slot = parseSlotId(overSlotId);
                if (slot) {
                  const dropStartMins = timeToMinutes(slotStartTime(slot));
                  const durationMins = Math.max(15, timeToMinutes(activeDragLoad.endTime) - timeToMinutes(activeDragLoad.startTime));
                  const dropEndMins = dropStartMins + durationMins;
                  const format12 = (mins: number) => {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    const hour12 = h % 12 || 12;
                    const ampm = h < 12 ? "AM" : "PM";
                    return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
                  };
                  dropTimeLabel = `Drop at ${format12(dropStartMins)}`;
                  timeRangeLabel = `${format12(dropStartMins)} – ${format12(dropEndMins)}`;
                }
              }
              return (
                <div className="pointer-events-none flex flex-col items-center gap-1">
                  <LoadBlockPreview
                    load={activeDragLoad}
                    subjectIds={[...new Set(loads.map((l) => l.subjectId))]}
                    heightPx={Math.max(
                      20,
                      ((timeToMinutes(activeDragLoad.endTime) - timeToMinutes(activeDragLoad.startTime)) / 60) *
                        SLOT_HEIGHT -
                        2
                    )}
                    dropTimeLabel={dropTimeLabel}
                    timeRangeLabel={timeRangeLabel}
                  />
                  {dropTimeLabel && (
                    <span className="text-[10px] font-medium text-primary bg-primary/15 px-2 py-0.5 rounded">
                      {dropTimeLabel}
                    </span>
                  )}
                </div>
              );
            })()
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
      <Dialog.Root
        open={copyDialogOpen}
        onOpenChange={(open) => {
          setCopyDialogOpen(open);
          if (!open) {
            setCopySummary(null);
            setCopyError(null);
            setCopyLoading(false);
          }
        }}
      >
        <Dialog.Content
          title="Copy schedule from previous term"
          description="Copy this class schedule from a previous academic year and semester. Conflicting blocks will be skipped."
          className="!max-w-[min(60rem,95vw)] max-h-[90vh] overflow-hidden flex flex-col"
        >
          {!copySummary && (
            <div className="mt-3 space-y-3">
              <div className="text-sm text-foreground-muted">
                {currentClass && currentAcademicYear ? (
                  <>
                    Target: <span className="font-medium text-foreground">{currentClass.name}</span> ·{" "}
                    <span className="font-medium text-foreground">{currentAcademicYear.name}</span> ·{" "}
                    <span className="font-medium text-foreground">
                      {semester === 1 ? "1st Sem" : semester === 2 ? "2nd Sem" : "Mid Year"}
                    </span>
                  </>
                ) : (
                  "Select an academic year and class first."
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Source academic year</label>
                  <Select.Root
                    value={copySourceAcademicYearId || "__none__"}
                    onValueChange={(v) => setCopySourceAcademicYearId(v === "__none__" ? "" : v)}
                  >
                    <Select.Trigger aria-label="Source academic year" className="w-full">
                      <Select.Value placeholder="Select year" />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="__none__">Select year</Select.Item>
                      {previousAcademicYears.map((y) => (
                        <Select.Item key={y.id} value={y.id}>
                          {y.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Source semester</label>
                  <Select.Root
                    value={String(copySourceSemester)}
                    onValueChange={(v) => setCopySourceSemester(Number(v))}
                  >
                    <Select.Trigger aria-label="Source semester" className="w-full">
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      <Select.Item value="1">1st Sem</Select.Item>
                      <Select.Item value="2">2nd Sem</Select.Item>
                      <Select.Item value="3">Mid Year</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>
              {copyError && (
                <p className="text-sm text-danger">
                  {copyError}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary" disabled={copyLoading}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  type="button"
                  onClick={handleCopySchedule}
                  disabled={
                    copyLoading ||
                    !copySourceAcademicYearId ||
                    !academicYearId ||
                    !studentClassId ||
                    previousAcademicYears.length === 0
                  }
                >
                  {copyLoading ? "Copying…" : "Copy schedule"}
                </Button>
              </div>
            </div>
          )}
          {copySummary && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-foreground">
                Copied{" "}
                <span className="font-semibold">
                  {copySummary.copied.length}
                </span>{" "}
                block{copySummary.copied.length === 1 ? "" : "s"}, skipped{" "}
                <span className="font-semibold">
                  {copySummary.skipped.length}
                </span>
                .
              </p>
              {copySummary.copied.length > 0 && (
                <div className="border border-border rounded bg-surface-muted/40">
                  <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground">
                    Copied
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Subject</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Faculty</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Room</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Day</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {copySummary.copied.map((item, idx) => (
                          <tr key={`copied-${idx}`} className="border-t border-border">
                            <td className="px-2 py-1 text-foreground">
                              {item.subjectCode} · {item.subjectName}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.facultyName ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.roomName ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.dayOfWeek}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.startTime}–{item.endTime}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="border border-border rounded bg-surface-muted/40">
                <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground">
                  Skipped (conflicts or constraints)
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {copySummary.skipped.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-foreground-muted">
                      No blocks were skipped.
                    </p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Subject</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Faculty</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Room</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Day</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Time</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {copySummary.skipped.map((item, idx) => (
                          <tr key={`skipped-${idx}`} className="border-top border-border">
                            <td className="px-2 py-1 text-foreground">
                              {item.subjectCode} · {item.subjectName}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.facultyName ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.roomName ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.dayOfWeek}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.startTime}–{item.endTime}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Root>

      {/* Auto-schedule remaining: result summary popup */}
      <Dialog.Root
        open={autoSummaryDialogOpen}
        onOpenChange={(open) => {
          setAutoSummaryDialogOpen(open);
          if (!open) setAutoSummary(null);
        }}
      >
        <Dialog.Content
          title="Auto-schedule remaining — Summary"
          description="Blocks that were assigned and subjects that could not be fully scheduled."
          className="!max-w-[min(60rem,95vw)] max-h-[90vh] overflow-hidden flex flex-col"
        >
          {autoSummary && (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-foreground">
                Assigned{" "}
                <span className="font-semibold">{autoSummary.assigned.length}</span>{" "}
                block{autoSummary.assigned.length === 1 ? "" : "s"}, skipped{" "}
                <span className="font-semibold">{autoSummary.skipped.length}</span>{" "}
                subject{autoSummary.skipped.length === 1 ? "" : "s"}.
              </p>
              {autoSummary.assigned.length > 0 && (
                <div className="border border-border rounded bg-surface-muted/40">
                  <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground">
                    Assigned
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Subject</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Faculty</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Room</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Day</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoSummary.assigned.map((item, idx) => (
                          <tr key={`assigned-${idx}`} className="border-t border-border">
                            <td className="px-2 py-1 text-foreground">
                              {item.subjectCode} · {item.subjectName}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">{item.facultyName}</td>
                            <td className="px-2 py-1 text-foreground-muted">{item.roomName}</td>
                            <td className="px-2 py-1 text-foreground-muted">{item.dayOfWeek}</td>
                            <td className="px-2 py-1 text-foreground-muted">
                              {item.startTime}–{item.endTime}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="border border-border rounded bg-surface-muted/40">
                <div className="px-3 py-2 border-b border-border text-xs font-semibold text-foreground">
                  Skipped (could not be scheduled)
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {autoSummary.skipped.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-foreground-muted">No subjects skipped.</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="bg-surface-muted">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Subject</th>
                          <th className="px-2 py-1 text-left font-medium text-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autoSummary.skipped.map((item, idx) => (
                          <tr key={`skipped-${idx}`} className="border-t border-border">
                            <td className="px-2 py-1 text-foreground">
                              {item.subjectCode} · {item.subjectName}
                            </td>
                            <td className="px-2 py-1 text-foreground-muted">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
