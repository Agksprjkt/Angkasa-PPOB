'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { cn } from '@/lib/utils';

const Drawer = DrawerPrimitive.Root;
const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop className="fixed inset-0 z-[70] bg-slate-950/55 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DrawerPrimitive.Popup
        className={cn(
          'fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-slate-200 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none transition-transform duration-300 data-ending-style:translate-y-full data-starting-style:translate-y-full',
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-slate-300" />
        {children}
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b border-slate-100 px-5 pb-4 pt-3', className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn('text-lg font-bold text-slate-900', className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn('mt-1 text-xs text-slate-500', className)}
      {...props}
    />
  );
}

function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex gap-3 border-t border-slate-200 bg-white px-5 py-4', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
};
