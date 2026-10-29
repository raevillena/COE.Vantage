import * as React from "react";

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "children"> {
  /** Accessible name and the first line of the tooltip. */
  label: string;
  /** Optional second line of the tooltip. */
  hint?: string;
  children: React.ReactNode;
}

/**
 * A square icon-only button with a tooltip that appears on hover and keyboard focus. The tooltip lines up with the button's right edge, since these sit at the end of a toolbar. The label is also its accessible name,
 * so screen readers and tests find it by that text.
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, hint, className = "", type = "button", children, ...props },
  ref
) {
  return (
    <span className="group relative inline-flex">
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={`inline-flex h-[38px] w-[38px] items-center justify-center rounded border border-border-strong bg-surface text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-40 mb-2 w-max max-w-[16rem] rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs font-medium text-surface opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
        {hint && <span className="mt-0.5 block font-normal opacity-80">{hint}</span>}
      </span>
    </span>
  );
});
