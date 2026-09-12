import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, dayOf, clockOf } from "@/lib/gameData";
import { Building2, Package, Map, Truck, Users, Wallet, Home as HomeIcon, BookOpen, Play, Clock, SkipForward } from "lucide-react";

const NAV = [
  { to: "/", label: "Büro", icon: Building2 },
  { to: "/auftraege", label: "Aufträge", icon: Package },
  { to: "/disposition", label: "Dispo", icon: Map },
  { to: "/fuhrpark", label: "Fuhrpark", icon: Truck },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/finanzen", label: "Finanzen", icon: Wallet },
  { to: "/zuhause", label: "Zuhause", icon: HomeIcon },
  { to: "/journal", label: "Journal", icon: BookOpen }
];

// Untere Navigationsleiste und Zeitsteuerung.
export default function ShellDock() {
  const { state, send, showToast, busy } = useGame();
  const location = useLocation();
  const [advancing, setAdvancing] = useState(false);

  async function advance(minutes) {
    setAdvancing(true);
    try {
      const res = await send("advanceTime", { minutes });
      if (res.events?.length) {
        const ev = res.events[res.events.length - 1];
        if (ev.type === "delivery") showToast("Lieferung abgeschlossen: " + (ev.paymentCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " € erhalten.", "success");
        else if (ev.type === "daily_accounting") showToast("Tagesabrechnung durchgeführt.", "info");
        else if (ev.type === "invitation_appeared") showToast("Neue private Einladung erschienen.", "info");
      }
    } catch (e) { showToast(e.message, "error"); }
    finally { setAdvancing(false); }
  }

  async function nextEvent() {
    setAdvancing(true);
    try {
      const res = await send("advanceToNextEvent", {});
      if (res?.stopped === "decision_required") showToast(res.message, "info");
      else if (res.events?.length) {
        const ev = res.events[res.events.length - 1];
        if (ev.type === "delivery") showToast("Lieferung abgeschlossen: " + (ev.paymentCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " € erhalten.", "success");
        else if (ev.type === "invitation_appeared") showToast("Neue private Einladung erschienen.", "info");
        else if (ev.type === "daily_accounting") showToast("Tagesabrechnung durchgeführt.", "info");
      }
    } catch (e) { showToast(e.message, "error"); }
    finally { setAdvancing(false); }
  }

  const disabled = busy || advancing;

  return (
    <footer className="relative z-20 border-t border-white/10 backdrop-blur-md bg-ink/60">
      <div className="flex items-center gap-3 lg:gap-6 px-4 lg:px-12 py-3">
        {/* Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1" aria-label="Spielnavigation">
          {NAV.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2 rounded-lg px-2.5 lg:px-3.5 py-2 text-xs whitespace-nowrap transition shrink-0 ${active ? "bg-lime/10 text-lime" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
              >
                <Icon className="w-4 h-4" /> <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Zeitsteuerung */}
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 border-l border-white/10 pl-3 lg:pl-5">
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Tag {dayOf(state.gameTime)}</div>
            <div className="text-sm font-medium tabular-nums">{clockOf(state.gameTime)} Uhr</div>
          </div>
          <button
            onClick={() => advance(60)}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground disabled:opacity-40 transition"
            title="1 Stunde weiter"
          >
            <Clock className="w-4 h-4" /> <span className="hidden lg:inline">1 Std</span>
          </button>
          <button
            onClick={nextEvent}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-3 lg:px-4 py-2 text-xs font-medium bg-lime/15 text-lime border border-lime/30 hover:bg-lime/25 disabled:opacity-40 transition"
            title="Zum nächsten Ereignis"
          >
            {advancing ? <span className="w-4 h-4 border-2 border-lime/30 border-t-lime rounded-full animate-spin" /> : <SkipForward className="w-4 h-4" />}
            <span className="hidden lg:inline">Nächstes Ereignis</span>
          </button>
        </div>
      </div>
    </footer>
  );
}