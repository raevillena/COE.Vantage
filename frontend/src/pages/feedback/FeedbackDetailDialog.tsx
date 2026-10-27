import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiClient } from "../../api/apiClient";
import { getApiErrorMessage } from "../../types/api";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Spinner } from "../../components/ui/spinner";
import { formatBytes } from "../../utils/compressImage";
import { FeedbackImage, forgetFeedbackImage } from "./FeedbackImage";
import { STATUS_BADGE, STATUS_LABEL, TYPE_BADGE, TYPE_LABEL, type FeedbackItem, type FeedbackStatus } from "./feedbackTypes";

interface Props {
  id: string;
  isAdmin: boolean;
  onClose: () => void;
  /** Called after anything changed so the list can refresh. */
  onChanged: () => void;
}

const fieldClass =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-focus-ring focus:ring-offset-1";

export function FeedbackDetailDialog({ id, isAdmin, onClose, onChanged }: Props) {
  const [item, setItem] = useState<FeedbackItem | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>("NEW");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = (data: FeedbackItem) => {
    setItem(data);
    setStatus(data.status);
    setNote(data.adminNote ?? "");
  };

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<FeedbackItem>(`/feedback/${id}`)
      .then(({ data }) => !cancelled && apply(data))
      .catch(() => {
        toast.error("Could not load this feedback");
        onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const { data } = await apiClient.patch<FeedbackItem>(`/feedback/${id}`, { status, adminNote: note.trim() ? note.trim() : null });
      apply(data);
      toast.success("Saved");
    }, "Could not save");

  const toggleArchive = () =>
    run(async () => {
      const { data } = await apiClient.patch<FeedbackItem>(`/feedback/${id}`, { archived: !item?.archivedAt });
      apply(data);
      toast.success(data.archivedAt ? "Archived" : "Restored");
    }, "Could not update");

  const removePicture = (imageId: string) =>
    run(async () => {
      await apiClient.delete(`/feedback/images/${imageId}`);
      forgetFeedbackImage(imageId);
      const { data } = await apiClient.get<FeedbackItem>(`/feedback/${id}`);
      apply(data);
      toast.success("Picture deleted");
    }, "Could not delete the picture");

  const removeAllPictures = () =>
    run(async () => {
      item?.images?.forEach((i) => forgetFeedbackImage(i.id));
      await apiClient.delete(`/feedback/${id}/images`);
      const { data } = await apiClient.get<FeedbackItem>(`/feedback/${id}`);
      apply(data);
      toast.success("Pictures deleted");
    }, "Could not delete the pictures");

  const deleteItem = () =>
    run(async () => {
      await apiClient.delete(`/feedback/${id}`);
      toast.success("Feedback deleted");
      onClose();
    }, "Could not delete");

  const dirty = item != null && (status !== item.status || (note.trim() || null) !== (item.adminNote ?? null));

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content className="!max-w-2xl max-h-[90vh] overflow-y-auto" title={item?.title ?? "Feedback"}>
        {!item ? (
          <div className="flex justify-center py-10" aria-busy="true">
            <Spinner />
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded px-2 py-0.5 font-medium ${STATUS_BADGE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
              <span className={`rounded px-2 py-0.5 font-medium ${TYPE_BADGE[item.type]}`}>{TYPE_LABEL[item.type]}</span>
              <span className="rounded bg-surface-muted px-2 py-0.5 text-foreground-muted">{item.page}</span>
              {item.archivedAt && <span className="rounded bg-surface-muted px-2 py-0.5 text-foreground-muted">Archived</span>}
            </div>
            <p className="text-xs text-foreground-muted">
              {item.user.name}
              {item.user.department ? `, ${item.user.department.code ?? item.user.department.name}` : ""} on{" "}
              {new Date(item.createdAt).toLocaleString()}
            </p>

            <p className="whitespace-pre-wrap text-sm text-foreground">{item.description}</p>

            {item.images && item.images.length > 0 ? (
              <div>
                <h3 className="mb-1 text-xs font-medium text-foreground-muted">Pictures</h3>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {item.images.map((img, i) => (
                    <li key={img.id}>
                      <button
                        type="button"
                        onClick={() => setZoom(img.id)}
                        className="block w-full overflow-hidden rounded border border-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                        aria-label={`Enlarge picture ${i + 1}`}
                      >
                        <FeedbackImage id={img.id} alt={`Picture ${i + 1} of ${item.title}`} className="h-28 w-full object-cover" />
                      </button>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-foreground-muted">
                        <span>{formatBytes(img.size)}</span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => removePicture(img.id)}
                            disabled={busy}
                            className="rounded px-1 text-danger hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring"
                            aria-label={`Delete picture ${i + 1}`}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-foreground-muted">No pictures attached.</p>
            )}

            {isAdmin ? (
              <div className="space-y-3 rounded border border-border bg-surface-muted/40 p-3">
                <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                  <div>
                    <label htmlFor="fb-status" className="mb-1 block text-xs font-medium text-foreground-muted">Status</label>
                    <select id="fb-status" value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)} className={fieldClass} disabled={busy}>
                      {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="fb-note" className="mb-1 block text-xs font-medium text-foreground-muted">Note for everyone</label>
                    <textarea id="fb-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={fieldClass} disabled={busy} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={save} disabled={busy || !dirty}>Save</Button>
                  <Button size="sm" variant="secondary" onClick={toggleArchive} disabled={busy}>
                    {item.archivedAt ? "Restore" : "Archive"}
                  </Button>
                  {item.images && item.images.length > 0 && (
                    <Button size="sm" variant="dangerOutline" onClick={removeAllPictures} disabled={busy}>Delete all pictures</Button>
                  )}
                  <span className="flex-1" />
                  {confirmDelete ? (
                    <>
                      <span className="text-xs text-foreground-muted">Delete this feedback?</span>
                      <Button size="sm" variant="danger" onClick={deleteItem} disabled={busy}>Yes, delete</Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="dangerOutline" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete feedback</Button>
                  )}
                </div>
              </div>
            ) : (
              item.adminNote && (
                <div className="rounded border border-border bg-surface-muted/40 p-3">
                  <h3 className="mb-1 text-xs font-medium text-foreground-muted">Note from the administrator</h3>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{item.adminNote}</p>
                </div>
              )
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </Dialog.Content>

      {zoom && (
        <Dialog.Root open onOpenChange={(open) => !open && setZoom(null)}>
          <Dialog.Content className="!max-w-5xl max-h-[92vh] overflow-auto !p-3" title="Picture">
            <FeedbackImage id={zoom} alt="Enlarged picture" className="mt-2 max-h-[80vh] w-full object-contain" />
          </Dialog.Content>
        </Dialog.Root>
      )}
    </Dialog.Root>
  );
}
