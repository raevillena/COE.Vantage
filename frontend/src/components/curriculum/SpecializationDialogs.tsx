import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import type { CurriculumSpecialization } from "../../types/api";

const messageOf = (err: unknown, fallback: string) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/**
 * Add, rename and remove the specializations (tracks) of one curriculum. Removing one frees its subjects: a subject left
 * with no specialization becomes common to all.
 */
export function SpecializationsManager({
  curriculum,
  onClose,
  onChanged,
}: {
  curriculum: { id: string; name: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<CurriculumSpecialization[] | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setItems((await apiClient.get<CurriculumSpecialization[]>(`/curriculum/${curriculum.id}/specializations`)).data);
    } catch {
      toast.error("Could not load the specializations");
      setItems([]);
    }
  };
  useEffect(() => {
    void load();
  }, [curriculum.id]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      toast.error(messageOf(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => {
      await apiClient.post(`/curriculum/${curriculum.id}/specializations`, { name });
      setName("");
    }, "Could not add the specialization");
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content
          title={`Specializations — ${curriculum.name}`}
          description="Tracks inside this curriculum. A subject with no specialization is common to every class; tag a subject with one or more specializations in the curriculum viewer."
        >
          <form onSubmit={add} className="mt-4 flex gap-2">
            <input
              aria-label="New specialization name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Software Engineering"
              maxLength={120}
              className="min-w-0 flex-1 rounded border border-border-strong px-3 py-2 text-sm focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            />
            <Button type="submit" disabled={busy || !name.trim()}>Add</Button>
          </form>
          <div className="mt-4 max-h-72 overflow-y-auto">
            {items === null ? (
              <div className="flex justify-center py-6" aria-busy="true"><Spinner /></div>
            ) : items.length === 0 ? (
              <p className="py-4 text-sm text-foreground-muted">No specializations yet: every subject of this curriculum is common.</p>
            ) : (
              <ul className="divide-y divide-border rounded border border-border">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {editing?.id === s.id ? (
                      <>
                        <input
                          aria-label={`Rename ${s.name}`}
                          value={editing.name}
                          onChange={(e) => setEditing({ id: s.id, name: e.target.value })}
                          className="min-w-0 flex-1 rounded border border-border-strong px-2 py-1 text-sm"
                          autoFocus
                        />
                        <Button
                          type="button"
                          disabled={busy || !editing.name.trim()}
                          onClick={() =>
                            void run(async () => {
                              await apiClient.patch(`/curriculum/specializations/${s.id}`, { name: editing.name });
                              setEditing(null);
                            }, "Could not rename it")
                          }
                        >
                          Save
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{s.name}</span>
                          <span className="ml-2 text-xs text-foreground-muted">
                            {s.subjectCount} tagged subject{s.subjectCount === 1 ? "" : "s"}
                            {s.classCount > 0 ? ` · ${s.classCount} class${s.classCount === 1 ? "" : "es"}` : ""}
                          </span>
                        </span>
                        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setEditing({ id: s.id, name: s.name })} aria-label={`Rename ${s.name}`}>
                          Rename
                        </button>
                        <button
                          type="button"
                          className="text-xs font-medium text-danger hover:underline"
                          aria-label={`Remove ${s.name}`}
                          onClick={() => {
                            if (window.confirm(`Remove "${s.name}"? Its subjects stay in the curriculum; one tagged only with it becomes common to all.`)) {
                              void run(() => apiClient.delete(`/curriculum/specializations/${s.id}`), "Could not remove it");
                            }
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Pick which specializations one subject belongs to. None ticked = common to every specialization. */
export function SubjectSpecializationEditor({
  curriculumId,
  subject,
  specializations,
  onClose,
  onSaved,
}: {
  curriculumId: string;
  subject: { id: string; code: string; name: string; specializations: { id: string; name: string }[] };
  specializations: CurriculumSpecialization[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(subject.specializations.map((s) => s.id));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/curriculum/${curriculumId}/subjects/${subject.id}/specializations`, { specializationIds: picked });
      toast.success("Specializations saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(messageOf(err, "Could not save the specializations"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content
          title={`${subject.code} — specializations`}
          description={`${subject.name}. Tick every specialization that takes this subject, for example two of three. Tick none and it is common to all.`}
        >
          <div className="mt-4 space-y-2">
            {specializations.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-strong"
                  checked={picked.includes(s.id)}
                  onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                />
                {s.name}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-foreground-muted">
            {picked.length === 0
              ? "Common to all specializations."
              : picked.length === specializations.length
                ? "Ticked for every specialization: same as common."
                : `Taken only by ${picked.length} of ${specializations.length} specializations.`}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
