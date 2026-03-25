import * as React from "react";
import { Label } from "./label";
import { HelpTooltip } from "./help-tooltip";
import { cn } from "../../lib/utils";

interface FormFieldProps {
  label: string;
  name?: string;
  helpText?: string;
  helpSide?: "top" | "right" | "bottom" | "left";
  helpWide?: boolean;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}
export function FormField({
  label,
  name,
  helpText,
  helpSide = "top",
  helpWide = false,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={name} className="text-xs font-medium">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        {helpText && (
          <HelpTooltip text={helpText} side={helpSide} wide={helpWide} />
        )}
      </div>
      {children}
      {error && (
        <p className="text-[11px] text-red-500 leading-tight">{error}</p>
      )}
    </div>
  );
}
