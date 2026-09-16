import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatEuro, getDistance, fuelEur, tollEur, driveMinutes } from "@/lib/gameData";
import { Package, Play, CheckCircle, AlertTriangle, Truck, ArrowLeft, Zap } from "lucide-react";

// Mehrfach-Zuweisung: mehrere angenommene Aufträge gleichzeitig
// ausgewählten Fahrern+Lkw zuweisen, um die Disposition bei hoher
// Auslastung zu beschleunigen.
//
// Ablauf: Aufträge ankreuzen → Auto-Match gegen freie Lkw+Fahrer →
// Ergebnisse prüfen → "Alle starten" startet alle gültigen Transporte nacheinander.
export default function BulkAssignPanel({ orders, onBack, onStarted }) {
  const { state, send, showToast } = useGame();
  const [selected, setSelected] = useState(new Set());
  const [matched, setMatched] = useState(null);
  const [matching, setMatching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [results, setResults] = useState(null);

  const gameTime = state.gameTime;

  // Auto-Match: weist jeden ausgewählten Auftrag dem besten verfügbaren
  // Lkw+Fahrer-Paar zu. Bereits zugewiesene Ressourcen werden verbraucht.
  function runMatch() {
    setMatching(true);
    setResults(null);

    const usedVehicles = new Set();
    const usedDrivers = new Set();
    const freeVehicles = state.vehicles.filter(v => v.status === "free" && v.condition >= 20);
    const freeDrivers = state.drivers.filter(d => d.status === "free" && d.employmentStatus === "employed" && (!d.restUntil || d.restUntil <= gameTime));

    const matchResults = [];
    for (const orderId of selected) {
      const order = state.orders.find(o => o.id === orderId);
      if (!order) continue;

      let best = null;
      let bestScore = -1;

      for (const v of freeVehicles) {
        if (usedVehicles.has(v.id)) continue;
        if (v.capacityTons < order.tons) continue;

        const driversHere = freeDrivers.filter(d => !usedDrivers.has(d.id) && d.locationCity === v.locationCity);
        if (driversHere.length === 0) continue;

        const emptyKm = v.locationCity === order.fromCity ? 0 : getDistance(v.locationCity, order.fromCity);
        const loadedKm = getDistance(order.fromCity, order.toCity);
        const totalKm = emptyKm + loadedKm;
        const fuel = fuelEur(totalKm, v.consumptionPer100km);
        const toll = tollEur(totalKm);
        const contribution = order.paymentCents / 100 - fuel - toll;

        const estDuration = driveMinutes(emptyKm) + 60 + driveMinutes(loadedKm) + 60;
        const slack = order.deliveryDeadlineMin - gameTime - estDuration;

        let score = 0;
        if (emptyKm === 0) score += 30;
        else if (emptyKm <= 150) score += 18;
        else if (emptyKm <= 300) score += 6;
        if (contribution > 0) score += 20;
        if (slack > 240) score += 15;
        else if (slack > 0) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = { vehicle: v, driver: driversHere[0], emptyKm, totalKm, contribution, slack, score };
        }
      }

      if (best) {
        usedVehicles.add(best.vehicle.id);
        usedDrivers.add(best.driver.id);
        matchResults.push({ orderId, order, ok: true, ...best });
      } else {
        matchResults.push({ orderId, order, ok: false, reason: "Kein freier Lkw mit Fahrer am passenden Standort" });
      }
    }

    setMatched(matchResults);
    setMatching(false);
  }

  async function startAll() {
    if (!matched) return;
    setStarting(true);
    const ok = [];
    const failed = [];
    for (const m of matched) {
      if (!m.ok) continue;
      try {
        await send("startTransport", { orderId: m.orderId, vehicleId: m.vehicle.id, driverId: m.driver.id });
        ok.push(m.order.customer);
      } catch (e) {
        failed.push({ customer: m.order.customer, error: e.message });
      }
    }
    setResults({ ok, failed });
    setStarting(false);
    if (ok.length > 0) showToast(`${ok.length} Transport(e) gestartet.`, "success");
    if (failed.length > 0) showToast(`${failed.length} Transport(e) fehlgeschlagen.`, "error");
    onStarted?.();
  }

  function toggleOrder(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMatched(null);
    setResults(null);
  }

  function selectAll() {
    setSelected(new Set(orders.map(o => o.id)));
    setMatched(null);
    setResults(null);
  }

  function selectNone() {
    setSelected(new Set());
    setMatched(null);
    setResults(null);
  }

  const validCount = matched ? matched.filter(m => m.ok).length : 0;
  const failedCount = matched ? matched.filter(m => !m.ok).length : 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition shrink-0">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Auftragsliste
      </button>

      <div className="flex items-center gap-2 shrink-0">
        <Zap className="w-4 h-4 text-lime" />
        <div className="text-sm font-medium">Mehrfach-Zuweisung</div>
        <span className="text-[10px] text-muted-foreground ml-auto">{selected.size} von {orders.length} ausgewählt</span>
      </div>

      {/* Auswahl-Aktionen */}
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={selectAll} className="px-2.5 py-1 rounded-md text-[11px] bg-surface-2/60 text-muted-foreground hover:text-foreground transition border border-white/10">
          Alle auswählen
        </button>
        <button onClick={selectNone} className="px-2.5 py-1 rounded-md text-[11px] bg-surface-2/60 text-muted-foreground hover:text-foreground transition border border-white/10">
          Alle abwählen
        </button>
        <button
          onClick={runMatch}
          disabled={selected.size === 0 || matching}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-lime/10 border border-lime/30 text-lime hover:border-lime/50 disabled:opacity-40 transition"
        >
          {matching ? <><span className="w-3 h-3 border-2 border-lime/30 border-t-lime rounded-full animate-spin" /> Zuordne…</> : <><Truck className="w-3 h-3" /> Auto-Zuordnung</>}
        </button>
      </div>

      {/* Auftragsliste mit Checkboxen */}
      <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto scrollbar-none">
        {orders.map(o => {
          const isSel = selected.has(o.id);
          const match = matched?.find(m => m.orderId === o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggleOrder(o.id)}
              className={`w-full text-left rounded-lg p-2.5 border text-xs transition flex items-center gap-2.5 ${
                isSel ? "border-lime/30 bg-lime/5" : "border-white/10 hover:border-white/20 bg-surface/30"
              }`}
            >
              <div className={`w-5 h-5 rounded border grid place-items-center shrink-0 ${isSel ? "bg-lime border-lime text-ink" : "border-white/20"}`}>
                {isSel && <CheckCircle className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{o.customer}</span>
                  <span className="text-lime tabular-nums shrink-0">{formatEuro(o.paymentCents)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {o.fromCity} → {o.toCity} · {o.tons} t
                </div>
                {match && match.ok && (
                  <div className="text-[10px] text-lime mt-1 flex items-center gap-1">
                    <Truck className="w-2.5 h-2.5" /> {vehicleDisplayName(match.vehicle)} · {driverDisplayName(match.driver)}
                    {match.emptyKm > 0 && <span className="text-muted-foreground"> · {match.emptyKm} km leer</span>}
                  </div>
                )}
                {match && !match.ok && (
                  <div className="text-[10px] text-coral mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> {match.reason}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Ergebnisse */}
      {results && (
        <div className={`rounded-lg p-3 border text-xs shrink-0 ${results.failed.length === 0 ? "border-lime/20 bg-lime/5" : "border-amber-400/20 bg-amber-400/5"}`}>
          <div className="flex items-center gap-1.5 font-medium mb-1">
            {results.failed.length === 0 ? <CheckCircle className="w-3.5 h-3.5 text-lime" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />}
            {results.ok.length} gestartet{results.failed.length > 0 ? `, ${results.failed.length} fehlgeschlagen` : ""}
          </div>
          {results.failed.length > 0 && (
            <div className="space-y-0.5 mt-1.5">
              {results.failed.map((f, i) => (
                <div key={i} className="text-[10px] text-muted-foreground">{f.customer}: {f.error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Start-Button */}
      {matched && validCount > 0 && !results && (
        <div className="shrink-0 pt-2">
          <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
            <span>{validCount} Transport(e) bereit</span>
            {failedCount > 0 && <span className="text-coral">{failedCount} ohne Match</span>}
          </div>
          <button
            onClick={startAll}
            disabled={starting}
            className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {starting ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Startet…</> : <><Play className="w-4 h-4" /> Alle {validCount} Transporte starten</>}
          </button>
        </div>
      )}

      {matched && validCount === 0 && !results && (
        <div className="flex items-start gap-2 text-xs text-coral bg-coral/5 border border-coral/20 rounded-lg px-3 py-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Keine der ausgewählten Aufträge konnte einem freien Lkw mit Fahrer zugeordnet werden.</span>
        </div>
      )}
    </div>
  );
}