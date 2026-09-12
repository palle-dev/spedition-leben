import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, computeDealerOffer } from "@/lib/gameData";
import { ownershipLabel, getVehicleBookValue } from "@/lib/financingData";
import StatusBadge from "@/components/ui/StatusBadge";
import SellVehicleDialog from "@/components/fleet/SellVehicleDialog";
import WorkshopSection from "@/components/fleet/WorkshopSection";
import { Wrench, Plus, Truck, MapPin, Gauge, FileText, TrendingUp, FileCheck, Settings } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

export default function Fleet() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [buying, setBuying] = useState(false);
  const [leasing, setLeasing] = useState(false);
  const [sellVehicle, setSellVehicle] = useState(null);
  const [tab, setTab] = useState("fleet");
  const stressed = state.private.stress >= 80;
  const maintCost = stressed ? Math.round(150000 * 1.25) : 150000;
  const openCompany = state.openCosts.some(o => o.account === "company");
  const activeVehicles = state.vehicles.filter(v => v.status !== "archived" && v.status !== "sold");
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
          <div className="flex rounded-lg overflow-hidden border border-white/10">
            <button onClick={() => setTab("fleet")} className={`px-3 py-2.5 text-sm font-medium transition ${tab === "fleet" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Flotte</button>
            <button onClick={() => setTab("workshop")} className={`px-3 py-2.5 text-sm font-medium transition flex items-center gap-1.5 ${tab === "workshop" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Wrench className="w-3.5 h-3.5" /> Werkstatt
            </button>
          </div>
        </div>
        {tab === "fleet" && (
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
        )}
      </div>
      {tab === "workshop" ? (
        <WorkshopSection state={state} send={send} showToast={showToast} />
      ) : (
        <>
          {openCompany && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-4 py-2.5">Solange betriebliche Pflichtkosten offen sind, ist kein Fahrzeugkauf möglich.</div>}
          {stressed && <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-4 py-2.5">Deine Belastung ist hoch (≥ 80): Wartung kostet 25 % mehr ({formatEuro(maintCost)}).</div>}

          <div className="grid md:grid-cols-2 gap-3">
            {activeVehicles.map(v => {
              const trip = v.tripId ? state.trips.find(t => t.id === v.tripId) : null;
              const canMaint = v.status === "free" && v.condition < 100;
              const isLeased = (v.ownership_type || "owned") === "leased";
              const isOwned = !isLeased;
              const bookValue = isOwned ? getVehicleBookValue(state, v.id) : 0;
              const dealerOffer = isOwned ? computeDealerOffer(v, state.gameTime) : 0;
              const hasValidOffer = v.saleOffer && v.saleOffer.validUntilMin >= state.gameTime;
              return (
                <div key={v.id} className={`glass border rounded-xl p-4 hover:border-lime/20 transition ${v.markedForSale ? "border-amber-400/30" : "border-white/10"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <Truck className="w-4 h-4 text-lime/70" /> {vehicleDisplayName(v)}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLeased ? "bg-sky-400/15 text-sky-300" : "bg-lime/15 text-lime"}`}>{ownershipLabel(v)}</span>
                      {v.markedForSale && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300">Vorgemerkt</span>}
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                    <Info icon={MapPin} label="Standort" value={v.locationCity} />
                    <Info icon={Gauge} label="Zustand" value={`${v.condition}/100`} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {isLeased
                      ? `Geleast · km ${(v.odometerKm || 0).toLocaleString("de-DE")}`
                      : `Buchwert ${formatEuro(bookValue)} · Markt ${formatEuro(dealerOffer)}`} · 12 t · 28 L/100km
                  </div>
                  {trip && <div className="text-xs text-amber-300 mt-1">Unterwegs bis {formatGameTime(trip.endMin)}</div>}
                  {v.status === "maintenance" && <div className="text-xs text-sky-300 mt-1">Wartung bis {formatGameTime(v.maintenanceUntil)}</div>}
                  {hasValidOffer && <div className="text-xs text-lime mt-1">Angebot: {formatEuro(v.saleOffer.priceCents)} bis {formatGameTime(v.saleOffer.validUntilMin)}</div>}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => maintain(v)} disabled={!canMaint || busyId === v.id || state.company.accountCents < maintCost}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm hover:bg-white/10 disabled:opacity-40 transition active:scale-[0.98]">
                      {busyId === v.id ? <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <><Wrench className="w-4 h-4" /> Schnellwartung</>}
                    </button>
                    {isOwned && (
                      <button onClick={() => setSellVehicle(v)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition active:scale-[0.98]">
                        <TrendingUp className="w-4 h-4" /> Verkaufen
                      </button>
                    )}
                    {isLeased && (
                      <button onClick={() => navigate("/finanzen")}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition active:scale-[0.98]">
                        <FileCheck className="w-4 h-4" /> Vertrag
                      </button>
                    )}
                  </div>
                  {!canMaint && v.status === "free" && v.condition >= 100 && <div className="text-xs text-muted-foreground/50 mt-1.5 text-center">Zustand bereits 100</div>}
                </div>
              );
            })}
          </div>

          {sellVehicle && <SellVehicleDialog vehicle={sellVehicle} onClose={() => setSellVehicle(null)} />}
        </>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5 text-foreground/40" /> <span className="text-muted-foreground/60">{label}:</span> <span className="text-foreground/80">{value}</span></div>;
}