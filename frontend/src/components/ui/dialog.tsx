import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

const Root = DialogPrimitive.Root;
const Trigger = DialogPrimitive.Trigger;
const Close = DialogPrimitive.Close;

const Portal = DialogPrimitive.Portal;

const Overlay = React.forwardRef(function DialogOverlay(
  { className = "", ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>,
  ref: React.Ref<React.ComponentRef<typeof DialogPrimitive.Overlay>>
) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`fixed inset-0 z-50 bg-foreground/50 ${className}`}
      {...props}
    />
  );
});
Overlay.displayName = "DialogOverlay";

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title?: string;
  description?: string;
};

const noDescriptionProps = { "aria-describedby": undefined } as const;

const Content = React.forwardRef(function DialogContentInner(
  { className = "", title, description, children, ...props }: ContentProps,
  ref: React.Ref<React.ComponentRef<typeof DialogPrimitive.Content>>
) {
  return (
    <Portal>
      <Overlay />
      <DialogPrimitive.Content
        ref={ref}
        className={`fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-xl focus:outline-none ${className}`}
        {...props}
        {...(description == null ? noDescriptionProps : {})}
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
  );
});
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
