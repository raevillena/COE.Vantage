import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../api/apiClient";
import type { Curriculum, ExtractedSubject } from "../../types/api";
import toast from "react-hot-toast";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { DropdownMenu } from "../../components/ui/dropdownMenu";
import { Spinner } from "../../components/ui/spinner";
import { useAppSelector } from "../../store/hooks";
import { parseIusisCurriculumHtml } from "../../utils/parseIusisCurriculumHtml";

export function CurriculumPage() {
  const user = useAppSelector((s) => s.auth.user);
  const canEdit = user?.role === "ADMIN" || user?.role === "CHAIRMAN";

  const [list, setList] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", departmentId: "" });
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [clearConfirmCurriculum, setClearConfirmCurriculum] = useState<Curriculum | null>(null);
  const [clearLoading, setClearLoading] = useState(false);

  // Curriculum viewer (read-only subjects list)
  const [viewerCurriculum, setViewerCurriculum] = useState<Curriculum | null>(null);
  const [viewerSubjects, setViewerSubjects] = useState<{ id: string; code: string; name: string; units: number; isLab: boolean; yearLevel: number | null; semester: number | null }[]>([]);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Import: image (OCR) or IUSIS paste — shared two-phase flow
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"image" | "iusis">("image");
  const [importCurriculumId, setImportCurriculumId] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importIusisHtml, setImportIusisHtml] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedRows, setExtractedRows] = useState<ExtractedSubject[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Curriculum[]>("/curriculum");
      setList(data);
    } catch {
      toast.error("Failed to load curriculum");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get("/departments").then(({ data }) => setDepartments(data));
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      departmentId: user?.role === "CHAIRMAN" && user?.departmentId ? user.departmentId : "",
    });
    setModalOpen(true);
  };

  const openEdit = (c: Curriculum) => {
    setEditingId(c.id);
    setForm({ name: c.name, departmentId: c.departmentId ?? "" });
    setModalOpen(true);
  };

  const openViewer = async (c: Curriculum) => {
    setViewerCurriculum(c);
    setViewerSubjects([]);
    setViewerLoading(true);
    try {
      const { data } = await apiClient.get<{ id: string; code: string; name: string; units: number; isLab: boolean; yearLevel: number | null; semester: number | null }[]>(
        `/curriculum/${c.id}/subjects`
      );
      setViewerSubjects(data ?? []);
    } catch {
      toast.error("Failed to load curriculum subjects");
      setViewerCurriculum(null);
    } finally {
      setViewerLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrimmed = form.name.trim();
    if (!nameTrimmed) {
      toast.error("Name is required");
      return;
    }
    try {
      const payload = { name: nameTrimmed, departmentId: form.departmentId || null };
      if (editingId) {
        await apiClient.patch(`/curriculum/${editingId}`, payload);
        toast.success("Curriculum updated");
      } else {
        await apiClient.post("/curriculum", payload);
        toast.success("Curriculum created");
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed";
      toast.error(msg);
    }
  };

  const handleDeleteClick = (id: string) => setDeleteConfirmId(id);

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/curriculum/${deleteConfirmId}`);
      toast.success("Curriculum moved to trash");
      setDeleteConfirmId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleClearClick = (c: Curriculum) => setClearConfirmCurriculum(c);

  const handleClearConfirm = async () => {
    if (!clearConfirmCurriculum) return;
    const id = clearConfirmCurriculum.id;
    setClearLoading(true);
    try {
      await apiClient.post(`/curriculum/${id}/clear`);
      toast.success("Curriculum cleared. All subjects were unassigned.");
      setClearConfirmCurriculum(null);
      if (viewerCurriculum?.id === id) {
        setViewerCurriculum(null);
        setViewerSubjects([]);
      }
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to clear";
      toast.error(msg);
    } finally {
      setClearLoading(false);
    }
  };

  const openImport = useCallback((mode: "image" | "iusis" = "image") => {
    setImportOpen(true);
    setImportMode(mode);
    setImportCurriculumId(list[0]?.id ?? "");
    setImportFile(null);
    setImportIusisHtml("");
    setExtractedRows([]);
    setApplyResult(null);
  }, [list]);

  const handleParseIusis = () => {
    if (!importIusisHtml.trim()) {
      toast.error("Paste the IUSIS curriculum HTML first");
      return;
    }
    try {
      const rows = parseIusisCurriculumHtml(importIusisHtml);
      if (rows.length === 0) {
        toast.error("No subjects found. Make sure you pasted the full IUSIS curriculum component HTML.");
        return;
      }
      setExtractedRows(rows);
      toast.success(`Parsed ${rows.length} subjects. Review below and click Apply import.`);
    } catch (e) {
      toast.error("Failed to parse HTML. Check that it’s the full curriculum component.");
    }
  };

  const handleExtract = async () => {
    if (!importFile) {
      toast.error("Select an image file first");
      return;
    }
    setExtracting(true);
    setApplyResult(null);
    try {
      const formData = new FormData();
      formData.append("image", importFile);
      const { data } = await apiClient.post<{ extracted: ExtractedSubject[] }>(
        "/curriculum/extract-from-image",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setExtractedRows(data.extracted ?? []);
      if ((data.extracted?.length ?? 0) === 0) toast.error("No subjects extracted. Try a clearer image.");
      else toast.success(`Extracted ${data.extracted!.length} subjects. Review and edit below, then Apply import.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.error
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Extract failed";
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  const handleApplyImport = async () => {
    if (!importCurriculumId) {
      toast.error("Select a curriculum");
      return;
    }
    if (extractedRows.length === 0) {
      toast.error("No subjects to import. Extract from an image first.");
      return;
    }
    setApplying(true);
    try {
      const { data } = await apiClient.post<{ created: number; updated: number; errors: string[] }>(
        "/curriculum/apply-import",
        { curriculumId: importCurriculumId, subjects: extractedRows }
      );
      setApplyResult(data);
      toast.success(`Created ${data.created}, updated ${data.updated}.`);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Apply failed";
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  };

  const updateExtractedRow = (index: number, field: keyof ExtractedSubject, value: string | number | boolean | undefined) => {
    setExtractedRows((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };
      next[index] = row;
      return next;
    });
  };

  const removeExtractedRow = (index: number) => {
    setExtractedRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addExtractedRow = () => {
    setExtractedRows((prev) => [...prev, { yearLevel: 1, semester: 1, code: "", name: "", units: 3, isLab: false }]);
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-foreground">Curriculum</h1>
        {canEdit && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => openImport("image")} disabled={list.length === 0}>Import from image</Button>
            <Button type="button" variant="secondary" onClick={() => openImport("iusis")} disabled={list.length === 0}>Import from IUSIS</Button>
            <Button type="button" onClick={openCreate}>Add Curriculum</Button>
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-12 rounded border border-border bg-surface" aria-busy="true">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-foreground-muted mb-4">No curriculum yet.{canEdit ? " Add one to get started." : ""}</p>
          {canEdit && <Button type="button" onClick={openCreate}>Add Curriculum</Button>}
        </div>
      ) : (
        <div className="rounded border border-border bg-surface overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted">
              <tr>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Name</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Department</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-foreground">{c.name}</td>
                  <td className="px-4 py-2 text-foreground-muted">{c.department?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openViewer(c)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View
                      </button>
                      {canEdit && (
                        <Link
                          to={`/curriculum/${c.id}/build`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Build
                        </Link>
                      )}
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                            aria-label="More actions"
                          >
                            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="12" cy="6" r="1.5" />
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="12" cy="18" r="1.5" />
                            </svg>
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onSelect={() => openViewer(c)}>View</DropdownMenu.Item>
                          {canEdit && (
                            <>
                              <DropdownMenu.Item asChild>
                                <Link to={`/curriculum/${c.id}/build`}>Build</Link>
                              </DropdownMenu.Item>
                              <DropdownMenu.Item onSelect={() => openEdit(c)}>Edit</DropdownMenu.Item>
                              <DropdownMenu.Item onSelect={() => handleClearClick(c)}>Clear curriculum</DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={() => handleDeleteClick(c.id)}
                                className="text-danger focus:bg-danger-muted focus:text-danger-hover"
                              >
                                Move to trash
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Content title={editingId ? "Edit Curriculum" : "Add Curriculum"}>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded border border-border-strong px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1" />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
              <Select.Root
                value={form.departmentId || "__none__"}
                onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === "__none__" ? "" : v }))}
              >
                <Select.Trigger aria-label="Department" disabled={user?.role === "CHAIRMAN"}>
                  <Select.Value placeholder="No department" />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="__none__">No department</Select.Item>
                  {departments.map((d) => (
                    <Select.Item key={d.id} value={d.id}>{d.name}</Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              {user?.role === "CHAIRMAN" && (
                <p className="mt-1 text-xs text-foreground-muted">Curriculum is scoped to your department.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={viewerCurriculum !== null} onOpenChange={(open) => !open && setViewerCurriculum(null)}>
        <Dialog.Content
          title={viewerCurriculum ? `${viewerCurriculum.name} — Curriculum` : "Curriculum viewer"}
          description={viewerCurriculum ? (viewerCurriculum.department?.name ? `Department: ${viewerCurriculum.department.name}` : undefined) : undefined}
          className="!max-w-[min(80rem,95vw)] w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
        >
          <div className="overflow-y-auto min-h-0 mt-2">
            {viewerLoading ? (
              <div className="flex justify-center py-8" aria-busy="true">
                <Spinner />
              </div>
            ) : viewerSubjects.length === 0 ? (
              <p className="text-sm text-foreground-muted py-4">No subjects in this curriculum yet.</p>
            ) : (
              <div className="rounded border border-border overflow-hidden">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-surface-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Year</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Semester</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Code</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Units</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground">Lab</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewerSubjects.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 text-foreground-muted">{s.yearLevel ?? "—"}</td>
                        <td className="px-3 py-2 text-foreground-muted">{s.semester === 1 ? "1st Sem" : s.semester === 2 ? "2nd Sem" : s.semester === 3 ? "Mid Year" : "—"}</td>
                        <td className="px-3 py-2 text-foreground font-medium">{s.code}</td>
                        <td className="px-3 py-2 text-foreground">{s.name}</td>
                        <td className="px-3 py-2 text-foreground-muted">{s.units}</td>
                        <td className="px-3 py-2 text-foreground-muted">{s.isLab ? "Yes" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex justify-end pt-3 border-t border-border mt-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <Dialog.Content title="Move curriculum to trash" description="This curriculum will be moved to Trash. An admin can restore it or permanently delete it from the Trash page.">
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

      <Dialog.Root open={clearConfirmCurriculum !== null} onOpenChange={(open) => !open && setClearConfirmCurriculum(null)}>
        <Dialog.Content
          title="Clear curriculum"
          description={clearConfirmCurriculum ? `Remove all subjects from "${clearConfirmCurriculum.name}". Subjects stay in the system and can be reassigned to any curriculum.` : undefined}
        >
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="secondary" onClick={handleClearConfirm} disabled={clearLoading}>
              {clearLoading ? "Clearing…" : "Clear curriculum"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setApplyResult(null); }}>
        <Dialog.Content title="Import curriculum" description="Import from an image (OCR) or paste HTML from the IUSIS curriculum component. Review and apply to save." className="!max-w-[min(70rem,95vw)] w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
          <div className="space-y-4 overflow-y-auto min-h-0">
            <div className="flex flex-wrap gap-3 items-center border-b border-border pb-3">
              <span className="text-sm font-medium text-foreground">Source:</span>
              <button
                type="button"
                onClick={() => { setImportMode("image"); setExtractedRows([]); setApplyResult(null); }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${importMode === "image" ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground-muted hover:bg-surface-hover"}`}
              >
                From image
              </button>
              <button
                type="button"
                onClick={() => { setImportMode("iusis"); setExtractedRows([]); setApplyResult(null); }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${importMode === "iusis" ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground-muted hover:bg-surface-hover"}`}
              >
                From IUSIS
              </button>
            </div>
            <div className="min-w-[200px]">
              <label className="mb-1 block text-sm font-medium text-foreground">Curriculum</label>
              <Select.Root value={importCurriculumId || "__none__"} onValueChange={(v) => setImportCurriculumId(v === "__none__" ? "" : v)}>
                <Select.Trigger aria-label="Curriculum">
                  <Select.Value placeholder="Select curriculum" />
                </Select.Trigger>
                <Select.Content>
                  {list.map((c) => (
                    <Select.Item key={c.id} value={c.id}>{c.name}</Select.Item>
                  ))}
                  {list.length === 0 && <Select.Item value="__none__" disabled>No curriculum</Select.Item>}
                </Select.Content>
              </Select.Root>
            </div>
            {importMode === "image" && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="min-w-[200px]">
                  <label className="mb-1 block text-sm font-medium text-foreground">Image file</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="block w-full text-sm text-foreground file:mr-2 file:rounded file:border-0 file:bg-surface-muted file:px-3 file:py-1.5 file:text-sm"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button type="button" onClick={handleExtract} disabled={extracting || !importFile}>
                  {extracting ? "Extracting…" : "Extract"}
                </Button>
              </div>
            )}
            {importMode === "iusis" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Paste IUSIS curriculum HTML</label>
                <p className="text-xs text-foreground-muted">Copy the full Laravel curriculum component from IUSIS (right‑click → Inspect → copy outer HTML of the curriculum block), then paste below.</p>
                <textarea
                  value={importIusisHtml}
                  onChange={(e) => setImportIusisHtml(e.target.value)}
                  placeholder="Paste the &lt;div&gt;... curriculum table HTML here"
                  className="w-full min-h-[120px] rounded border border-border-strong px-3 py-2 text-sm font-mono bg-surface focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
                  spellCheck={false}
                />
                <Button type="button" onClick={handleParseIusis} disabled={!importIusisHtml.trim()}>
                  Parse HTML
                </Button>
              </div>
            )}

            {extractedRows.length > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground-muted">Review and edit rows, then click Apply import. You can fix any subject later in Subjects.</span>
                  <Button type="button" variant="secondary" onClick={addExtractedRow}>Add row</Button>
                </div>
                <div className="border border-border rounded overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-surface-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Code</th>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Name</th>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Units</th>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Year</th>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Semester</th>
                        <th className="px-2 py-1.5 text-left font-medium text-foreground">Lab</th>
                        <th className="px-2 py-1.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {extractedRows.map((row, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1">
                            <input className="w-full rounded border border-border-strong px-2 py-1 bg-transparent" value={row.code} onChange={(e) => updateExtractedRow(i, "code", e.target.value)} />
                          </td>
                          <td className="px-2 py-1">
                            <input className="w-full rounded border border-border-strong px-2 py-1 bg-transparent" value={row.name} onChange={(e) => updateExtractedRow(i, "name", e.target.value)} />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" min={0} className="w-16 rounded border border-border-strong px-2 py-1 bg-transparent" value={row.units} onChange={(e) => updateExtractedRow(i, "units", parseInt(e.target.value, 10) || 0)} />
                          </td>
                          <td className="px-2 py-1">
                            <select className="rounded border border-border-strong px-2 py-1 bg-transparent" value={row.yearLevel} onChange={(e) => updateExtractedRow(i, "yearLevel", parseInt(e.target.value, 10))}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>Year {n}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <select className="rounded border border-border-strong px-2 py-1 bg-transparent" value={row.semester ?? ""} onChange={(e) => updateExtractedRow(i, "semester", e.target.value ? parseInt(e.target.value, 10) : undefined)}>
                              <option value="">—</option>
                              <option value={1}>1st Sem</option>
                              <option value={2}>2nd Sem</option>
                              <option value={3}>Mid Year</option>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input type="checkbox" checked={row.isLab ?? false} onChange={(e) => updateExtractedRow(i, "isLab", e.target.checked)} />
                          </td>
                          <td className="px-2 py-1">
                            <button type="button" className="text-danger hover:underline" onClick={() => removeExtractedRow(i)} aria-label="Remove row">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={handleApplyImport} disabled={applying}>{applying ? "Applying…" : "Apply import"}</Button>
                </div>
              </>
            )}

            {applyResult && (
              <div className="rounded border border-border bg-surface-muted/50 p-3 text-sm">
                <p className="text-foreground">Created {applyResult.created}, updated {applyResult.updated}.</p>
                {applyResult.errors.length > 0 && (
                  <p className="mt-1 text-danger">Errors: {applyResult.errors.slice(0, 5).join("; ")}{applyResult.errors.length > 5 ? ` (+${applyResult.errors.length - 5} more)` : ""}</p>
                )}
                <p className="mt-2 text-foreground-muted">You can edit any subject later in <Link to="/subjects" className="text-link hover:underline" onClick={() => setImportOpen(false)}>Subjects</Link>.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end pt-3 border-t border-border mt-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Close</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
