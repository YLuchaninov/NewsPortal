import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
  return (
    <AlertDialog>
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
        <form method="post" action={action} className="space-y-4">
          {fields.map((field) => (
            <input
              key={`${field.name}-${String(field.value)}`}
              type="hidden"
              name={field.name}
              value={String(field.value)}
            />
          ))}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <button
                type="submit"
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90",
                  confirmClassName
                )}
              >
                {confirmLabel}
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
