import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { ArrowRight, Truck, Users, MapPin, Clock, Wallet, Check } from "lucide-react";

export default function MoveResourceDialog({ resource, resourceType, onClose }) {
  const { state, send, showToast } = useGame();
  const [targetBranchId, setTargetBranchId] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeBranches = state.branches.filter(b => b.status === "active" && b.id !== resource.branchId);
  const currentBranch = state.branches.find(b => b.id === resource.branchId);

  async function doPreview(branchId) {
    setTargetBranchId(branchId);
    setPreview(null);
    if (!branchId) return;
    setLoading(true);
    try {
      const cmd = resourceType === "vehicle" ? "previewMoveVehicle" : "previewMoveDriver";
      const params = resourceType === "vehicle"
        ? { vehicleId: resource.id, targetBranchId: branchId }
        : { driverId: resource.id, targetBranchId: branchId };
      const r = await send(cmd, params);
      setPreview(r);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!targetBranchId) return;
    setSaving(true);
    try {
      const cmd = resourceType === "vehicle" ? "moveVehicle" : "moveDriver";
      const params = resourceType === "vehicle"
        ? { vehicleId: resource.id, targetBranchId }
        : { driverId: resource.id, targetBranchId };
      const r = await send(cmd, params);
      const targetBranch = state.branches.find(b => b.id === targetBranchId);
      if (r.instant) {
        showToast(`${resourceType === "vehicle" ? "Fahrzeug" : "Fahrer"} sofort in ${targetBranch?.city} umgezogen.`, "success");
      } else {
        showToast(`${resourceType === "vehicle" ? "Überstellung" : "Reise"} nach ${targetBranch?.city} gestartet – Ankunft ${formatGameTime(r.endMin)}.`, "success");
      }
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const title = resourceType === "vehicle"
    ? `${vehicleDisplayName(resource)} verschieben`
    : `${resource.name} verschieben`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {resourceType === "vehicle" ? <Truck className="w-5 h-5 text-lime" /> : <Users className="w-5 h-5 text-lime" />}
          <h2 className="text-lg font-medium">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Aktuell in {currentBranch?.name || "—"} ({resource.locationCity})
        </p>

        {/* Zielfiliale wählen */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Zielfiliale</label>
          <div className="space-y-1.5">
            {activeBranches.map(b => (
              <button
                key={b.id}
                onClick={() => doPreview(b.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 border transition flex items-center justify-between ${
                  targetBranchId === b.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
                }`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  {b.name} · {b.city}
                </span>
                {targetBranchId === b.id && <Check className="w-4 h-4 text-lime" />}
              </button>
            ))}
          </div>
          {activeBranches.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">Keine weiteren aktiven Filialen verfügbar.</div>
          )}
        </div>

        {/* Vorschau */}
        {loading && (
          <div className="flex items-center justify-center py-3">
            <span className="w-5 h-5 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
          </div>
        )}
        {preview && !loading && (
          <div className="rounded-lg border border-white/10 bg-surface-2/50 px-3 py-3 mb-4 space-y-1.5">
            {preview.instant ? (
              <div className="text-sm text-lime flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Gleiche Stadt – sofortiger Umzug, keine Kosten.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Entfernung</span>
                  <span className="tabular-nums">{preview.distKm} km</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Dauer</span>
                  <span className="tabular-nums">{resourceType === "vehicle" ? formatGameTime(state.gameTime + preview.durationMin) : formatGameTime(state.gameTime + preview.durationMin)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3 h-3" /> Kosten</span>
                  <span className="tabular-nums">
                    {resourceType === "vehicle"
                      ? `${formatEuro(preview.fuelCents)} Kraftstoff + ${formatEuro(preview.tollCents)} Maut`
                      : formatEuro(preview.costCents)}
                  </span>
                </div>
                {resourceType === "vehicle" && (
                  <div className="text-[10px] text-muted-foreground/70 pt-1">Ein freier Fahrer am Standort überstellt das Fahrzeug per Leerfahrt.</div>
                )}
                {resourceType === "driver" && (
                  <div className="text-[10px] text-muted-foreground/70 pt-1">Der Fahrer reist per Bahn/Bus und ist während der Reise nicht verfügbar.</div>
                )}
              </>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={!targetBranchId || saving || (preview && !preview.ok)}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Verschieben</>}
          </button>
        </div>
      </div>
    </div>
  );
}