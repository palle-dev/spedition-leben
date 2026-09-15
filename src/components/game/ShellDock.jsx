import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, dayOf, clockOf } from "@/lib/gameData";
import { getNextEvent } from "@/lib/displayHelpers";
import { Building2, Package, Map, Truck, Users, Wallet, Home as HomeIcon, BookOpen, Play, Clock, SkipForward, MoreHorizontal, Trophy, Mail as MailIcon, LineChart, Network, Calendar } from "lucide-react";
import AdvanceProgressModal from "@/components/game/AdvanceProgressModal";

const PRIMARY_NAV = [
  { to: "/", label: "Büro", icon: Building2 },
  { to: "/auftraege", label: "Aufträge", icon: Package },
  { to: "/disposition", label: "Dispo", icon: Map },
  { to: "/zuhause", label: "Zuhause", icon: HomeIcon }
];
const SECONDARY_NAV = [
  { to: "/fuhrpark", label: "Fuhrpark", icon: Truck },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/filialen", label: "Filialen", icon: Network },
  { to: "/finanzen", label: "Finanzen", icon: Wallet },
  { to: "/investment", label: "Investment", icon: LineChart },
  { to: "/postfach", label: "Postfach", icon: MailIcon },
  { to: "/erfolge", label: "Erfolge", icon: Trophy },
  { to: "/journal", label: "Journal", icon: BookOpen }
];
const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

// Untere Navigationsleiste und Zeitsteuerung – dauerhaft sichtbar.
export default function ShellDock() {
  const { state, displayGameTime, send, showToast, busy } = useGame();
  const location = useLocation();
  const [advancing, setAdvancing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [progressModal, setProgressModal] = useState(null);
  const moreRef = useRef(null);

  const nextEvent = getNextEvent(state);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  async function advance(minutes) {
    setAdvancing(true);
    setProgressModal({ current: 0, total: minutes, events: [], eventCount: 0, done: false, status: "Verarbeite…" });
    try {
      const res = await send("advanceTime", { minutes }, (progress) => {
        setProgressModal(prev => prev ? ({
          ...prev,
          current: progress.current,
          eventCount: progress.eventCount,
          status: `${progress.eventCount} Vorgänge verarbeitet…`,
        }) : prev);
      });
      const events = res?.events || [];
      setProgressModal(prev => prev ? ({
        ...prev,
        current: minutes,
        events,
        done: true,
        status: "Abgeschlossen",
      }) : prev);
      summarizeEvents(events);
    } catch (e) {
      showToast(e.message, "error");
      setProgressModal(prev => prev ? { ...prev, done: true, error: true, status: "Fehler: " + e.message } : prev);
    } finally {
      setAdvancing(false);
    }
  }

  async function nextEventAction() {
    setAdvancing(true);
    try {
      const res = await send("advanceToNextEvent", {});
      if (res?.stopped === "decision_required") showToast(res.message, "info");
      else summarizeEvents(res.events);
    } catch (e) { showToast(e.message, "error"); }
    finally { setAdvancing(false); }
  }

  function summarizeEvents(events) {
    if (!events || events.length === 0) return;
    const deliveries = events.filter(e => e.type === "delivery");
    const accounting = events.filter(e => e.type === "daily_accounting");
    const invites = events.filter(e => e.type === "invitation_appeared");
    const missed = events.filter(e => e.type === "invitation_missed");
    const parts = [];
    if (deliveries.length) {
      const total = deliveries.reduce((s, e) => s + (e.paymentCents || 0), 0);
      parts.push(`${deliveries.length} Lieferung${deliveries.length > 1 ? "en" : ""} abgeschlossen (${(total / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €)`);
    }
    if (accounting.length) parts.push("Tagesabrechnung durchgeführt");
    if (invites.length) parts.push("Neue private Einladung erschienen");
    if (missed.length) parts.push("Einladung verpasst");
    if (parts.length === 0 && events.length > 0) parts.push("Zeit fortgesetzt");
    showToast(parts.join(" · "), deliveries.length ? "success" : "info");
  }

  const disabled = busy || advancing;

  return (
    <footer className="relative z-20 border-t border-white/10 backdrop-blur-md bg-ink/70 shrink-0">
      <div className="flex items-center gap-2 lg:gap-4 px-3 lg:px-12 py-2.5">
        {/* Navigation – Desktop: alle, Mobile: primär + Mehr */}
        <nav className="flex items-center gap-1 flex-1 min-w-0" aria-label="Spielnavigation">
          {ALL_NAV.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            const isSecondary = SECONDARY_NAV.includes(n);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-lg px-2.5 lg:px-3 py-2 text-xs whitespace-nowrap transition shrink-0 ${active ? "bg-lime/10 text-lime" : "text-muted-foreground hover:text-foreground hover:bg-white/5"} ${isSecondary ? "hidden md:flex" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4" /> <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
          {/* Mehr-Menü für Mobile */}
          <div ref={moreRef} className="relative md:hidden">
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs transition shrink-0 ${moreOpen ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              aria-label="Weitere Bereiche"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Mehr</span>
            </button>
            {moreOpen && (
              <div className="absolute bottom-full mb-2 left-0 glass border border-white/15 rounded-xl p-1.5 shadow-2xl min-w-[160px]">
                {SECONDARY_NAV.map(n => {
                  const active = location.pathname === n.to;
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-lime/10 text-lime" : "text-foreground hover:bg-white/5"}`}
                    >
                      <Icon className="w-4 h-4" /> {n.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Zeitsteuerung */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 border-l border-white/10 pl-2 lg:pl-4">
          <div className="text-right hidden sm:block leading-tight">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Tag {dayOf(displayGameTime || state.gameTime)}</div>
            <div className="text-sm font-medium tabular-nums">{clockOf(displayGameTime || state.gameTime)} Uhr</div>
          </div>
          <div className="text-right sm:hidden leading-tight">
            <div className="text-[9px] text-muted-foreground">T{dayOf(displayGameTime || state.gameTime)}</div>
            <div className="text-xs font-medium tabular-nums">{clockOf(displayGameTime || state.gameTime)}</div>
          </div>
          {nextEvent && (
            <div className="hidden lg:block text-right leading-tight mr-1">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Nächstes</div>
              <div className="text-xs text-lime/80 tabular-nums">{nextEvent.label} · {clockOf(nextEvent.min)}</div>
            </div>
          )}
          <button
            onClick={() => advance(60)}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 transition min-h-[44px]"
            title="1 Stunde weiter"
            aria-label="1 Stunde weiter"
          >
            <Clock className="w-4 h-4" /> <span className="hidden lg:inline">1 Std</span>
          </button>
          <button
            onClick={() => advance(1440)}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 transition min-h-[44px]"
            title="1 Tag weiter"
            aria-label="1 Tag weiter"
          >
            <Calendar className="w-4 h-4" /> <span className="hidden lg:inline">1 Tag</span>
          </button>
          <button
            onClick={nextEventAction}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-3 lg:px-4 py-2 text-xs font-medium bg-lime/15 text-lime border border-lime/30 hover:bg-lime/25 disabled:opacity-40 transition min-h-[44px]"
            title={nextEvent ? `Nächstes: ${nextEvent.label} um ${clockOf(nextEvent.min)} Uhr` : "Zum nächsten Ereignis"}
            aria-label="Zum nächsten Ereignis"
          >
            {advancing ? <span className="w-4 h-4 border-2 border-lime/30 border-t-lime rounded-full animate-spin" /> : <SkipForward className="w-4 h-4" />}
            <span className="hidden lg:inline">Nächstes Ereignis</span>
          </button>
        </div>
      </div>
      {progressModal && <AdvanceProgressModal progress={progressModal} onClose={() => setProgressModal(null)} />}
    </footer>
  );
}