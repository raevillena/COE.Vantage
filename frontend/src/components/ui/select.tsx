import * as SelectPrimitive from "@radix-ui/react-select";
import * as React from "react";

const Root = SelectPrimitive.Root;
const Group = SelectPrimitive.Group;
const Value = SelectPrimitive.Value;

const Trigger = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className = "", children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={`inline-flex h-10 w-full items-center justify-between rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-foreground-muted ${className}`}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <span className="ml-2 shrink-0 opacity-60" aria-hidden>▼</span>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
Trigger.displayName = "SelectTrigger";

const Content = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className = "", children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={`relative z-50 max-h-60 min-w-[8rem] overflow-hidden rounded border border-border bg-surface shadow-md data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1 ${className}`}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={position === "popper" ? "p-1" : ""}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
Content.displayName = "SelectContent";

const Item = React.forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = "", children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={`relative flex w-full cursor-default select-none items-center rounded py-2 pl-3 pr-8 text-sm outline-none focus:bg-surface-hover focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
      ✓
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
Item.displayName = "SelectItem";

export const Select = {
  Root,
  Group,
  Value,
  Trigger,
  Content,
  Item,
  Label: SelectPrimitive.Label,
};
