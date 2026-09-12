import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { Heart, Smile, Zap, Calendar, Check, Clock, X, Footprints, Home as HomeIcon } from "lucide-react";

export default function Home() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);
  const p = state.private;
  const pendingInvites = state.appointments.filter(a => a.status === "pending" && a.appearMin <= state.gameTime && state.gameTime < a.decisionDeadline);
  const upcoming = state.appointments.filter(a => ["accepted", "active"].includes(a.status)).sort((a, b) => a.startMin - b.startMin);
  const canWalk = state.leisureUsedDay !== dayOf(state.gameTime) && !state.appointments.some(a => a.status === "active");

  async function answer(invite, choice) {
    setBusyId(invite.id + choice);
    try { await send("answerInvitation", { appointmentId: invite.id, choice }); showToast("Einladung beantwortet.", "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }
  async function walk() {
    try { const r = await send("startLeisure", { type: "walk" }); showToast(`Spaziergang gestartet – bis ${formatGameTime(r.appointmentId ? state.gameTime + 120 : state.gameTime)}.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Zuhause</h1>
        <p className="text-amber-100/60 text-sm">Privatleben von {p.playerName} – Beziehung, Belastung und Lebenszufriedenheit sind echte Spielwerte.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-200 font-medium mb-3"><HomeIcon className="w-4 h-4" /> Privatkonto &amp; Wohnen</div>
          <div className="text-2xl font-mono text-amber-100">{formatEuro(p.accountCents)}</div>
          <div className="text-sm text-amber-100/60 mt-1">{p.residence}</div>
          <div className="text-sm text-amber-100/60">Lebenshaltung: 30 €/Tag</div>
        </div>
        <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4 space-y-3">
          <Bar icon={Zap} label="Belastung" value={p.stress} invert />
          <Bar icon={Smile} label="Lebenszufriedenheit" value={p.happiness} />
          <Bar icon={Heart} label="Beziehungsqualität" value={p.relationship} />
          <div className="text-sm text-amber-100/60 pt-1 border-t border-wood/20">Partnerin / Partner: <span className="text-amber-100">{p.partnerName}</span></div>
        </div>
      </div>

      {pendingInvites.length > 0 ? (
        <div className="bg-amber-500/10 border border-amber-400/40 rounded-lg p-4">
          <h3 className="font-medium text-amber-200 mb-1">Einladung</h3>
          <p className="text-amber-100/80 text-sm mb-1">{pendingInvites[0].text}</p>
          <p className="text-xs text-amber-100/50 mb-3">Heute 18:00–21:00 Uhr · Antwort nötig bis 18:00 Uhr</p>
          <div className="grid md:grid-cols-3 gap-2">
            <button onClick={() => answer(pendingInvites[0], "accept")} disabled={busyId === pendingInvites[0].id + "accept" || p.accountCents < 6000}
              className="px-3 py-2 rounded-md bg-emerald-500/80 text-emerald-50 hover:bg-emerald-500 disabled:opacity-40 text-sm flex flex-col items-center gap-0.5">
              <span className="flex items-center gap-1 font-medium"><Check className="w-4 h-4" /> Zusagen</span>
              <span className="text-[10px] opacity-80">60 € privat · +Beziehung, −Belastung</span>
            </button>
            <button onClick={() => answer(pendingInvites[0], "reschedule")} disabled={busyId === pendingInvites[0].id + "reschedule"}
              className="px-3 py-2 rounded-md bg-wood/40 hover:bg-wood/60 text-sm flex flex-col items-center gap-0.5">
              <span className="flex items-center gap-1 font-medium"><Clock className="w-4 h-4" /> Freundlich verschieben</span>
              <span className="text-[10px] opacity-70">−2 Beziehung · Ersatztermin Folgetag</span>
            </button>
            <button onClick={() => answer(pendingInvites[0], "decline")} disabled={busyId === pendingInvites[0].id + "decline"}
              className="px-3 py-2 rounded-md bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30 text-sm flex flex-col items-center gap-0.5">
              <span className="flex items-center gap-1 font-medium"><X className="w-4 h-4" /> Für die Arbeit absagen</span>
              <span className="text-[10px] opacity-70">−Beziehung, +Belastung, −Zufriedenheit</span>
            </button>
          </div>
          {p.accountCents < 6000 && <div className="text-xs text-red-300 mt-2">Zusage gesperrt: Privatkonto reicht für 60 € nicht aus.</div>}
        </div>
      ) : (
        <div className="bg-office-2/40 border border-wood/20 rounded-lg p-4 text-sm text-amber-100/50">Aktuell keine offene Einladung.</div>
      )}

      <div className="flex items-center justify-between bg-office-2/50 border border-wood/30 rounded-lg p-4">
        <div>
          <div className="font-medium text-amber-100 flex items-center gap-2"><Footprints className="w-4 h-4 text-amber-300" /> Spaziergang</div>
          <div className="text-xs text-amber-100/50">2 Spielstunden · kostenlos · Belastung −8, Zufriedenheit +2 · max. eine Freizeitaktivität pro Tag</div>
        </div>
        <button onClick={walk} disabled={!canWalk}
          className="px-4 py-2 rounded-md bg-wood/40 hover:bg-wood/60 disabled:opacity-40 text-sm font-medium">Spaziergang starten</button>
      </div>

      <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
        <h3 className="font-medium text-amber-200 flex items-center gap-2 mb-3"><Calendar className="w-4 h-4" /> Persönlicher Kalender</h3>
        {upcoming.length === 0 ? <div className="text-sm text-amber-100/40">Keine anstehenden Termine.</div> : (
          <ul className="space-y-1.5">
            {upcoming.map(a => (
              <li key={a.id} className="text-sm flex items-center justify-between border border-wood/20 rounded px-2 py-1.5 bg-office/40">
                <span className="text-amber-100/80">{labelOf(a)}</span>
                <span className="text-xs text-amber-100/50">{formatGameTime(a.startMin)} – {formatGameTime(a.endMin)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function labelOf(a) {
  if (a.type === "invitation") return "Freizeitabend (Einladung)";
  if (a.type === "invitation_ersatz") return "Freizeitabend (Ersatztermin)";
  if (a.type === "leisure") return a.label || "Freizeitaktivität";
  return a.text || "Termin";
}

function Bar({ icon: Icon, label, value, invert }) {
  const good = invert ? value <= 30 : value >= 60;
  const mid = invert ? value <= 60 : value >= 30;
  const color = invert ? (value >= 80 ? "bg-red-500" : value >= 50 ? "bg-amber-500" : "bg-emerald-500") : (value >= 60 ? "bg-emerald-500" : value >= 30 ? "bg-amber-500" : "bg-red-500");
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-amber-100/70"><Icon className="w-3.5 h-3.5" /> {label}</span>
        <span className="font-mono text-amber-100">{value}/100</span>
      </div>
      <div className="w-full h-2 rounded-full bg-office mt-1 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}