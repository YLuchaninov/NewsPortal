import * as React from "react";
import { cn } from "../../lib/utils";

type InfoCalloutVariant = "info" | "tip" | "warning";

const variantStyles: Record<InfoCalloutVariant, { container: string; icon: string; iconPath: string }> = {
  info: {
    container: "border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20",
    icon: "text-blue-500 dark:text-blue-400",
    iconPath: "M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  },
  tip: {
    container: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20",
    icon: "text-emerald-500 dark:text-emerald-400",
    iconPath: "M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7ZM10 21h4",
  },
  warning: {
    container: "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20",
    icon: "text-amber-500 dark:text-amber-400",
    iconPath: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
  },
};

interface InfoCalloutProps {
  variant?: InfoCalloutVariant;
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}
export function InfoCallout({
  variant = "info",
  title,
  collapsible = false,
  defaultOpen = false,
  className,
  children,
}: InfoCalloutProps) {
  const [open, setOpen] = React.useState(!collapsible || defaultOpen);
  const styles = variantStyles[variant];

  return (
    <div className={cn("rounded-lg border p-3", styles.container, className)}>
      <div
        className={cn(
          "flex items-start gap-2",
          collapsible && "cursor-pointer select-none"
        )}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
        } : undefined}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("shrink-0 mt-0.5", styles.icon)}
        >
          <path d={styles.iconPath} />
        </svg>
        <div className="flex-1 min-w-0">
          {title && (
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium leading-tight">{title}</p>
              {collapsible && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn(
                    "shrink-0 text-muted-foreground transition-transform duration-200",
                    open && "rotate-180"
                  )}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </div>
          )}
          {open && (
            <div className={cn("text-sm text-muted-foreground", title && "mt-1")}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
