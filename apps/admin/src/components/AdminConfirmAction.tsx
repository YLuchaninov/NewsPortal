import * as React from "react";

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

interface HiddenField {
  name: string;
  value: string | number | boolean;
}

interface AdminConfirmActionProps {
  action: string;
  title: string;
  description: string;
  triggerLabel: string;
  confirmLabel: string;
  fields?: HiddenField[];
  triggerClassName?: string;
  confirmClassName?: string;
}

function submitHiddenForm(action: string, fields: HiddenField[]): void {
  const form = document.createElement("form");
  form.method = "post";
  form.action = action;
  form.style.display = "none";

  for (const field of fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = field.name;
    input.value = String(field.value);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.submit();
}

export function AdminConfirmAction({
  action,
  title,
  description,
  triggerLabel,
  confirmLabel,
  fields = [],
  triggerClassName,
  confirmClassName,
}: AdminConfirmActionProps) {
  const [open, setOpen] = React.useState(false);

  function handleConfirmClick() {
    setOpen(false);
    submitHiddenForm(action, fields);
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md border border-input px-3 text-xs font-medium transition-colors hover:bg-accent",
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
