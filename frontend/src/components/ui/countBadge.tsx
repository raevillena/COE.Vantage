/** The small number pill used for counts of things waiting (sidebar items, tabs). Use `onPrimary` inside a primary-coloured button. */
export function CountBadge({ count, onPrimary = false, label }: { count: number; onPrimary?: boolean; label?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium leading-none ${
        onPrimary ? "bg-surface text-primary" : "bg-primary text-primary-foreground"
      }`}
      aria-label={label ?? `${count} waiting`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
