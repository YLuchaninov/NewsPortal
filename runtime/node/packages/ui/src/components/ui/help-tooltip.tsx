import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { cn } from "../../lib/utils";

interface HelpTooltipProps {
  text: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  /** Wider max width for longer explanations */
  wide?: boolean;
}
export function HelpTooltip({ text, side = "top", className, wide = false }: HelpTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full",
              "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "text-[10px] font-medium leading-none shrink-0",
              className
            )}
            aria-label="Help"
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className={cn(
            "max-w-[280px] text-xs leading-relaxed font-normal",
            wide && "max-w-[380px]"
          )}
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
