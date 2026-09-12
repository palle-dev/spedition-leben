import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { ownershipLabel } from "@/lib/financingData";
import StatusBadge from "@/components/ui/StatusBadge";
import { Wrench, Plus, Truck, MapPin, Gauge, FileText } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

export default function Fleet() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [buying, setBuying] = useState(false);
  const [leasing, setLeasing] = useState(false);
  const stressed = state.private.stress >= 80;
  const maintCost = stressed ? Math.round(150000 * 1.25) : 150000;
  const openCompany = state.openCosts.some(o => o.account === "company");
  const activeVehicles = state.vehicles.filter(v => v.status !== "archived");
  const ownedCount = activeVehicles.filter(v => (v.ownership_type || "owned") === "owned").length;
  const leasedCount = activeVehicles.filter(v => v.ownership_type === "leased").length;

  async function maintain(v) {
    setBusyId(v.id);
    try { const r = await send("maintainVehicle", { vehicleId: v.id }); showToast(`Wartung gestartet – ${formatEuro(r.costCents)}, fertig ${formatGameTime(r.until)}.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }
  async function buy() {
    setBuying(true);
    try { const r = await send("buyVehicle", {}); showToast("Neuer Lkw in Hamburg übernommen.", "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBuying(false); }
  }
  async function lease() {
    setLeasing(true);
    try { const r = await send("leaseTruck", { provisionCity: "Hamburg" }); showToast(`Leasing-Lkw in Hamburg bereitgestellt.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setLeasing(false); }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Fuhrpark</h1>
          <p className="text-sm text-muted-foreground mt-1">{activeVehicles.length} einsatzfähige Lkw: {ownedCount} eigene, {leasedCount} geleast</p>
        </div>
        <div className="flex gap-2">
          <button onClick={lease} disabled={leasing || state.company.accountCents < 150000}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 disabled:opacity-40 transition active:scale-[0.98]">
            {leasing ? <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <FileText className="w-4 h-4" />} Leasen (1.500 €)
          </button>
          <button onClick={buy} disabled={buying || state.company.accountCents < 3000000 || openCompany}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
            {buying ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <Plus className="w-4 h-4" />} Kaufen (30.000 €)
          </button>
        </div>
      </div>
      {openCompany && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-4 py-2.5">Solange betriebliche Pflichtkosten offen sind, ist kein Fahrzeugkauf möglich.</div>}
      {stressed && <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-4 py-2.5">Deine Belastung ist hoch (≥ 80): Wartung kostet 25 % mehr ({formatEuro(maintCost)}).</div>}

      <div className="grid md:grid-cols-2 gap-3">
        {activeVehicles.map(v => {
          const trip = v.tripId ? state.trips.find(t => t.id === v.tripId) : null;
          const canMaint = v.status === "free" && v.condition < 100;
          const isLeased = (v.ownership_type || "owned") === "leased";
          return (
            <div key={v.id} className="glass border border-white/10 rounded-xl p-4 hover:border-lime/20 transition">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium">
                  <Truck className="w-4 h-4 text-lime/70" /> {vehicleDisplayName(v)}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLeased ? "bg-sky-400/15 text-sky-300" : "bg-lime/15 text-lime"}`}>{ownershipLabel(v)}</span>
                </div>
                <StatusBadge status={v.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                <Info icon={MapPin} label="Standort" value={v.locationCity} />
                <Info icon={Gauge} label="Zustand" value={`${v.condition}/100`} />
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                {isLeased ? `Geleast · km ${(v.odometerKm || 0).toLocaleString("de-DE")}` : `Buchwert ${formatEuro(v.bookValueCents)}`} · 12 t · 28 L/100km
              </div>
              {trip && <div className="text-xs text-amber-300 mt-1">Unterwegs bis {formatGameTime(trip.endMin)}</div>}
              {v.status === "maintenance" && <div className="text-xs text-sky-300 mt-1">Wartung bis {formatGameTime(v.maintenanceUntil)}</div>}
              <button onClick={() => maintain(v)} disabled={!canMaint || busyId === v.id || state.company.accountCents < maintCost}
                className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm hover:bg-white/10 disabled:opacity-40 transition active:scale-[0.98]">
                {busyId === v.id ? <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <><Wrench className="w-4 h-4" /> Wartung ({formatEuro(maintCost)})</>}
              </button>
              {!canMaint && v.status === "free" && v.condition >= 100 && <div className="text-xs text-muted-foreground/50 mt-1.5 text-center">Zustand bereits 100</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5 text-foreground/40" /> <span className="text-muted-foreground/60">{label}:</span> <span className="text-foreground/80">{value}</span></div>;
}