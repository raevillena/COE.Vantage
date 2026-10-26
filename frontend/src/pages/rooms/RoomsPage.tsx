import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";
import type { AcademicYear, Department, Room } from "../../types/api";
import { HelpTip } from "../../components/ui/helpTip";
import { getApiErrorMessage } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { SearchableSelect } from "../../components/ui/searchableSelect";
import { MoreVertical, Pencil } from "lucide-react";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";

type RoomForm = {
  name: string;
  capacity: number | "";
  hasComputer: boolean;
  isLab: boolean;
  hasAC: boolean;
  departmentId: string;
};

const EMPTY_FORM: RoomForm = {
  name: "",
  capacity: 20,
  hasComputer: false,
  isLab: false,
  hasAC: false,
  departmentId: "",
};

const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function RoomsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const role = user?.role;
  const ownDeptId = user?.departmentId ?? null;
  const isChairman = role === "CHAIRMAN";
  const isPrivileged = role === "ADMIN" || role === "DEAN";
  const canDeleteRoom = isPrivileged;
  const canAddRoom = role === "ADMIN" || role === "DEAN" || role === "OFFICER" || (isChairman && ownDeptId !== null);
  const splitByDept = isChairman && ownDeptId !== null;

  const canEditRoom = (r: Room) =>
    role === "ADMIN" || role === "DEAN" || role === "OFFICER" || (isChairman && r.departmentId === ownDeptId);
  /** The room's own department chairman (or admin/dean) opens/closes and may transfer it. */
  const canToggleOpen = (r: Room) => isPrivileged || (isChairman && r.departmentId === ownDeptId);
  const canTransfer = canToggleOpen;

  const [list, setList] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [transferTarget, setTransferTarget] = useState<Room | null>(null);
  const [transferDeptId, setTransferDeptId] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Room[]>("/rooms");
      setList(data);
    } catch {
      toast.error("Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async () => {
    if (!academicYearId) {
      setAvailability({});
      return;
    }
    try {
      const params = new URLSearchParams({ academicYearId, semester: String(semester) });
      const { data } = await apiClient.get<Record<string, boolean>>(`/rooms/availability-map?${params}`);
      setAvailability(data ?? {});
    } catch {
      setAvailability({});
    }
  };

  useEffect(() => {
    load();
    apiClient
      .get<Department[]>("/departments", { params: { scope: "all" } })
      .then(({ data }) => setDepartments(data ?? []))
      .catch(() => setDepartments([]));
    apiClient
      .get<AcademicYear[]>("/academic-years/for-schedules")
      .then(({ data }) => {
        setAcademicYears(data);
        const active = data.find((y) => y.isActive);
        setAcademicYearId(active?.id ?? data[0]?.id ?? "");
      })
      .catch(() => setAcademicYears([]));
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [academicYearId, semester]);

  const toggleOpen = async (r: Room) => {
    if (!academicYearId) {
      toast.error("Select an academic year first");
      return;
    }
    const next = availability[r.id] !== true;
    setTogglingId(r.id);
    try {
      await apiClient.patch(`/rooms/${r.id}/availability`, { academicYearId, semester, isOpen: next });
      setAvailability((prev) => ({ ...prev, [r.id]: next }));
      toast.success(next ? `${r.name} is now open to other departments` : `${r.name} is now closed`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to update room"));
    } finally {
      setTogglingId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      departmentId: isChairman ? ownDeptId ?? "" : departments[0]?.id ?? ""
    });
    setModalOpen(true);
  };

  const openEdit = (r: Room) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      capacity: r.capacity,
      hasComputer: r.hasComputer,
      isLab: r.isLab,
      hasAC: r.hasAC,
      departmentId: r.departmentId,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim().replace(/\s+/g, " ");
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const capacityNum = Number(form.capacity);
    if (form.capacity === "" || !Number.isInteger(capacityNum) || capacityNum < 1) {
      toast.error("Capacity must be a whole number of at least 1");
      return;
    }
    if (!form.departmentId) {
      toast.error("Select a department");
      return;
    }
    if (list.some((r) => r.id !== editingId && normName(r.name) === normName(name))) {
      toast.error(`A room named "${name}" already exists`);
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      capacity: capacityNum,
      isLab: form.isLab,
      hasComputer: form.hasComputer,
      hasAC: form.hasAC,
    };
    if (!editingId || role === "ADMIN") payload.departmentId = form.departmentId;

    setSaving(true);
    try {
      if (editingId) {
        await apiClient.patch(`/rooms/${editingId}`, payload);
        toast.success("Room updated");
      } else {
        await apiClient.post("/rooms", payload);
        toast.success("Room created");
      }
      setModalOpen(false);
      load();
      loadAvailability();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/rooms/${deleteConfirmId}`);
      toast.success("Room moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => apiClient.delete(`/rooms/${id}`)));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      load();
      if (failed === 0) toast.success(`${ok} room${ok === 1 ? "" : "s"} moved to trash`);
      else if (ok === 0) toast.error("Failed to move to trash");
      else toast.success(`${ok} moved to trash; ${failed} failed`);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const openTransfer = (r: Room) => {
    setTransferTarget(r);
    setTransferDeptId("");
  };

  const handleTransfer = async () => {
    if (!transferTarget || !transferDeptId) return;
    setTransferLoading(true);
    try {
      await apiClient.post(`/rooms/${transferTarget.id}/transfer`, { departmentId: transferDeptId });
      toast.success(`${transferTarget.name} transferred`);
      setTransferTarget(null);
      await Promise.all([load(), loadAvailability()]);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Transfer failed"));
    } finally {
      setTransferLoading(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredList = searchLower
    ? list.filter(
        (r) =>
          r.name.toLowerCase().includes(searchLower) ||
          String(r.capacity).includes(searchLower) ||
          (r.department?.name ?? "").toLowerCase().includes(searchLower) ||
          (r.isLab ? "yes" : "no").includes(searchLower)
      )
    : list;
  const myRooms = filteredList.filter((r) => r.departmentId === ownDeptId);
  const otherRooms = filteredList.filter((r) => r.departmentId !== ownDeptId);

  const statusCell = (r: Room) =>
    availability[r.id] === true ? (
      <span className="font-medium text-success">Open</span>
    ) : (
      <span className="font-medium text-warning" title="Closed: only the owning department can assign it; other departments' schedules here are locked.">Closed</span>
    );

  const renderTable = (rows: Room[], heading?: string, hint?: string) => {
    const ids = rows.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    const toggleAll = () =>
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
        return next;
      });
    const th = "px-4 py-2 text-left text-sm font-medium text-foreground";
    return (
      <section className="mb-6">
        {heading && (
          <div className="mb-2">
            <div className="flex items-center gap-2">
<h2 className="text-lg font-medium text-foreground">
              {heading} <span className="text-sm font-normal text-foreground-muted">({rows.length})</span></h2>
{hint && <HelpTip>{hint}</HelpTip>}
</div>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="rounded border border-border bg-surface p-6 text-center text-sm text-foreground-muted">
            No rooms.
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-border bg-surface">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-muted">
                <tr>
                  {canDeleteRoom && (
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all in this table"
                        className="rounded border-border-strong focus:ring-focus-ring"
                      />
                    </th>
                  )}
                  <th className={th}>Name</th>
                  <th className={th}>Capacity</th>
                  <th className={th}>Lab</th>
                  <th className={th}>Department</th>
                  <th className={th} title="Open/closed for the term selected above">This term</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className={selectedIds.has(r.id) ? "bg-primary-muted/30" : ""}>
                    {canDeleteRoom && (
                      <td className="w-10 px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() =>
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                          aria-label={`Select ${r.name}`}
                          className="rounded border-border-strong focus:ring-focus-ring"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 text-foreground">{r.name}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.capacity}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.isLab ? "Yes" : "No"}</td>
                    <td className="px-4 py-2 text-foreground-muted">{r.department?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-sm">{statusCell(r)}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canToggleOpen(r) && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={togglingId === r.id || !academicYearId}
                            onClick={() => toggleOpen(r)}
                          >
                            {togglingId === r.id ? "…" : availability[r.id] === true ? "Close" : "Open"}
                          </Button>
                        )}
                        {canEditRoom(r) && (
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                            aria-label={`Edit ${r.name}`}
                            title="Edit"
                          >
                            <Pencil size={20} className="shrink-0" aria-hidden />
                          </button>
                        )}
                        {(canEditRoom(r) || canTransfer(r) || canDeleteRoom) && (
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                type="button"
                                className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                                aria-label={`Actions for ${r.name}`}
                              >
                                <MoreVertical size={20} className="shrink-0" aria-hidden />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end">
                              {canEditRoom(r) && <DropdownMenu.Item onSelect={() => openEdit(r)}>Edit</DropdownMenu.Item>}
                              {canTransfer(r) && (
                                <DropdownMenu.Item onSelect={() => openTransfer(r)}>Transfer to another department…</DropdownMenu.Item>
                              )}
                              {canDeleteRoom && (
                                <DropdownMenu.Item
                                  onSelect={() => setDeleteConfirmId(r.id)}
                                  className="text-danger focus:bg-danger-muted focus:text-danger-hover"
                                >
                                  Move to trash
                                </DropdownMenu.Item>
                              )}
                            </DropdownMenu.Content>
                          </DropdownMenu.Root>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const transferOptions = departments
    .filter((d) => !transferTarget || d.id !== transferTarget.departmentId)
    .map((d) => ({ value: d.id, label: d.name }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Rooms</h1>
        {canAddRoom && <Button type="button" onClick={openCreate}>Add Room</Button>}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-foreground">Academic year</label>
          <SearchableSelect
            options={academicYears.map((y) => ({ value: y.id, label: y.isActive ? `${y.name} (current)` : y.name }))}
            value={academicYearId || "__none__"}
            onValueChange={(v) => setAcademicYearId(v === "__none__" ? "" : v)}
            noneOption={{ value: "__none__", label: "Academic year" }}
            placeholder="Search academic year…"
            aria-label="Academic year"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Semester</label>
          <Select.Root value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
            <Select.Trigger aria-label="Semester" className="w-[120px]">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="1">1st Sem</Select.Item>
              <Select.Item value="2">2nd Sem</Select.Item>
              <Select.Item value="3">Mid Year</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div className="pb-2">
          <HelpTip>Open or closed status applies to the selected term. A closed room can be assigned only by its controlling department.</HelpTip>
        </div>
      </div>

      {list.length > 0 && (
        <div className="relative mb-4 max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" aria-hidden>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            type="search"
            placeholder="Search by name, capacity, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-border-strong py-2 pl-9 pr-3 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            aria-label="Search rooms"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded border border-border bg-surface py-12" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="mb-4 text-foreground-muted">No rooms yet.{canAddRoom ? " Add one to get started." : ""}</p>
          {canAddRoom && <Button type="button" onClick={openCreate}>Add Room</Button>}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="mb-4 text-foreground-muted">No rooms match &quot;{searchQuery.trim()}&quot;.</p>
          <button type="button" onClick={() => setSearchQuery("")} className="rounded text-sm font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1">
            Clear search
          </button>
        </div>
      ) : (
        <>
          {canDeleteRoom && selectedIds.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-border bg-surface-muted/60 px-3 py-2">
              <span className="text-sm font-medium text-foreground">{selectedIds.size} selected</span>
              <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
              <Button type="button" variant="danger" onClick={() => setBulkDeleteOpen(true)}>Move selected to trash</Button>
            </div>
          )}
          {splitByDept ? (
            <>
              {renderTable(myRooms, "My department's rooms", "Open or close each room for the selected term. While a room is closed, loads that other departments already placed in it are locked.")}
              {renderTable(otherRooms, "Other rooms", "Only rooms that are open for the term can be assigned in your schedules.")}
            </>
          ) : (
            renderTable(filteredList)
          )}
        </>
      )}

      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Room" : "Add Room"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5">
<label className="text-sm font-medium text-foreground">
                Name</label>
<HelpTip>Room names must be unique, ignoring letter case.</HelpTip>
</div>
              <input
                placeholder="e.g. CE-201"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Capacity</label>
              <input
                type="number"
                min={1}
                value={form.capacity === "" ? "" : form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value === "" ? "" : Number(e.target.value) }))}
                className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
<label className="text-sm font-medium text-foreground">
                Department</label>
<HelpTip>Only an administrator can change a room's department here. Other roles use “Transfer to another department…” from the room's menu.</HelpTip>
</div>
              <SearchableSelect
                options={departmentOptions}
                value={form.departmentId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}
                noneOption={{ value: "__none__", label: "Select department" }}
                placeholder="Search departments…"
                disabled={role !== "ADMIN"}
                aria-label="Department"
              />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isLab} onChange={(e) => setForm((f) => ({ ...f, isLab: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Lab</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasComputer} onChange={(e) => setForm((f) => ({ ...f, hasComputer: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Has computer</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.hasAC} onChange={(e) => setForm((f) => ({ ...f, hasAC: e.target.checked }))} className="rounded border-border-strong focus:ring-focus-ring" />
              <span>Has AC</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "…" : "Save"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={transferTarget !== null} onOpenChange={(open) => !open && setTransferTarget(null)}>
        <Dialog.Content
          title={`Transfer ${transferTarget?.name ?? "room"}`}
          description="The receiving department becomes the owner and can open or close this room. Open/closed settings and existing schedules are kept."
        >
          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground-muted">
              Currently owned by{" "}
              <span className="font-medium text-foreground">
                {transferTarget?.department?.name ?? "—"}
              </span>
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">New department</label>
              <SearchableSelect
                options={transferOptions}
                value={transferDeptId || "__none__"}
                onValueChange={(v) => setTransferDeptId(v === "__none__" ? "" : v)}
                noneOption={{ value: "__none__", label: "Select department" }}
                placeholder="Search departments…"
                aria-label="New department"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="button" onClick={handleTransfer} disabled={!transferDeptId || transferLoading}>
                {transferLoading ? "…" : "Transfer"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move room to trash" description="This room will be moved to Trash. You can restore it from the Trash page, or an admin can permanently delete it there.">
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={handleDeleteConfirm} disabled={deleteLoading}>
              {deleteLoading ? "…" : "Move to trash"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      {canDeleteRoom && (
        <Dialog.Root open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <Dialog.Content title="Move selected to trash" description={`${selectedIds.size} room${selectedIds.size === 1 ? "" : "s"} will be moved to Trash. You can restore them from the Trash page.`}>
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="button" variant="danger" onClick={handleBulkDeleteConfirm} disabled={bulkDeleteLoading}>
                {bulkDeleteLoading ? "…" : "Move to trash"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </div>
  );
}