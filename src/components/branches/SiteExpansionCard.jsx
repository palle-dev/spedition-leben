import React, { useMemo, useState } from "react";
import { Building2, Hammer, Clock, AlertTriangle } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { getSiteOverview, previewExpansion, EXPANSION_CONFIG } from "@/lib/simulation/siteExpansionEngine";
import { formatEuro, formatDuration, formatGameTimeShort, parkingOccupancyLabel, breakAreaLabel } from "@/lib/siteData";

export default function SiteExpansionCard({ branchId }) {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const [type, setType] = useState("parking");
  const [slots, setSlots] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const overview = useMemo(() => getSiteOverview(state, branchId), [state, branchId]);
  const preview = useMemo(/** @returns {ReturnType<typeof previewExpansion>} */ () => {
    try { return previewExpansion(state, { branchId, type, slots }); }
    catch (e) { return { ok: false, error: e.message }; }
  }, [state, branchId, type, slots]);
  if (!overview) return null;
  const project = overview.activeProject;
  const cfg = EXPANSION_CONFIG[type];
  const blocked = (state.appointments || []).some(a => a.status === "active");
  const affordable = preview.ok === true && state.company.accountCents >= preview.costCents;
  const processing = submitting || busy || !!backgroundAdvance?.active;
  const progress = Math.max(0, Math.min(100, project?.progressPct || 0));
  async function build() {
    if (processing || !affordable || blocked || project) return;
    setSubmitting(true);
    try {
      const result = await send("startSiteExpansion", { branchId, type, slots });
      if (result?.ok) showToast("Ausbau beauftragt. Fertigstellung: " + formatGameTimeShort(result.completionMin), "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }
  return (
    <section className="glass rounded-2xl border border-white/10 p-5 space-y-4" aria-label={"Standortausbau " + overview.branchName}>
      <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-lime" /><div>
        <h2 className="font-semibold">{overview.branchName}</h2>
        <p className="text-xs text-muted-foreground">{overview.city}{overview.isHeadquarters ? " · Hauptsitz" : ""}</p>
      </div></div>
      <dl className="grid sm:grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-muted-foreground">Stellplätze</dt><dd className="font-medium mt-1">{parkingOccupancyLabel(overview)} · {overview.parking.free} frei</dd><dd className="text-xs text-muted-foreground">{overview.parking.present} Fahrzeuge am Hof · {overview.parking.reserved} reserviert</dd></div>
        <div className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-muted-foreground">Werkstatt</dt><dd className="font-medium mt-1">{overview.workshop.slots} Plätze · {overview.workshop.freeSlots} frei</dd><dd className="text-xs text-muted-foreground">{overview.workshop.mechanics} Mechaniker am Standort</dd></div>
        <div className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-muted-foreground">Aufenthaltsbereich</dt><dd className="mt-1">{breakAreaLabel(overview)}</dd></div>
        <div className="rounded-lg bg-white/5 p-3"><dt className="text-xs text-muted-foreground">Standortkosten ohne Personal</dt><dd className="font-medium mt-1">{formatEuro(overview.dailyCostCents)} / Tag</dd></div>
      </dl>
      {overview.workshop.slots > overview.workshop.mechanics && <p className="text-xs text-amber-300">Für alle Werkstattplätze fehlen noch {overview.workshop.slots - overview.workshop.mechanics} Mechaniker. Abwesenheiten können die nutzbare Kapazität zusätzlich begrenzen.</p>}
      {project ? (
        <div className="rounded-xl border border-lime/30 bg-lime/5 p-4 space-y-2" aria-live="polite">
          <h3 className="flex items-center gap-2 font-medium"><Hammer className="w-4 h-4" />{project.label} im Bau</h3>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Baufortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-lime" style={{ width: progress + "%" }} /></div>
          <p className="text-sm">{progress}% · Fertig: {formatGameTimeShort(project.completionMin)}</p>
          <p className="text-xs text-muted-foreground">Noch {formatDuration(Math.max(0, project.completionMin - state.gameTime))}. Vorhandene Kapazitäten bleiben nutzbar. Neue Kapazitäten und Folgekosten gelten ab Fertigstellung.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="font-medium">Standort ausbauen</h3>
          <label className="block text-xs text-muted-foreground">Ausbau
            <select value={type} disabled={processing} onChange={e => { setType(e.target.value); setSlots(1); }} className="block mt-1 w-full bg-surface-2 border border-white/15 rounded-lg p-2.5 text-sm text-foreground">
              {Object.entries(EXPANSION_CONFIG).map(([key, config]) => <option key={key} value={key}>{config.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">{cfg.description}</p>
          {type !== "breakArea" && <label className="block text-xs text-muted-foreground">Zusätzliche Plätze
            <select value={slots} disabled={processing} onChange={e => setSlots(Number(e.target.value))} className="block mt-1 w-full bg-surface-2 border border-white/15 rounded-lg p-2.5 text-sm text-foreground">
              {Array.from({ length: cfg.maxSlots }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>}
          {preview.ok === true ? (
            <div className="rounded-xl bg-white/5 p-3 space-y-2 text-sm" aria-live="polite">
              <p className="flex justify-between gap-3"><span>Baukosten einmalig</span><strong>{formatEuro(preview.costCents)}</strong></p>
              <p className="flex justify-between gap-3"><span>Zusätzliche Kosten ab Fertigstellung</span><strong className="shrink-0">+{formatEuro(preview.dailyCostCents)} / Tag</strong></p>
              <p className="flex items-center gap-2"><Clock className="w-4 h-4" />{formatDuration(preview.buildTimeMin)} · fertig {formatGameTimeShort(preview.completionEstimate)}</p>
              <p className="text-xs text-muted-foreground">{preview.effectDescription}</p>
              <p className="text-xs text-muted-foreground">Firmenkonto nach Beauftragung: {formatEuro(state.company.accountCents - preview.costCents)}</p>
            </div>
          ) : <p role="status" className="text-sm text-amber-300">{preview.error}</p>}
          {preview.ok === true && !affordable && <p className="text-sm text-coral flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Das Firmenkonto reicht für diesen Ausbau nicht aus.</p>}
          {blocked && <p className="text-xs text-amber-300">Bauaufträge sind während deines privaten Termins gesperrt.</p>}
          <button onClick={build} disabled={processing || !affordable || blocked} className="w-full rounded-lg bg-lime text-ink font-semibold px-4 py-3 disabled:opacity-40">{submitting ? "Wird beauftragt…" : "Ausbau verbindlich beauftragen"}</button>
          <p className="text-xs text-muted-foreground">Ein Bauprojekt gleichzeitig je Standort. Die Baukosten werden sofort bezahlt.</p>
        </div>
      )}
    </section>
  );
}
