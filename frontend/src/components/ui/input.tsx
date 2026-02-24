import * as React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, ...props }, ref) => (
    <input
      ref={ref}
      className={`block w-full rounded border px-3 py-2 text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-offset-0 disabled:opacity-50 ${
        error ? "border-danger focus:ring-danger" : "border-border-strong focus:ring-focus-ring"
      } ${className}`}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
