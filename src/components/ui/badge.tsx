import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning"
    | "blue";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  let variantStyles = "bg-slate-900 text-slate-50";
  if (variant === "secondary") {
    variantStyles = "bg-slate-100 text-slate-900";
  } else if (variant === "destructive") {
    variantStyles = "bg-rose-100 text-rose-800 border-rose-200";
  } else if (variant === "outline") {
    variantStyles = "border border-slate-200 text-slate-900";
  } else if (variant === "success") {
    variantStyles = "bg-emerald-100 text-emerald-800 border-emerald-200";
  } else if (variant === "warning") {
    variantStyles = "bg-amber-100 text-amber-800 border-amber-200";
  } else if (variant === "blue") {
    variantStyles = "bg-blue-100 text-blue-800 border-blue-200";
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2",
        variantStyles,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
