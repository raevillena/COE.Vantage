import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";

const Root = DropdownMenuPrimitive.Root;
const Trigger = DropdownMenuPrimitive.Trigger;
const Group = DropdownMenuPrimitive.Group;
const Separator = DropdownMenuPrimitive.Separator;

const Content = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className = "", sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-50 min-w-[10rem] overflow-hidden rounded border border-border bg-surface p-1 text-foreground shadow-lg ${className}`}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
Content.displayName = "DropdownMenuContent";

const Item = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className = "", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={`relative flex cursor-default select-none items-center rounded px-2 py-1.5 text-sm text-foreground outline-none focus:bg-surface-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
    {...props}
  />
));
Item.displayName = "DropdownMenuItem";

export const DropdownMenu = {
  Root,
  Trigger,
  Content,
  Item,
  Group,
  Separator,
  Label: DropdownMenuPrimitive.Label,
};
