import { Avatar } from "./avatar";
import { useBlobUrl } from "../../hooks/useBlobUrl";

interface UserAvatarProps {
  id: string;
  name: string;
  /** Changes when the picture does (null/undefined = none, so initials show). */
  version?: number | null;
  className?: string;
}

/** A person's picture, or their initials when they have none. */
export function UserAvatar({ id, name, version, className }: UserAvatarProps) {
  const src = useBlobUrl(version ? `/users/${id}/avatar` : null, version);
  return <Avatar name={name} src={src} className={className} />;
}
