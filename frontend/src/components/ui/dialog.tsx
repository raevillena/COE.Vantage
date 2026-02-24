import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

const Root = DialogPrimitive.Root;
const Trigger = DialogPrimitive.Trigger;
const Close = DialogPrimitive.Close;

const Portal = DialogPrimitive.Portal;

const Overlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className = "", ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={`fixed inset-0 z-50 bg-foreground/50 ${className}`}
    {...props}
  />
));
Overlay.displayName = "DialogOverlay";

const Content = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title?: string;
    description?: string;
  }
>(({ className = "", title, description, children, ...props }, ref) => (
  <Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={`fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-xl focus:outline-none ${className}`}
      {...props}
    >
      {title && (
        <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
          {title}
        </DialogPrimitive.Title>
      )}
      {description && (
        <DialogPrimitive.Description className="mt-1 text-sm text-foreground-muted">
          {description}
        </DialogPrimitive.Description>
      )}
      {children}
    </DialogPrimitive.Content>
  </Portal>
));
Content.displayName = "DialogContent";

export const Dialog = {
  Root,
  Trigger,
  Close,
  Portal,
  Overlay,
  Content,
  Title: DialogPrimitive.Title,
  Description: DialogPrimitive.Description,
};
