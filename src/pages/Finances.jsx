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
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Finanzen</h1>
        <p className="text-amber-100/60 text-sm">Alle Beträge in Euro. Vereinfachte Abrechnung: keine Abschreibung, Steuern, Kredite oder Forderungslaufzeiten in dieser Version.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Card icon={Wallet} label="Firmenkonto" value={formatEuro(state.company.accountCents)} />
        <Card icon={Home} label="Privatkonto" value={formatEuro(state.private.accountCents)} />
        <Card icon={TrendingUp} label="Fahrzeugbuchwerte" value={formatEuro(vehicleValue)} />
      </div>

      {(openCompany.length > 0 || openPrivate.length > 0) && (
        <div className="bg-red-500/10 border border-red-400/40 rounded-lg p-4">
          <h3 className="font-medium text-red-200 mb-2">Offene Kosten (Verbindlichkeiten)</h3>
          <ul className="text-sm space-y-1">
            {openCompany.map(o => <li key={o.id} className="text-red-100/80">{o.cause}: {formatEuro(o.amountCents)} (Firma)</li>)}
            {openPrivate.map(o => <li key={o.id} className="text-red-100/80">{o.cause}: {formatEuro(o.amountCents)} (Privat)</li>)}
          </ul>
          <div className="flex gap-2 mt-3">
            {openCompany.length > 0 && <button onClick={() => pay("company")} disabled={paying} className="px-3 py-1.5 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 text-sm flex items-center gap-1.5"><ArrowDownCircle className="w-4 h-4" /> Firma bezahlen</button>}
            {openPrivate.length > 0 && <button onClick={() => pay("private")} disabled={paying} className="px-3 py-1.5 rounded-md bg-wood/40 hover:bg-wood/60 text-sm flex items-center gap-1.5"><ArrowDownCircle className="w-4 h-4" /> Privat bezahlen</button>}
          </div>
        </div>
      )}

      <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
        <h3 className="font-medium text-amber-200 flex items-center gap-2 mb-3"><BookOpen className="w-4 h-4" /> Buchungsjournal (neueste zuerst)</h3>
        {bookings.length === 0 ? <div className="text-sm text-amber-100/40">Noch keine Buchungen.</div> : (
          <div className="space-y-1 max-h-96 overflow-auto">
            {bookings.map((b, i) => (
              <div key={i} className="text-sm flex items-center justify-between border-b border-wood/10 py-1.5">
                <div>
                  <span className="text-amber-100/50 text-xs font-mono mr-2">{formatGameTime(b.min)}</span>
                  <span className="text-amber-100/80">{b.cause}</span>
                  <span className="text-amber-100/40 text-xs ml-2">[{b.account}]</span>
                </div>
                <span className={`font-mono ${b.amountCents >= 0 ? "text-emerald-300" : "text-red-300"}`}>{euroSigned(b.amountCents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon: Icon, label, value }) {
  return (
    <div className="bg-office-2/60 border border-wood/30 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-300/80 text-xs"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-xl font-semibold text-amber-100 mt-1 font-mono">{value}</div>
    </div>
  );
}