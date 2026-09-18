import React, { useState, useMemo } from "react";
import { formatEuro } from "@/lib/gameData";
import { ownershipLabel } from "@/lib/financingData";
import { Truck, TrendingUp, AlertCircle, Fuel, Package, Lightbulb } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

// Betriebskostenanalyse und Ersatzhinweise für den Fuhrpark.
export default function VehicleAnalysis({ state, send, showToast }) {
  const [tab, setTab] = useState("costs");
  const [costs, setCosts] = useState(null);
  const [hints, setHints] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadCosts() {
    setLoading(true);
    try {
      const res = await send("getAllVehicleOperatingCosts", {});
      setCosts(res.data);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadHints() {
    setLoading(true);
    try {
      const res = await send("getReplacementHints", {});
      setHints(res.hints);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Automatisch laden
  useMemo(() => {
    if (tab === "costs" && !costs) loadCosts();
    if (tab === "hints" && !hints) loadHints();
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lime/70" /> Fuhrpark-Analyse
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Betriebskosten und Ersatzhinweise für alle Fahrzeuge</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          <button onClick={() => setTab("costs")} className={`px-3 py-2 text-sm font-medium transition ${tab === "costs" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Betriebskosten</button>
          <button onClick={() => setTab("hints")} className={`px-3 py-2 text-sm font-medium transition flex items-center gap-1.5 ${tab === "hints" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Lightbulb className="w-3.5 h-3.5" /> Ersatzhinweise
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      )}

      {!loading && tab === "costs" && costs && <CostsTable costs={costs} state={state} />}
      {!loading && tab === "hints" && hints && <HintsList hints={hints} />}
    </div>
  );
}

function CostsTable({ costs, state }) {
  if (!costs || costs.length === 0) {
    return <div className="glass border border-white/10 rounded-xl p-8 text-center text-muted-foreground">Keine Fahrzeuge im Fuhrpark.</div>;
  }

  const totalRevenue = costs.reduce((s, c) => s + c.totalRevenue, 0);
  const totalCosts = costs.reduce((s, c) => s + c.totalCosts, 0);
  const totalNet = costs.reduce((s, c) => s + c.netResult, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Gesamterlös" value={formatEuro(totalRevenue)} icon={Package} color="lime" />
        <SummaryCard label="Gesamtkosten" value={formatEuro(totalCosts)} icon={Fuel} color="coral" />
        <SummaryCard label="Nettoergebnis" value={formatEuro(totalNet)} icon={TrendingUp} color={totalNet >= 0 ? "lime" : "coral"} />
      </div>
      <div className="glass border border-white/10 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-muted-foreground text-xs">
              <th className="text-left px-3 py-2.5 font-medium">Fahrzeug</th>
              <th className="text-right px-3 py-2.5 font-medium">Lieferungen</th>
              <th className="text-right px-3 py-2.5 font-medium">Erlös</th>
              <th className="text-right px-3 py-2.5 font-medium">Kraftstoff</th>
              <th className="text-right px-3 py-2.5 font-medium">Maut</th>
              <th className="text-right px-3 py-2.5 font-medium">Wartung</th>
              <th className="text-right px-3 py-2.5 font-medium">Netto</th>
              <th className="text-right px-3 py-2.5 font-medium">Leerfahrt-%</th>
              <th className="text-right px-3 py-2.5 font-medium">km/Tag</th>
            </tr>
          </thead>
          <tbody>
            {costs.map(c => {
              const vehicle = (state.vehicles || []).find(v => v.id === c.vehicleId);
              return (
                <tr key={c.vehicleId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-lime/60" />
                      <span className="font-medium">{vehicle ? vehicleDisplayName(vehicle) : c.vehicleId}</span>
                      <span className="text-[10px] text-muted-foreground/60">{c.profile.label}</span>
                    </div>
                  </td>
                  <td className="text-right px-3 py-2.5 tabular-nums">{c.deliveryCount}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-lime">{formatEuro(c.totalRevenue)}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">{formatEuro(c.totalFuel)}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">{formatEuro(c.totalToll)}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">{formatEuro(c.maintenanceCosts)}</td>
                  <td className={`text-right px-3 py-2.5 tabular-nums font-medium ${c.netResult >= 0 ? "text-lime" : "text-coral"}`}>{formatEuro(c.netResult)}</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">{Math.round(c.emptyRatio * 100)}%</td>
                  <td className="text-right px-3 py-2.5 tabular-nums text-muted-foreground">{Math.round(c.kmPerDay)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HintsList({ hints }) {
  if (!hints || hints.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
        <Lightbulb className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Keine Ersatzhinweise — alle Fahrzeuge sind wirtschaftlich sinnvoll eingesetzt.</p>
      </div>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {hints.map(hint => (
        <div key={hint.vehicleId} className="glass border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium flex items-center gap-2">
              <Truck className="w-4 h-4 text-amber-400/70" /> {hint.vehicleLabel}
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${hint.reasons.length >= 3 ? "bg-red-400/15 text-red-300" : "bg-amber-400/15 text-amber-300"}`}>
              {hint.recommendation}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            Zustand {hint.condition}/100 · {hint.profile.label} · {ownershipLabel({ ownership_type: hint.ownership })}
            {hint.ownership === "owned" && ` · Marktwert ${formatEuro(hint.marketValue)}`}
          </div>
          <div className="space-y-1.5">
            {hint.reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <AlertCircle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${r.type === "lease_ending" ? "text-sky-300" : r.type === "mismatch" ? "text-purple-300" : "text-amber-300"}`} />
                <div>
                  <div className="text-foreground/80">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  const colorClass = color === "lime" ? "text-lime" : color === "coral" ? "text-coral" : "text-foreground";
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3.5 h-3.5 ${colorClass}`} /> {label}
      </div>
      <div className={`text-lg font-medium tabular-nums ${colorClass}`}>{value}</div>
    </div>
  );
}