import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "emerald";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    let variantStyles = "bg-slate-900 text-white hover:bg-slate-800 shadow-sm";
    if (variant === "destructive") {
      variantStyles = "bg-rose-600 text-white hover:bg-rose-700 shadow-sm";
    } else if (variant === "outline") {
      variantStyles =
        "border border-slate-200 bg-white text-slate-800 hover:bg-slate-100 hover:text-slate-900";
    } else if (variant === "secondary") {
      variantStyles = "bg-slate-100 text-slate-900 hover:bg-slate-200";
    } else if (variant === "ghost") {
      variantStyles = "hover:bg-slate-100 hover:text-slate-900 text-slate-600";
    } else if (variant === "link") {
      variantStyles = "text-blue-600 underline-offset-4 hover:underline p-0 h-auto";
    } else if (variant === "emerald") {
      variantStyles = "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm";
    }

    let sizeStyles = "h-9 px-4 py-2";
    if (size === "sm") sizeStyles = "h-8 rounded-lg px-3 text-xs";
    if (size === "lg") sizeStyles = "h-11 rounded-xl px-8 text-base";
    if (size === "icon") sizeStyles = "h-9 w-9 p-0";

    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
          variantStyles,
          sizeStyles,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
