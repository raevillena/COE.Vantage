/** Simple spinner for loading states. Use with aria-label for accessibility. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
