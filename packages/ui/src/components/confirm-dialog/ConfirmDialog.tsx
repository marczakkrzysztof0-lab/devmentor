"use client";

import { AlertDialog } from "radix-ui";
import { useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { Button } from "../button/Button";

export type ConfirmDialogProps = {
  /** The control that opens the dialog, e.g. <Button>Odrzucam</Button>. Omit when you control `open`. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The question, naming the object: „Odrzucić pytanie Kuby?” */
  title: ReactNode;
  /** The consequence in one or two sentences: „Odrzucenie zwraca pieniądze deweloperowi.” */
  description: ReactNode;
  /** Verb + object for the irreversible action: „Odrzucam pytanie”. Never „OK”. */
  confirmLabel: string;
  /** Easy way back; default „Wróć”. */
  cancelLabel?: string;
  /** Runs the action. Keep the dialog open while it runs (`loading`) and close it when it resolves. */
  onConfirm: () => void;
  /** The action is in progress: confirm shows a spinner, both buttons ignore clicks. */
  loading?: boolean;
};

/** Asks once before an action that cannot be undone, and says what will happen. */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Wróć",
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (loading && !next) return; // never close while the action runs
    onOpenChange?.(next);
    if (open === undefined) setInnerOpen(next);
  };
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger ? <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger> : null}
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-surface-scrim",
            "transition-opacity duration-(--ds-duration-dialog) ease-standard starting:opacity-0",
          )}
        />
        <div className="fixed inset-0 z-50 flex items-center justify-center px-page-gutter">
        <AlertDialog.Content
          className={cn(
            "flex w-full max-w-text flex-col gap-between-groups",
            "rounded-control border border-control bg-surface-panel p-between-groups font-ui text-primary",
            "transition-opacity duration-(--ds-duration-dialog) ease-standard starting:opacity-0",
          )}
        >
          <div className="flex flex-col gap-in-group">
            <AlertDialog.Title className="text-heading-section font-strong">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-body">{description}</AlertDialog.Description>
          </div>
          <div className="flex flex-wrap-reverse justify-end gap-in-group">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="primary"
              loading={loading}
              onClick={() => {
                onConfirm();
                // Uncontrolled dialogs close at once; controlled ones close when the caller says so.
                if (open === undefined) setInnerOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
        </div>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
