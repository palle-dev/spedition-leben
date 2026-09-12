import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, euroSigned } from "@/lib/gameData";
import { Wallet, Home, ArrowDownCircle, TrendingUp, BookOpen } from "lucide-react";

export default function Finances() {
  const { state, send, showToast } = useGame();
  const [paying, setPaying] = useState(false);
  const bookings = [...state.bookings].slice(-40).reverse();
  const vehicleValue = state.vehicles.reduce((s, v) => s + v.bookValueCents, 0);
  const openCompany = state.openCosts.filter(o => o.account === "company");
  const openPrivate = state.openCosts.filter(o => o.account === "private");

  async function pay(account) {
    setPaying(true);
    try { const r = await send("payOpenCosts", { account }); showToast(`${formatEuro(r.paidCents)} offene Kosten bezahlt.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setPaying(false); }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Finanzen</h1>
        <p className="text-sm text-muted-foreground mt-1">Alle Beträge in Euro. Vereinfachte Abrechnung ohne Abschreibung, Steuern oder Kredite.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card icon={Wallet} label="Firmenkonto" value={formatEuro(state.company.accountCents)} accent="lime" />
        <Card icon={Home} label="Privatkonto" value={formatEuro(state.private.accountCents)} accent="coral" />
        <Card icon={TrendingUp} label="Fahrzeugbuchwerte" value={formatEuro(vehicleValue)} />
      </div>

      {(openCompany.length > 0 || openPrivate.length > 0) && (
        <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4">
          <h3 className="font-medium text-red-200 mb-3">Offene Kosten (Verbindlichkeiten)</h3>
          <ul className="text-sm space-y-1.5">
            {openCompany.map(o => <li key={o.id} className="text-red-100/80 flex justify-between"><span>{o.cause} (Firma)</span> <span className="tabular-nums">{formatEuro(o.amountCents)}</span></li>)}
            {openPrivate.map(o => <li key={o.id} className="text-red-100/80 flex justify-between"><span>{o.cause} (Privat)</span> <span className="tabular-nums">{formatEuro(o.amountCents)}</span></li>)}
          </ul>
          <div className="flex gap-2 mt-3">
            {openCompany.length > 0 && <button onClick={() => pay("company")} disabled={paying} className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-95"><ArrowDownCircle className="w-4 h-4" /> Firma bezahlen</button>}
            {openPrivate.length > 0 && <button onClick={() => pay("private")} disabled={paying} className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-coral text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-95"><ArrowDownCircle className="w-4 h-4" /> Privat bezahlen</button>}
          </div>
        </div>
      )}

      <div className="glass border border-white/10 rounded-xl p-4">
        <h3 className="font-medium flex items-center gap-2 mb-3"><BookOpen className="w-4 h-4 text-lime/70" /> Buchungsjournal</h3>
        {bookings.length === 0 ? <div className="text-sm text-muted-foreground/50">Noch keine Buchungen.</div> : (
          <div className="space-y-0.5 max-h-96 overflow-auto">
            {bookings.map((b, i) => (
              <div key={i} className="text-sm flex items-center justify-between border-b border-white/5 py-2">
                <div className="min-w-0">
                  <span className="text-muted-foreground text-xs tabular-nums mr-2">{formatGameTime(b.min)}</span>
                  <span className="text-foreground/80">{b.cause}</span>
                  <span className="text-muted-foreground/40 text-xs ml-2">({b.account === "company" ? "Firma" : "Privat"})</span>
                </div>
                <span className={`tabular-nums shrink-0 ml-3 ${b.amountCents >= 0 ? "text-lime" : "text-red-300"}`}>{euroSigned(b.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value, accent }) {
  const color = accent === "lime" ? "text-lime" : accent === "coral" ? "text-coral" : "text-foreground";
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`w-4 h-4 ${color}`} /> {label}</div>
      <div className={`text-xl lg:text-2xl font-medium mt-2 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}