import React, { useState, useEffect } from "react";
import { Info, X } from "lucide-react";
import { PAGE_HINTS } from "@/lib/helpContent";

// Einblendbarer Hinweis-Banner am Seitenanfang.
// Wird pro Seite einmal angezeigt und nach Schließen nicht wieder eingeblendet
// (Zustand in localStorage).
export default function PageHint({ pageKey }) {
  const hint = PAGE_HINTS[pageKey];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const key = `fernwerk_hint_dismissed_${pageKey}`;
    const dismissed = localStorage.getItem(key) === "true";
    setVisible(!dismissed);
  }, [pageKey, hint]);

  if (!hint || !visible) return null;

  function dismiss() {
    localStorage.setItem(`fernwerk_hint_dismissed_${pageKey}`, "true");
    setVisible(false);
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-lime/5 border border-lime/15 px-3.5 py-2.5">
      <Info className="w-4 h-4 text-lime/70 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-foreground/90">{hint.title}: </span>
        <span className="text-xs text-muted-foreground">{hint.text}</span>
      </div>
      <button
        onClick={dismiss}
        className="text-muted-foreground/50 hover:text-foreground transition shrink-0"
        aria-label="Hinweis schließen"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}