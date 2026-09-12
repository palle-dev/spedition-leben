import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { drawerSlide, backdrop } from "@/lib/motion";

// Seitlicher Dialog: gleitet von rechts ein, mit Abdunkelung und
// Fokus-Management. Escape schließt. Bewegung respektiert no-motion.
export default function Drawer({ open, onClose, title, kicker, children, maxWidth = "max-w-md" }) {
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    const timer = setTimeout(() => closeRef.current?.focus(), 120);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(timer);
      document.body.style.overflow = "";
      if (triggerRef.current && document.contains(triggerRef.current)) triggerRef.current.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            {...backdrop}
            onClick={onClose}
          />
          <motion.div
            className={`absolute right-0 top-0 h-full w-full ${maxWidth} glass border-l border-white/10 shadow-2xl overflow-y-auto`}
            {...drawerSlide}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="sticky top-0 z-10 glass border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <div>
                {kicker && <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{kicker}</div>}
                <h2 className="text-xl font-medium tracking-tight text-foreground mt-0.5">{title}</h2>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-white/5 hover:bg-white/10 grid place-items-center text-muted-foreground hover:text-foreground transition shrink-0"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}