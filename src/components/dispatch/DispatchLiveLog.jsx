import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Check, Calendar, Truck, Package, Info, ChevronDown } from "lucide-react";
import { formatGameTime } from "@/lib/gameData";
import { eventToLogLabel, DISPATCH_LOG_TYPES } from "@/lib/eventNotifications";
import Portrait from "@/components/ui/Portrait";

const ICONS = {
  order_accepted_by_dispatcher: Check,
  tour_planned_by_dispatcher: Calendar,
  tour_started: Truck,
  delivery_completed: Package,
};

export default function DispatchLiveLog({ events, onJumpToLatest }) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const lastSeenSeqRef = useRef(0);

  const logEvents = useMemo(() => {
    return (events || [])
      .filter(e => DISPATCH_LOG_TYPES.includes(e.type))
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 30);
  }, [events]);

  // Track new events while user is scrolled up
  useEffect(() => {
    if (logEvents.length === 0) return;
    const latestSeq = logEvents[0].seq;
    if (latestSeq > lastSeenSeqRef.current && !autoScroll) {
      setNewCount(c => c + 1);
    }
    lastSeenSeqRef.current = latestSeq;
  }, [logEvents, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop <= 4; // scrolled to top (reverse list)
    setAutoScroll(atBottom);
    if (atBottom) setNewCount(0);
  };

  const jumpToLatest = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setNewCount(0);
    setAutoScroll(true);
    if (onJumpToLatest) onJumpToLatest();
  };

  if (logEvents.length === 0) return null;

  return (
    <div className="glass border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-lime animate-pulse" />
          Live-Verlauf
          <span className="text-xs text-muted-foreground">({logEvents.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); jumpToLatest(); }}
              className="text-xs px-2 py-0.5 rounded-full bg-lime/15 text-lime cursor-pointer hover:bg-lime/25 transition"
            >
              {newCount} neue Meldungen ↓
            </span>
          )}
          <Info className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-180"}`} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="max-h-64 overflow-y-auto scrollbar-none"
            >
              <div className="divide-y divide-white/5">
                {logEvents.map(ev => {
                  const Icon = ICONS[ev.type] || Info;
                  return (
                    <div key={ev.id} className="px-4 py-2.5 flex items-start gap-2.5 hover:bg-white/5 transition">
                      {ev.portraitId && !ev.isSystem ? (
                        <Portrait personId={ev.portraitId} name={ev.employeeName} size="sm" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-foreground/70" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground/90">{eventToLogLabel(ev)}</div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {formatGameTime(ev.gameTime)}
                          {ev.employeeName && !ev.isSystem && ` · ${ev.employeeName}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}