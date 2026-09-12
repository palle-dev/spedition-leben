import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Check, Calendar, Truck, Package, Info, X, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 7000;

const ICONS = { check: Check, calendar: Calendar, truck: Truck, package: Package, info: Info, bell: Bell };
const KIND_STYLES = {
  success: "bg-lime/15 border-lime/40 text-lime",
  info: "bg-surface/90 border-white/20 text-foreground",
  error: "bg-red-500/15 border-red-400/40 text-red-100",
};

export default function ToastStack({ toasts, onDismiss }) {
  const navigate = useNavigate();
  const visible = useMemo(() => toasts.slice(0, MAX_VISIBLE), [toasts]);
  const visibleIds = useMemo(() => new Set(visible.map(t => t.id)), [visible]);
  const overflow = toasts.length - MAX_VISIBLE;
  const pausedRef = useRef(false);
  const timersRef = useRef({});

  const startTimer = useCallback((id, duration) => {
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => onDismiss(id), duration || DEFAULT_DURATION);
  }, [onDismiss]);

  const pauseAll = useCallback(() => {
    pausedRef.current = true;
    for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
  }, []);

  const resumeAll = useCallback(() => {
    pausedRef.current = false;
    for (const t of visible) {
      startTimer(t.id, t.duration || DEFAULT_DURATION);
    }
  }, [visible, startTimer]);

  // Timer für neue Toasts starten, alte Toasts aufräumen — ohne bestehende Timer zurückzusetzen.
  useEffect(() => {
    for (const t of visible) {
      if (!timersRef.current[t.id]) {
        startTimer(t.id, t.duration || DEFAULT_DURATION);
      }
    }
    for (const id of Object.keys(timersRef.current)) {
      if (!visibleIds.has(id)) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    }
  }, [visible, visibleIds, startTimer]);

  // Alle Timer beim Unmount aufräumen.
  useEffect(() => {
    return () => {
      for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
      timersRef.current = {};
    };
  }, []);

  const handleAction = (toast) => {
    if (toast.action?.targetType === "order") navigate("/auftraege");
    else if (toast.action?.targetType === "dispatch") navigate("/disposition");
    onDismiss(toast.id);
  };

  return (
    <div
      className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-96"
      onMouseEnter={pauseAll}
      onMouseLeave={resumeAll}
      onFocus={pauseAll}
      onBlur={resumeAll}
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {overflow > 0 && (
          <motion.div
            key="overflow"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="glass border border-white/10 rounded-xl px-4 py-2 text-xs text-muted-foreground flex items-center gap-2"
          >
            <Bell className="w-3.5 h-3.5" />
            Weitere {overflow} {overflow === 1 ? "Meldung" : "Meldungen"} – im Benachrichtigungszentrum ansehen
          </motion.div>
        )}
        {visible.map(t => {
          const Icon = ICONS[t.icon] || Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ duration: 0.3, ease: EASE }}
              className={`glass border rounded-xl px-4 py-3 shadow-2xl backdrop-blur-lg ${KIND_STYLES[t.kind] || KIND_STYLES.info}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{t.body}</div>
                  {t.action && (
                    <button
                      onClick={() => handleAction(t)}
                      className="mt-2 text-xs font-medium text-lime hover:text-lime/80 transition"
                    >
                      {t.action.label} →
                    </button>
                  )}
                </div>
                <button
                  onClick={() => onDismiss(t.id)}
                  className="shrink-0 text-muted-foreground/50 hover:text-foreground transition p-1 -m-1"
                  aria-label="Meldung schließen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}