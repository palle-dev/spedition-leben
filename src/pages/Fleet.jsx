import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { Wrench, Plus, Truck, MapPin, Gauge } from "lucide-react";

export default function Fleet() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);
  const [buying, setBuying] = useState(false);
  const stressed = state.private.stress >= 80;
  const maintCost = stressed ? Math.round(150000 * 1.25) : 150000;

  async function maintain(v) {
    setBusyId(v.id);
    try { const r = await send("maintainVehicle", { vehicleId: v.id }); showToast(`Wartung gestartet – ${formatEuro(r.costCents)}, fertig ${formatGameTime(r.until)}.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }
  async function buy() {
    setBuying(true);
    try { const r = await send("buyVehicle", {}); showToast(`Neuer Lkw ${r.vehicleId} in Hamburg übernommen.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBuying(false); }
  }

  const openCompany = state.openCosts.some(o => o.account === "company");

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display text-amber-200">Fuhrpark</h1>
          <p className="text-amber-100/60 text-sm">{state.vehicles.length} Lkw · Wartung nur für freie Fahrzeuge, 8 Spielstunden, danach Zustand 100.</p>
        </div>
        <button onClick={buy} disabled={buying || state.company.accountCents < 3000000 || openCompany}
          className="px-4 py-2 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 font-semibold flex items-center gap-2">
          <Plus className="w-4 h-4" /> Lkw kaufen (30.000 €)
        </button>
      </div>
      {openCompany && <div className="text-sm text-red-300">Solange betriebliche Pflichtkosten offen sind, ist kein Fahrzeugkauf möglich.</div>}
      {stressed && <div className="text-sm text-amber-300">Deine Belastung ist hoch (≥ 80): Wartung kostet 25 % mehr ({formatEuro(maintCost)}) – Organisationsaufwand als Spielregel.</div>}

      <div className="grid md:grid-cols-2 gap-3">
        {state.vehicles.map(v => {
          const trip = v.tripId ? state.trips.find(t => t.id === v.tripId) : null;
          const canMaint = v.status === "free" && v.condition < 100;
          return (
            <div key={v.id} className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-amber-100"><Truck className="w-4 h-4 text-amber-300" /> {v.id}</div>
                <StatusBadge status={v.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                <Info icon={MapPin} label="Standort" value={v.locationCity} />
                <Info icon={Gauge} label="Zustand" value={`${v.condition}/100`} />
              </div>
              <div className="text-xs text-amber-100/50 mt-2">Buchwert {formatEuro(v.bookValueCents)} · 12 t · 28 L/100km</div>
              {trip && <div className="text-xs text-amber-100/60 mt-1">Unterwegs bis {formatGameTime(trip.endMin)}</div>}
              {v.status === "maintenance" && <div className="text-xs text-amber-300 mt-1">Wartung bis {formatGameTime(v.maintenanceUntil)}</div>}
              <button onClick={() => maintain(v)} disabled={!canMaint || busyId === v.id || state.company.accountCents < maintCost}
                className="mt-3 w-full px-3 py-1.5 rounded-md bg-wood/40 hover:bg-wood/60 disabled:opacity-40 text-sm flex items-center justify-center gap-1.5">
                <Wrench className="w-4 h-4" /> Wartung ({formatEuro(maintCost)})
              </button>
              {!canMaint && v.status === "free" && v.condition >= 100 && <div className="text-xs text-amber-100/40 mt-1 text-center">Zustand bereits 100</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { free: ["Frei", "bg-emerald-500/20 text-emerald-300"], on_trip: ["Unterwegs", "bg-amber-500/20 text-amber-300"], maintenance: ["Wartung", "bg-blue-500/20 text-blue-300"] };
  const [label, cls] = map[status] || [status, "bg-wood/30"];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
function Info({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-amber-100/70"><Icon className="w-3.5 h-3.5 text-amber-300/70" /> <span className="text-amber-100/50">{label}:</span> {value}</div>;
}