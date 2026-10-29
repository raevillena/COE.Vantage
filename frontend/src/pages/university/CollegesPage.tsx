import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage, type College } from "../../types/api";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Spinner } from "../../components/ui/spinner";
import { CollegePicture } from "../../components/ui/collegePicture";
import { resizeImage } from "../../utils/compressImage";
import { HelpTip } from "../../components/ui/helpTip";

const field = "w-full rounded border border-border-strong bg-surface px-3 py-2 focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

/** The admin creates and renames the university's colleges. People, departments and rooms are then added to a college. */
export function CollegesPage() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [university, setUniversity] = useState({ name: "", code: "" });
  const [universityDraft, setUniversityDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ id: string | null; name: string; code: string; imageVersion?: number | null } | null>(null);
  // a picture chosen in the dialog, uploaded once the college is saved; `removeImage` clears the saved one
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  const [removeTarget, setRemoveTarget] = useState<College | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [c, u] = await Promise.all([apiClient.get<College[]>("/colleges"), apiClient.get<{ university: { name: string; code: string | null } }>("/university")]);
      setColleges(c.data);
      setUniversity({ name: u.data.university.name, code: u.data.university.code ?? "" });
      setUniversityDraft(u.data.university.name);
    } catch {
      toast.error("Could not load colleges");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const saveUniversity = async () => {
    setSaving(true);
    try {
      await apiClient.patch("/university", { name: universityDraft });
      toast.success("University name saved");
      await load();
    } catch (e) {
      toast.error(getApiErrorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const saveCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), code: form.code.trim() || null };
      const collegeId = form.id ?? (await apiClient.post<College>("/colleges", body)).data.id;
      if (form.id) await apiClient.patch(`/colleges/${form.id}`, body);
      if (imageFile) {
        const data = new FormData();
        data.append("image", imageFile);
        await apiClient.put(`/colleges/${collegeId}/image`, data);
      } else if (removeImage && form.id) {
        await apiClient.delete(`/colleges/${form.id}/image`);
      }
      toast.success(form.id ? "College updated" : "College created");
      setForm(null);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not save the college"));
    } finally {
      setSaving(false);
    }
  };

  const openForm = (next: { id: string | null; name: string; code: string; imageVersion?: number | null }) => {
    setImageFile(null);
    setRemoveImage(false);
    setForm(next);
  };

  const choosePicture = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast.error("Choose a PNG, JPEG or WebP picture");
      return;
    }
    // wide card pictures are shrunk to 1200 px; the server accepts up to 3 MB
    const small = await resizeImage(file, { maxSide: 1200 });
    if (small.size > 3 * 1024 * 1024) {
      toast.error("The picture is larger than 3 MB. Choose a smaller one.");
      return;
    }
    setImageFile(small);
    setRemoveImage(false);
  };

  const removeCollege = async () => {
    if (!removeTarget) return;
    setSaving(true);
    try {
      await apiClient.delete(`/colleges/${removeTarget.id}`);
      toast.success("College removed");
      setRemoveTarget(null);
      await load();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not remove the college"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">Colleges</h1>
          <HelpTip>Each college has its own departments, people, rooms, curricula and schedules, and sees only its own. Create the college here, then add its people on the Users page and choose this college for them.</HelpTip>
        </div>
        <Button type="button" onClick={() => openForm({ id: null, name: "", code: "" })}>Add college</Button>
      </div>

      <section className="mb-5 rounded-lg border border-border bg-surface p-4">
        <label htmlFor="uni-name" className="mb-1 block text-sm font-medium text-foreground">University name</label>
        <div className="flex flex-wrap gap-2">
          <input id="uni-name" value={universityDraft} onChange={(e) => setUniversityDraft(e.target.value)} className={`${field} max-w-md`} />
          <Button type="button" variant="secondary" onClick={() => void saveUniversity()} disabled={saving || !universityDraft.trim() || universityDraft.trim() === university.name}>
            Save name
          </Button>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-border bg-surface">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-foreground">College</th>
              <th className="px-4 py-2 text-left text-sm font-medium text-foreground">Code</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {colleges.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 text-foreground">
                  <div className="flex items-center gap-3">
                    <CollegePicture id={c.id} name={c.name} code={c.code} version={c.imageVersion} className="h-10 w-16 shrink-0 overflow-hidden rounded" />
                    <span className="min-w-0">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-foreground-muted">{c.code ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" onClick={() => openForm({ id: c.id, name: c.name, code: c.code ?? "", imageVersion: c.imageVersion })} aria-label={`Edit ${c.name}`} title="Edit" className="rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1">
                      <Pencil size={20} aria-hidden />
                    </button>
                    <button type="button" onClick={() => setRemoveTarget(c)} aria-label={`Remove ${c.name}`} title="Remove" className="rounded p-1.5 text-foreground-muted hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1">
                      <Trash2 size={20} aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog.Root open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <Dialog.Content title={form?.id ? "Edit college" : "Add college"}>
          <form onSubmit={saveCollege} className="mt-4 space-y-3">
            <div>
              <label htmlFor="college-name" className="mb-1 block text-sm font-medium text-foreground">Name</label>
              <input id="college-name" value={form?.name ?? ""} onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))} className={field} />
            </div>
            <div>
              <label htmlFor="college-code" className="mb-1 block text-sm font-medium text-foreground">Code (optional)</label>
              <input id="college-code" value={form?.code ?? ""} onChange={(e) => setForm((f) => (f ? { ...f, code: e.target.value } : f))} className={field} placeholder="e.g. COE" />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-foreground">Card picture</span>
              <div className="flex items-center gap-3">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="h-20 w-32 rounded object-cover" />
                ) : form?.id && form.imageVersion && !removeImage ? (
                  <CollegePicture id={form.id} name={form.name} code={form.code} version={form.imageVersion} className="h-20 w-32 overflow-hidden rounded" />
                ) : (
                  <div aria-hidden className="flex h-20 w-32 items-center justify-center rounded border border-dashed border-border-strong text-xs text-foreground-muted">No picture</div>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>Choose picture</Button>
                  {(imageFile || (form?.id && form.imageVersion && !removeImage)) && (
                    <Button type="button" variant="secondary" size="sm" onClick={() => { setImageFile(null); setRemoveImage(true); }}>Remove</Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-foreground-muted">PNG, JPEG or WebP, up to 3 MB. Shown on the university overview.</p>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Choose a card picture" onChange={(e) => void choosePicture(e.target.files?.[0])} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={removeTarget !== null} onOpenChange={(open) => !open && !saving && setRemoveTarget(null)}>
        <Dialog.Content title="Remove this college?" description={`${removeTarget?.name ?? ""} can be removed only when it has no people and no departments.`}>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button type="button" variant="danger" onClick={() => void removeCollege()} disabled={saving}>Remove college</Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
