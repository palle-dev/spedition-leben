import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro, dayOf } from "@/lib/gameData";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Clock, Play, SkipForward, Building2, Package, Map, Truck, Users, Wallet, Home, BookOpen, Sparkles, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import Tutorial from "@/components/Tutorial";

const NAV = [
  { to: "/", label: "Büro", icon: Building2 },
  { to: "/auftraege", label: "Aufträge", icon: Package },
  { to: "/disposition", label: "Disposition & Karte", icon: Map },
  { to: "/fuhrpark", label: "Fuhrpark", icon: Truck },
  { to: "/personal", label: "Personal", icon: Users },
  { to: "/finanzen", label: "Finanzen", icon: Wallet },
  { to: "/zuhause", label: "Zuhause", icon: Home },
  { to: "/journal", label: "Ereignisjournal", icon: BookOpen }
];

function StressBar({ value }) {
  const color = value >= 80 ? "bg-red-500" : value >= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-amber-100/70">Belastung</span>
      <div className="w-16 h-2 rounded-full bg-office-2 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono w-7 text-right">{value}</span>
    </div>
  );
}

export default function GameShell() {
  const { state, loading, send, busy, toast, showToast } = useGame();
  const location = useLocation();
  const [advancing, setAdvancing] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-office">
        <div className="w-10 h-10 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }
  if (!state) {
    return <StartScreen />;
  }

  const blocked = state.appointments.some(a => a.status === "active");

  async function advance(minutes) {
    setAdvancing(true);
    try {
      const res = await send("advanceTime", { minutes });
      if (res.events && res.events.length) {
        const ev = res.events[res.events.length - 1];
        if (ev.type === "delivery") showToast("Lieferung abgeschlossen: " + formatEuro(ev.paymentCents) + " erhalten.", "success");
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
      if (res && res.stopped === "decision_required") showToast(res.message, "info");
      else if (res.events && res.events.length) {
        const ev = res.events[res.events.length - 1];
        if (ev.type === "delivery") showToast("Lieferung abgeschlossen: " + formatEuro(ev.paymentCents) + " erhalten.", "success");
        else if (ev.type === "invitation_appeared") showToast("Neue private Einladung erschienen.", "info");
        else if (ev.type === "daily_accounting") showToast("Tagesabrechnung durchgeführt.", "info");
      }
    } catch (e) { showToast(e.message, "error"); }
    finally { setAdvancing(false); }
  }

  return (
    <div className="min-h-screen bg-office text-amber-50 flex flex-col">
      {/* Top-Leiste */}
      <header className="bg-office-2/80 backdrop-blur border-b border-wood/40 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2 font-display text-amber-300">
          <Building2 className="w-5 h-5" />
          <span className="font-semibold">{state.company.name}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm bg-wood/30 px-3 py-1 rounded-md">
          <Clock className="w-4 h-4 text-amber-300" />
          {formatGameTime(state.gameTime)}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-amber-100/50">Firma</span>
            <span className="font-mono text-emerald-300">{formatEuro(state.company.accountCents)}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-amber-100/50">Privat</span>
            <span className="font-mono text-amber-200">{formatEuro(state.private.accountCents)}</span>
          </div>
          <StressBar value={state.private.stress} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={busy || advancing}
            onClick={() => advance(60)}
            className="px-3 py-1.5 rounded-md bg-wood/40 hover:bg-wood/60 disabled:opacity-40 text-sm flex items-center gap-1.5 transition"
            title="1 Stunde weiter"
          >
            <Clock className="w-4 h-4" /> 1 Std
          </button>
          <button
            disabled={busy || advancing}
            onClick={nextEvent}
            className="px-3 py-1.5 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 text-sm font-semibold flex items-center gap-1.5 transition"
            title="Zum nächsten Ereignis"
          >
            <SkipForward className="w-4 h-4" /> Nächstes Ereignis
          </button>
        </div>
      </header>

      {blocked && (
        <div className="bg-amber-500/20 border-b border-amber-400/40 px-4 py-1.5 text-sm text-amber-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Du bist mit einer privaten Aktivität beschäftigt. Operative Aktionen sind gesperrt – Zeit und Einsicht bleiben möglich.
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Seitenleiste */}
        <nav className="w-16 md:w-56 bg-office-2/60 border-r border-wood/30 py-3 flex flex-col gap-1 shrink-0">
          {NAV.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 md:px-4 py-2 text-sm rounded-r-md transition ${active ? "bg-amber-500/20 text-amber-200 border-l-2 border-amber-400" : "text-amber-100/70 hover:bg-wood/20 hover:text-amber-50"}`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Hauptbereich */}
        <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {state.tutorial.active && <Tutorial />}
      {toast && <ToastView toast={toast} />}
    </div>
  );
}

function ToastView({ toast }) {
  const Icon = toast.kind === "error" ? AlertTriangle : toast.kind === "success" ? CheckCircle2 : Info;
  const color = toast.kind === "error" ? "border-red-400/60 bg-red-500/20" : toast.kind === "success" ? "border-emerald-400/60 bg-emerald-500/20" : "border-amber-400/60 bg-amber-500/20";
  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm border rounded-lg px-4 py-3 shadow-lg flex items-start gap-2 ${color}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <span className="text-sm">{toast.msg}</span>
    </div>
  );
}

import StartScreen from "@/pages/Start";