import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wide?: boolean;
  drawer?: boolean;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  wide = false,
  drawer = false,
  children,
}) => {
  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-50 flex bg-slate-950/60 backdrop-blur-sm animate-fadeIn ${
      drawer
        ? 'items-end justify-center p-0 sm:p-4'
        : 'items-center justify-center p-4'
    }`}>
      <div
        className="fixed inset-0"
        onClick={() => onOpenChange(false)}
      />
      <div className={`relative z-10 w-full ${
        drawer ? 'max-w-xl' : wide ? 'max-w-4xl' : 'max-w-lg'
      }`}>
        {children}
      </div>
    </div>
  );
};

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }
>(({ className, children, onClose, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl duration-200 overflow-hidden max-h-[90vh] flex flex-col",
      className
    )}
    {...props}
  >
    {children}
    {onClose && (
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Tutup</span>
      </button>
    )}
  </div>
));
DialogContent.displayName = "DialogContent";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-left mb-4 pb-3 border-b border-slate-100",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4 border-t border-slate-100 mt-4",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-semibold leading-none tracking-tight text-slate-900",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs sm:text-sm text-slate-500 mt-1", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
