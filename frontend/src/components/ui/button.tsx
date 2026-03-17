import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerOutline";
type ButtonSize = "default" | "sm" | "xs";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-focus-ring",
  secondary: "border border-border bg-surface text-foreground hover:bg-surface-hover focus:ring-focus-ring",
  ghost: "text-foreground hover:bg-surface-hover focus:ring-focus-ring",
  danger: "bg-danger text-white hover:bg-danger-hover focus:ring-danger",
  dangerOutline: "border border-danger text-danger bg-transparent hover:bg-danger/10 focus:ring-danger",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "px-4 py-2 text-sm",
  sm: "px-3 py-1.5 text-sm",
  xs: "px-2 py-1 text-xs",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", className = "", disabled, type = "button", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
