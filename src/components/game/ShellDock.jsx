import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import DockClock from "@/components/game/DockClock";
import { Building2, Package, Map, Truck, Users, Wallet, BookOpen, Clock, MoreHorizontal, Trophy, Network, Calendar, Loader2, BarChart3, Gauge, UserCircle, Shield, Briefcase } from "lucide-react";
import AdvanceProgressModal from "@/components/game/AdvanceProgressModal";
import DiagPanel from "@/components/game/DiagPanel";

const PRIMARY_NAV = [
  { to: "/", label: "Büro", icon: Building2 },
  { to: "/auftraege", label: "Aufträge", icon: Package },
  { to: "/disposition", label: "Dispo", icon: Map },
];
const QUICK_NAV = [
  { to: "/fuhrpark", label: "Fuhrpark", icon: Truck },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/finanzen", label: "Finanzen", icon: Wallet },
  { to: "/kunden", label: "Kunden", icon: UserCircle },
  { to: "/filialen", label: "Filialen", icon: Network },
];
const MORE_NAV = [
  { to: "/netzwerk", label: "Netzkarte", icon: Network },
  { to: "/fuehrung", label: "Führung", icon: Shield },
  { to: "/geschaeftsmodelle", label: "Geschäftsmodelle", icon: Briefcase },
  { to: "/auslastung", label: "Auslastung", icon: BarChart3 },
  { to: "/effizienz", label: "Effizienz", icon: Gauge },
  { to: "/erfolge", label: "Erfolge", icon: Trophy },
  { to: "/journal", label: "Journal", icon: BookOpen }
];


// Untere Navigationsleiste und Zeitsteuerung – dauerhaft sichtbar.
export default function ShellDock() {
  const { state, send, showToast, busy, backgroundAdvance, startBackgroundAdvance, dismissBackgroundAdvanceResult } = useGame();
  const location = useLocation();
  const [advancing, setAdvancing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const moreRef = useRef(null);

  // Entwickler-Diagnose: Strg+Umschalt+D öffnet das Diag-Panel
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDiagOpen(v => !v);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const bgActive = !!backgroundAdvance?.active;
  const bgProgress = backgroundAdvance?.progress;
  const bgPct = bgProgress && bgProgress.total > 0 ? Math.min(100, Math.round((bgProgress.current / bgProgress.total) * 100)) : 0;

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  // 1-Stunden-Vorlauf: schnell, blockiert kurz (kein Modal).
  async function advanceHour() {
    setAdvancing(true);
    try {
      const res = await send("advanceTime", { minutes: 60 });
      if (res?.stopped) showToast("Vorlauf abgebrochen – nicht alle Vorgänge verarbeitet.", "error");
      else summarizeEvents(res?.events);
    } catch (e) { showToast(e.message, "error"); }
    finally { setAdvancing(false); }
  }

  // Tagesvorlauf: läuft im Hintergrund, UI bleibt nutzbar.
  function advanceDay() {
    startBackgroundAdvance(1440);
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

  const disabled = busy || advancing || bgActive;

  // Summary-Modal aus dem Hintergrund-Vorlauf-Ergebnis konstruieren
  const summaryModal = backgroundAdvance?.result ? {
    current: 1440,
    total: 1440,
    stats: backgroundAdvance.result.stats || null,
    eventCount: backgroundAdvance.result.events?.length || 0,
    done: true,
    error: !!backgroundAdvance.error || !!backgroundAdvance.result.stopped,
    status: backgroundAdvance.error ? "Fehler: " + backgroundAdvance.error
      : backgroundAdvance.result.stopped ? "Abgebrochen – nicht alle Vorgänge verarbeitet"
      : "Abgeschlossen",
  } : null;

  return (
    <footer className="relative z-20 border-t border-white/10 bg-ink/95 shrink-0">
      <div className="flex items-center gap-2 lg:gap-4 px-3 lg:px-12 py-2.5">
        {/* Navigation – primär + schnell + Mehr-Aufklappmenü */}
        <nav className="flex items-center gap-1 flex-1 min-w-0" aria-label="Spielnavigation">
          {PRIMARY_NAV.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-lg px-2.5 lg:px-3 py-2 text-xs whitespace-nowrap transition shrink-0 ${active ? "bg-lime/10 text-lime" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4" /> <span className="hidden sm:inline">{n.label}</span>
              </Link>
            );
          })}
          {QUICK_NAV.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`hidden lg:flex items-center gap-2 rounded-lg px-3 py-2 text-xs whitespace-nowrap transition shrink-0 ${active ? "bg-lime/10 text-lime" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-4 h-4" /> <span>{n.label}</span>
              </Link>
            );
          })}
          {/* Mehr-Aufklappmenü */}
          <div ref={moreRef} className="relative">
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs transition shrink-0 ${moreOpen ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              aria-label="Weitere Bereiche"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Mehr</span>
            </button>
            {moreOpen && (
              <div className="absolute bottom-full mb-2 left-0 glass border border-white/15 rounded-xl p-1.5 shadow-2xl min-w-[180px] max-h-[70vh] overflow-y-auto scrollbar-none">
                <div className="lg:hidden">
                  {QUICK_NAV.map(n => {
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
                {MORE_NAV.map(n => {
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
          <DockClock fallbackGameTime={state.gameTime} />
          {/* Fortschritts-Anzeige während des Tagesvorlaufs */}
          {bgActive && (
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs bg-lime/10 text-lime border border-lime/20 shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <div className="flex flex-col gap-1 min-w-[90px]">
                <span className="hidden sm:inline leading-none">{bgProgress ? `${bgPct}%` : "Tag wird simuliert…"}</span>
                <div className="hidden sm:block h-1 rounded-full bg-lime/20 overflow-hidden">
                  <div className="h-full bg-lime rounded-full transition-all duration-300 ease-out" style={{ width: `${bgPct}%` }} />
                </div>
              </div>
            </div>
          )}
          <button
            onClick={advanceHour}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 min-h-[44px]"
            title="1 Stunde weiter"
            aria-label="1 Stunde weiter"
          >
            <Clock className="w-4 h-4" /> <span className="hidden lg:inline">1 Std</span>
          </button>
          <button
            onClick={advanceDay}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 min-h-[44px]"
            title="1 Tag weiter"
            aria-label="1 Tag weiter"
          >
            {bgActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            <span className="hidden lg:inline">1 Tag</span>
          </button>
        </div>
      </div>
      {summaryModal && <AdvanceProgressModal progress={summaryModal} onClose={dismissBackgroundAdvanceResult} state={state} />}
      {diagOpen && <DiagPanel onClose={() => setDiagOpen(false)} />}
    </footer>
  );
}