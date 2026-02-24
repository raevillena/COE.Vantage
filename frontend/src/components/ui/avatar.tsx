import * as AvatarPrimitive from "@radix-ui/react-avatar";

export function Avatar({
  className = "",
  name,
  src,
}: {
  className?: string;
  name: string;
  src?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <AvatarPrimitive.Root
      className={`inline-flex h-9 w-9 select-none items-center justify-center overflow-hidden rounded-full bg-primary-muted text-primary ${className}`}
    >
      <AvatarPrimitive.Image src={src ?? undefined} alt={name} className="h-full w-full object-cover" />
      <AvatarPrimitive.Fallback className="text-xs font-medium" delayMs={0}>
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
