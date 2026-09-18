"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/** @param {React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Root>} props */
const Drawer = ({
  shouldScaleBackground = true,
  ...props
}) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>} props */ ({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props} />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>} props */ ({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
        className
      )}
      {...props}>
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

/** @param {React.ComponentPropsWithoutRef<'div'>} props */
const DrawerHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props} />
)
DrawerHeader.displayName = "DrawerHeader"

/** @param {React.ComponentPropsWithoutRef<'div'>} props */
const DrawerFooter = ({
  className,
  ...props
}) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>} props */ ({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef(/** @param {React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>} props */ ({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

/**
 * @param {{open: boolean, onClose: () => void, title: import('react').ReactNode,
 * kicker?: import('react').ReactNode, maxWidth?: string, children?: import('react').ReactNode}} props
 */
function AppDrawer({ open, onClose, title, kicker, maxWidth = "max-w-lg", children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn("fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/10 bg-surface text-foreground shadow-2xl", maxWidth)}>
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div>
              {kicker && <p className="text-xs text-muted-foreground mb-1">{kicker}</p>}
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close aria-label="Schließen" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default AppDrawer;
export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}