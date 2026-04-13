import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  buttonVariants,
  cn,
} from "@newsportal/ui";

interface AdminConfirmSubmitButtonProps {
  title: string;
  description: string;
  triggerLabel: string;
  confirmLabel: string;
  triggerClassName?: string;
  confirmClassName?: string;
}

export function AdminConfirmSubmitButton({
  title,
  description,
  triggerLabel,
  confirmLabel,
  triggerClassName,
  confirmClassName,
}: AdminConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function handleConfirmClick() {
    const form = triggerRef.current?.form ?? triggerRef.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    setOpen(false);
    if (typeof form.reportValidity === "function" && !form.reportValidity()) {
      return;
    }
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.submit();
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            triggerClassName
          )}
        >
          {triggerLabel}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
          <button
            type="button"
            onClick={handleConfirmClick}
            className={cn(buttonVariants(), confirmClassName)}
          >
            {confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
