import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { X } from "lucide-react";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { HelpTip } from "../../components/ui/helpTip";
import { compressImage, formatBytes } from "../../utils/compressImage";
import { FEEDBACK_PAGES, TYPE_LABEL, type FeedbackType } from "./feedbackTypes";

const MAX_IMAGES = 5;
const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

interface Picked {
  key: string;
  file: File;
  preview: string;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const fieldClass =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

export function NewFeedbackDialog({ onClose, onCreated }: Props) {
  const [page, setPage] = useState<string>("");
  const [type, setType] = useState<FeedbackType>("CHANGE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const picturesRef = useRef<Picked[]>([]);
  picturesRef.current = pictures;

  useEffect(
    () => () => {
      picturesRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
    },
    []
  );

  const addFiles = async (incoming: File[]) => {
    const images = incoming.filter((f) => ACCEPTED.includes(f.type));
    if (images.length < incoming.length) toast.error("Only PNG, JPEG or WebP pictures can be attached");
    if (images.length === 0) return;
    const room = MAX_IMAGES - picturesRef.current.length;
    if (images.length > room) toast.error(`At most ${MAX_IMAGES} pictures per feedback`);
    const next: Picked[] = [];
    for (const f of images.slice(0, Math.max(room, 0))) {
      const file = await compressImage(f);
      if (file.size > MAX_BYTES) {
        toast.error(`${f.name || "A picture"} is still over 3 MB after resizing`);
        continue;
      }
      next.push({ key: `${Date.now()}-${Math.random()}`, file, preview: URL.createObjectURL(file) });
    }
    setPictures((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  // Pasting a screenshot (Ctrl+V) anywhere in the dialog attaches it.
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const remove = (key: string) => {
    setPictures((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.key !== key);
    });
  };

  const canSubmit = page && title.trim().length >= 3 && description.trim().length >= 5 && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("page", page);
      form.append("type", type);
      form.append("title", title.trim());
      form.append("description", description.trim());
      pictures.forEach((p) => form.append("images", p.file, p.file.name));
      await apiClient.post("/feedback", form);
      toast.success("Thank you, your feedback was sent");
      onCreated();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Could not send feedback"));
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !saving && onClose()}>
      <Dialog.Content className="!max-w-xl max-h-[90vh] overflow-y-auto" title="New feedback" onPaste={onPaste}>
        <form onSubmit={submit} className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fb-page" className="mb-1 block text-xs font-medium text-foreground-muted">Page or section</label>
              <select id="fb-page" value={page} onChange={(e) => setPage(e.target.value)} className={fieldClass} required>
                <option value="" disabled>Choose…</option>
                {FEEDBACK_PAGES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fb-type" className="mb-1 block text-xs font-medium text-foreground-muted">Kind of feedback</label>
              <select id="fb-type" value={type} onChange={(e) => setType(e.target.value as FeedbackType)} className={fieldClass}>
                {(Object.keys(TYPE_LABEL) as FeedbackType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="fb-title" className="mb-1 block text-xs font-medium text-foreground-muted">Title</label>
            <input id="fb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={fieldClass} placeholder="A short summary" required />
          </div>

          <div>
            <label htmlFor="fb-desc" className="mb-1 block text-xs font-medium text-foreground-muted">Details</label>
            <textarea
              id="fb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={6}
              className={fieldClass}
              placeholder="What happened or what should change? Include the steps and what you expected."
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-medium text-foreground-muted">Pictures ({pictures.length}/{MAX_IMAGES})</span>
              <HelpTip>
                Attach screenshots that show the problem. You can choose files, drop them here, or paste a copied screenshot with Ctrl+V. Large pictures are resized automatically. PNG, JPEG or WebP, up to 3 MB each.
              </HelpTip>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void addFiles(Array.from(e.dataTransfer.files));
              }}
              className={`rounded border border-dashed px-3 py-4 text-center text-sm ${dragging ? "border-primary bg-primary-muted" : "border-border-strong bg-surface-muted/40"}`}
            >
              <p className="text-foreground-muted">Drop pictures here or paste a screenshot</p>
              <Button type="button" variant="secondary" size="sm" className="mt-2" disabled={saving || pictures.length >= MAX_IMAGES} onClick={() => fileInput.current?.click()}>
                Choose files
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED.join(",")}
                multiple
                className="hidden"
                aria-label="Choose pictures"
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            {pictures.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {pictures.map((p) => (
                  <li key={p.key} className="relative">
                    <img src={p.preview} alt={p.file.name} className="h-20 w-full rounded border border-border object-cover" />
                    <span className="mt-0.5 block text-center text-[11px] text-foreground-muted">{formatBytes(p.file.size)}</span>
                    <button
                      type="button"
                      onClick={() => remove(p.key)}
                      disabled={saving}
                      className="absolute right-1 top-1 rounded-full bg-surface p-0.5 text-foreground shadow hover:bg-danger-muted hover:text-danger focus:outline-none focus:ring-2 focus:ring-focus-ring"
                      aria-label={`Remove ${p.file.name}`}
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit}>{saving ? "Sending…" : "Send feedback"}</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
