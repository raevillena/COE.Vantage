import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import type { Room, Subject } from "../../types/api";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { HelpTip } from "../ui/helpTip";
import { useAppSelector } from "../../store/hooks";

interface SubjectRoomsDialogProps {
  /** The subject whose possible rooms are set; null keeps the dialog closed. */
  subject: Subject | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Possible rooms for auto-assign: pick the rooms a subject may be placed in (none = any available room). */
export function SubjectRoomsDialog({ subject, onClose, onSaved }: SubjectRoomsDialogProps) {
  const userDeptId = useAppSelector((st) => st.auth.user?.departmentId) ?? null;
  const [allRooms, setAllRooms] = useState<Room[]>([]);
  const [roomIds, setRoomIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!subject) return;
    let cancelled = false;
    setSearch("");
    setRoomIds(new Set((subject.subjectRooms ?? []).map((r) => r.roomId)));
    setLoading(true);
    apiClient
      .get<Room[]>("/rooms")
      .then(({ data }) => {
        if (!cancelled) setAllRooms(data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to load rooms");
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const save = async () => {
    if (!subject) return;
    setSaving(true);
    try {
      await apiClient.put(`/subjects/${subject.id}/rooms`, { roomIds: [...roomIds] });
      toast.success(roomIds.size === 0 ? "Auto-assign may use any available room" : "Rooms saved");
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to save rooms";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={subject !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content
        className="!max-w-lg max-h-[90vh] overflow-y-auto"
        title={`Rooms for auto-assign — ${subject?.code ?? ""}`}
        description="Restrict auto-assign to specific rooms for this subject."
      >
        {loading ? (
          <div className="flex justify-center py-8" aria-busy="true">
            <Spinner />
          </div>
        ) : (
          <>
            <label htmlFor="room-search" className="sr-only">Search rooms</label>
            <input
              id="room-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rooms…"
              className="mt-4 w-full rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
            <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto rounded border border-border">
              {[...allRooms]
                .filter((r) => `${r.name} ${r.department?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
                .sort((a, b) => {
                  const own = (r: Room) => (r.departmentId === userDeptId ? 0 : 1);
                  return own(a) - own(b) || a.name.localeCompare(b.name);
                })
                .map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-muted">
                      <input
                        type="checkbox"
                        checked={roomIds.has(r.id)}
                        onChange={() =>
                          setRoomIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                        className="rounded border-border-strong focus:ring-focus-ring"
                      />
                      <span className="flex-1 text-foreground">{r.name}</span>
                      <span className="text-xs text-foreground-muted">
                        {r.isLab ? "Lab · " : ""}
                        {r.capacity} seats · {r.department?.code ?? r.department?.name ?? ""}
                      </span>
                    </label>
                  </li>
                ))}
            </ul>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-foreground-muted">
              {roomIds.size === 0 ? "No rooms selected: any available room" : `${roomIds.size} room${roomIds.size === 1 ? "" : "s"} selected`}
              <HelpTip>
                Auto-assign places this subject only in the selected rooms. With none selected it may use any available room: your department's rooms, or rooms of other departments that are open for the term.
              </HelpTip>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">Cancel</Button>
          </Dialog.Close>
          <Button type="button" onClick={save} disabled={loading || saving}>
            {saving ? "…" : "Save"}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
