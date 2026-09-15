import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Bell, X, Check, Calendar, Truck, Package, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatGameTime } from "@/lib/gameData";
import Portrait from "@/components/ui/Portrait";

const ICONS = {
  order_accepted_by_dispatcher: Check,
  tour_planned_by_dispatcher: Calendar,
  tour_started: Truck,
  delivery_completed: Package,
};
const KIND_COLOR = {
  order_accepted_by_dispatcher: "text-lime",
  tour_planned_by_dispatcher: "text-foreground",
  tour_started: "text-foreground",
  delivery_completed: "text-lime",
};

export default function NotificationCenter({ notifications, unseenCount, onMarkAllSeen, onDismiss, onClearAll }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleAction = (n) => {
    if (n.action?.targetType === "order") navigate("/auftraege");
    else if (n.action?.targetType === "dispatch") navigate("/disposition");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open && unseenCount > 0) onMarkAllSeen(); }}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 transition active:scale-95"
        aria-label={`Benachrichtigungen${unseenCount > 0 ? " (${unseenCount} ungelesen)" : ""}`}
      >
        <Bell className="w-4 h-4" />
        {unseenCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-ink text-[10px] font-bold flex items-center justify-center">
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute right-0 top-12 w-80 sm:w-96 glass border border-white/10 rounded-xl shadow-2xl z-50 max-h-[70vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <span className="text-sm font-semibold">Benachrichtigungen</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition p-1 -m-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto scrollbar-none flex-1">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Keine Benachrichtigungen
                </div>
              ) : (
                notifications.map(n => {
                  const Icon = ICONS[n.type] || Info;
                  return (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 transition cursor-pointer ${!n.seen ? "bg-lime/5" : ""}`}
                      onClick={() => handleAction(n)}
                    >
                      <div className="flex items-start gap-2.5">
                        {n.portraitId && !n.isSystem ? (
                          <Portrait personId={n.portraitId} name={n.employeeName} size="sm" />
                        ) : (
                          <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${KIND_COLOR[n.type] || "text-foreground"}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{n.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>
                          <div className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-2">
                            <span>{n.gameTimeFormatted}</span>
                            {n.employeeName && !n.isSystem && <span>· {n.employeeName}</span>}
                          </div>
                        </div>
                        {onDismiss && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                            className="w-6 h-6 grid place-items-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                            title="Löschen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {notifications.length > 0 && onClearAll && (
              <div className="px-4 py-2.5 border-t border-white/10 shrink-0">
                <button
                  onClick={onClearAll}
                  className="text-xs text-muted-foreground hover:text-destructive transition"
                >
                  Alle löschen
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}