import { useBlobUrl } from "../../hooks/useBlobUrl";

interface CollegePictureProps {
  id: string;
  name: string;
  code?: string | null;
  /** Changes when the picture does; null/undefined = none, so a tinted block with the code shows. */
  version?: number | null;
  className?: string;
}

/** A college's card picture, filling its box, or a quiet placeholder when it has none. */
export function CollegePicture({ id, name, code, version, className = "" }: CollegePictureProps) {
  const src = useBlobUrl(version ? `/colleges/${id}/image` : null, version);
  if (src) return <img src={src} alt="" className={`object-cover ${className}`} />;
  const initials = (code || name.split(" ").filter((w) => /^[A-Za-z]/.test(w) && w.length > 2).map((w) => w[0]).join("")).slice(0, 4).toUpperCase();
  return (
    <div aria-hidden className={`flex items-center justify-center bg-primary-muted text-primary ${className}`}>
      <span className="text-lg font-semibold tracking-wide opacity-70">{initials || "•"}</span>
    </div>
  );
}
