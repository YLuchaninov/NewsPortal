import * as React from "react";
import { cn } from "../../lib/utils";

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
}

function Collapsible({ defaultOpen = false, className, children, ...props }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("group", className)} data-state={open ? "open" : "closed"} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement<{ onToggle?: () => void; open?: boolean }>(child)) {
          if (child.type === CollapsibleTrigger) {
            return React.cloneElement(child, { onToggle: () => setOpen((o) => !o), open });
          }
          if (child.type === CollapsibleContent) {
            return React.cloneElement(child, { open });
          }
        }
        return child;
      })}
    </div>
  );
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onToggle?: () => void;
  open?: boolean;
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ className, children, onToggle, open, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      className={cn("flex items-center gap-1.5 text-sm", className)}
      aria-expanded={open}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("shrink-0 transition-transform duration-200", open && "rotate-90")}
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
      {children}
    </button>
  )
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
}

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, children, open, ...props }, ref) => {
    if (!open) return null;
    return (
      <div
        ref={ref}
        className={cn("animate-in fade-in-0 slide-in-from-top-1 duration-200", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
