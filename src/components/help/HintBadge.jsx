import React, { useState, useRef, useEffect } from "react";
import { Info, X } from "lucide-react";

// Kleines Hinweis-Badge (ⓘ) für kontextsensitive Erklärungen.
// Klick öffnet ein Popover mit Titel und Text. Klick außerhalb schließt.
export default function HintBadge({ text, title, placement = "bottom" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!text) return null;

  const posClass = placement === "top"
    ? "bottom-full mb-2"
    : placement === "right"
    ? "left-full ml-2 top-0"
    : "top-full mt-2 left-0";

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="grid place-items-center w-5 h-5 rounded-full text-muted-foreground/50 hover:text-lime hover:bg-lime/10 transition"
        aria-label={title ? `Hinweis: ${title}` : "Hinweis"}
        aria-expanded={open}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className={`absolute z-50 ${posClass} w-64 glass border border-white/15 rounded-xl p-3 shadow-2xl`}>
          {title && (
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-xs font-semibold text-foreground">{title}</div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground/50 hover:text-foreground transition shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}