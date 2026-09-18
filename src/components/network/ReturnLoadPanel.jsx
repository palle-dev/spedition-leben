import React, { useState, useCallback } from "react";
import { useGame } from "@/lib/gameContext";
import { getReturnLoadSuggestions, formatEuro, formatDuration } from "@/lib/networkData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { ArrowRight, Package, AlertTriangle, Check, Loader2 } from "lucide-react";
import { CITY_GEO } from "@/lib/geoData";
import { formatGameTime } from "@/lib/gameData";

// Rückladungs-Panel: Zeigt Anschlussaufträge für ein Fahrzeug, eine Tour oder einen Zielort.
// Nutzt die vorhandene Tourenplanung für Zulässigkeitsprüfungen.
// Die Bestätigung führt die vorhandenen Annahme- und Dispositionsbefehle aus.
export default function ReturnLoadPanel({ initialVehicleId, initialTripId, initialDestCity }) {
  const { state, send, showToast } = useGame();
  const [mode, setMode] = useState(initialVehicleId ? "vehicle" : initialTripId ? "trip" : "city");
  const [vehicleId, setVehicleId] = useState(initialVehicleId || "");
  const [tripId, setTripId] = useState(initialTripId || "");
  const [destCity, setDestCity] = useState(initialDestCity || "");
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setPreview(null);
    try {
      const opts = mode === "vehicle" ? { vehicleId } : mode === "trip" ? { tripId } : { destCity };
      const res = getReturnLoadSuggestions(state, opts);
      setSuggestions(res);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [mode, vehicleId, tripId, destCity, state, showToast]);

  const handlePreview = useCallback(async (candidate) => {
    if (!candidate.enriched) return;
    setPreview(candidate);
  }, []);

  const handleConfirm = useCallback(async (candidate) => {
    if (!candidate.enriched || !candidate.plan) return;
    setConfirming(candidate.order.id);
    try {
      // Erneute Verfügbarkeitsprüfung: Auftrag noch verfügbar?
      const order = state.orders.find(o => o.id === candidate.order.id);
      if (!order || (order.status !== "offered" && order.status !== "angenommen")) {
        showToast("Auftrag ist nicht mehr verfügbar.", "error");
        setSuggestions(null);
        setPreview(null);
        return;
      }
      // Fahrzeug/Fahrer noch verfügbar?
      const vehicle = state.vehicles.find(v => v.id === candidate.vehicleId);
      if (!vehicle) {
        showToast("Fahrzeug nicht mehr verfügbar.", "error");
        return;
      }

      // Auftrag annehmen falls noch nicht angenommen
      if (order.status === "offered") {
        await send("acceptOrder", { orderId: order.id });
      }

      // Transport starten (vorhandener Befehl)
      const result = await send("startTransport", {
        vehicleId: candidate.vehicleId,
        driverId: candidate.driverId,
        orderIds: [order.id],
      });

      if (result?.ok !== false) {
        showToast("Anschlussauftrag übernommen und disponiert.", "success");
        setSuggestions(null);
        setPreview(null);
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setConfirming(null);
    }
  }, [state, send, showToast]);

  return (
    <div className="flex flex-col h-full">
      {/* Such-Eingabe */}
      <div className="shrink-0 space-y-2 pb-3 border-b border-white/10">
        <div className="flex gap-1">
          {[
            { key: "vehicle", label: "Fahrzeug" },
            { key: "trip", label: "Tour" },
            { key: "city", label: "Zielort" },
          ].map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition ${mode === m.key ? "bg-lime/15 text-lime border border-lime/25" : "bg-white/5 text-muted-foreground border border-white/10"}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "vehicle" && (
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
            <option value="">Fahrzeug wählen…</option>
            {(state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived").map(v => (
              <option key={v.id} value={v.id}>{vehicleDisplayName(v)} — {v.locationCity}</option>
            ))}
          </select>
        )}
        {mode === "trip" && (
          <select value={tripId} onChange={e => setTripId(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
            <option value="">Laufende Tour wählen…</option>
            {(state.trips || []).filter(t => t.status === "in_progress").map(t => {
              const v = state.vehicles.find(x => x.id === t.vehicleId);
              const o = state.orders.find(x => x.id === t.orderId);
              return <option key={t.id} value={t.id}>{v ? vehicleDisplayName(v) : t.id} — {o?.customer || "—"}</option>;
            })}
          </select>
        )}
        {mode === "city" && (
          <select value={destCity} onChange={e => setDestCity(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
            <option value="">Zielort wählen…</option>
            {Object.keys(CITY_GEO).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        <button
          onClick={handleSearch}
          disabled={loading || (mode === "vehicle" && !vehicleId) || (mode === "trip" && !tripId) || (mode === "city" && !destCity)}
          className="w-full rounded-lg px-3 py-2 text-sm bg-lime/15 text-lime border border-lime/25 hover:bg-lime/20 disabled:opacity-40 transition flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
          Anschlussaufträge suchen
        </button>
      </div>

      {/* Ergebnisse */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-1.5 scrollbar-none">
        {!suggestions && !loading && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Wähle ein Fahrzeug, eine Tour oder einen Zielort, um passende Anschlussaufträge zu finden.
          </div>
        )}
        {suggestions?.error && (
          <div className="text-center text-coral text-sm py-4">{suggestions.error}</div>
        )}
        {suggestions?.candidates?.map(c => (
          <div
            key={c.order.id}
            className={`rounded-lg border p-2.5 transition cursor-pointer ${preview?.order.id === c.order.id ? "border-lime/40 bg-lime/5" : "border-white/8 bg-white/[0.02] hover:bg-white/5"}`}
            onClick={() => handlePreview(c)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Package className="w-3.5 h-3.5 text-muted-foreground" />
                {c.order.customer}
              </div>
              {c.enriched ? (
                <div className="text-right">
                  <div className="text-sm font-semibold text-lime">+{formatEuro(c.additionalContributionCents)}</div>
                </div>
              ) : (
                <span className="text-[10px] text-coral/80">nicht planbar</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <span>{c.order.fromCity}</span>
              <ArrowRight className="w-3 h-3" />
              <span>{c.order.toCity}</span>
              <span className="ml-1">· {c.order.tons}t</span>
            </div>
            {c.enriched && (
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div><span className="text-muted-foreground">Zus. Leerfahrt</span><div className="text-foreground">{c.additionalEmptyKm > 0 ? c.additionalEmptyKm + " km" : "—"}</div></div>
                <div><span className="text-muted-foreground">Zus. Zeit</span><div className="text-foreground">{formatDuration(c.additionalDurationMin)}</div></div>
                <div><span className="text-muted-foreground">Vergütung</span><div className="text-foreground">{formatEuro(c.additionalRevenueCents)}</div></div>
              </div>
            )}
            {c.deadlineRisk && (
              <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-300/80">
                <AlertTriangle className="w-2.5 h-2.5" /> {c.deadlineRisk}
              </div>
            )}
            {c.error && (
              <div className="text-[10px] text-coral/70 mt-1">{c.error}</div>
            )}
          </div>
        ))}

        {/* Bestätigung-Vorschau */}
        {preview && preview.enriched && (
          <div className="mt-2 rounded-lg border border-lime/30 bg-lime/5 p-3 space-y-2">
            <div className="text-xs font-medium text-lime">Vorschau bestätigen</div>
            <div className="text-[11px] text-muted-foreground space-y-0.5">
              <div>Auftrag: {preview.order.customer} — {preview.order.fromCity} → {preview.order.toCity}</div>
              <div>Fahrzeug: {vehicleDisplayName(state.vehicles.find(v => v.id === preview.vehicleId))}</div>
              <div>Zus. Deckungsbeitrag: <span className="text-lime font-medium">{formatEuro(preview.additionalContributionCents)}</span></div>
              <div>Geplante Ankunft: {formatGameTime(preview.tourEndMin)}</div>
            </div>
            <button
              onClick={() => handleConfirm(preview)}
              disabled={!!confirming}
              className="w-full rounded-lg px-3 py-2 text-sm bg-lime text-ink font-medium hover:bg-lime/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {confirming === preview.order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Bestätigen — Auftrag annehmen und disponieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}