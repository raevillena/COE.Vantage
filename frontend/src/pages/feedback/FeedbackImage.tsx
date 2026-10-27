import { useEffect, useState } from "react";
import { apiClient } from "../../api/apiClient";

/** Cache of object URLs so reopening a dialog does not download the picture again. */
const cache = new Map<string, string>();

/** Pictures need the session, so they are fetched through the API client rather than an img src URL. */
export function FeedbackImage({ id, alt, className = "" }: { id: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(cache.get(id) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache.has(id)) {
      setSrc(cache.get(id)!);
      return;
    }
    let cancelled = false;
    apiClient
      .get<Blob>(`/feedback/images/${id}`, { responseType: "blob" })
      .then(({ data }) => {
        const url = URL.createObjectURL(data);
        cache.set(id, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed) return <div className={`flex items-center justify-center bg-surface-muted text-xs text-foreground-muted ${className}`}>Unavailable</div>;
  if (!src) return <div className={`animate-pulse bg-surface-muted ${className}`} aria-hidden />;
  return <img src={src} alt={alt} className={className} />;
}

export function forgetFeedbackImage(id: string) {
  const url = cache.get(id);
  if (url) URL.revokeObjectURL(url);
  cache.delete(id);
}
