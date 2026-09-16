import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { getLocationAnalysis, formatEuro } from "@/lib/networkData";
import { CITY_GEO } from "@/lib/geoData";
import { Building2, Users, Package, Truck, Check, X, AlertTriangle, MapPin } from "lucide-react";

// Standortanalyse: Zeigt tatsächliche Daten für eine Stadt als möglichen Filialstandort.
// Verändert keinen Zustand — die Eröffnung erfolgt über den bestehenden Filialprozess.
export default function LocationAnalysisPanel({ initialCity, onCompareCity }) {
  const { state } = useGame();
  const [city, setCity] = useState(initialCity || "");
  const [periodDays, setPeriodDays] = useState(30);

  const analysis = useMemo(
    () => city ? getLocationAnalysis(state, city, periodDays) : null,
    [state, city, periodDays]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Eingabe */}
      <div className="shrink-0 space-y-2 pb-3 border-b border-white/10">
        <select value={city} onChange={e => setCity(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
          <option value="">Stadt wählen…</option>
          {Object.keys(CITY_GEO).map(c => (
            <option key={c} value={c} disabled={(state.branches || []).some(b => b.city === c && b.status === "active")}>
              {c}{(state.branches || []).some(b => b.city === c && b.status === "active") ? " (Filiale aktiv)" : ""}
            </option>
          ))}
        </select>
        <select value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
          <option value={7}>Letzte 7 Tage</option>
          <option value={14}>Letzte 14 Tage</option>
          <option value={30}>Letzte 30 Tage</option>
          <option value={90}>Letzte 90 Tage</option>
        </select>
      </div>

      {/* Analyse */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 scrollbar-none">
        {!analysis && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Wähle eine Stadt für die Standortanalyse.
          </div>
        )}
        {analysis?.error && <div className="text-center text-coral text-sm py-4">{analysis.error}</div>}
        {analysis && !analysis.error && (
          <div className="space-y-3">
            {/* Kopf */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-base font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-lime" /> {analysis.city}
                </div>
                <div className="text-[10px] text-muted-foreground">Region: {analysis.regionLabel} · {analysis.coverageLabel}</div>
              </div>
              <button
                onClick={() => onCompareCity?.(analysis.city)}
                className="rounded-lg px-2.5 py-1.5 text-xs bg-white/5 text-foreground border border-white/10 hover:bg-white/10 transition"
              >
                Zum Vergleich hinzufügen
              </button>
            </div>

            {/* Eröffnungsregeln */}
            <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Eröffnungsregeln</div>
              <div className="space-y-1">
                {Object.entries(analysis.requirements).map(([key, r]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {r.met ? <Check className="w-3.5 h-3.5 text-lime" /> : <X className="w-3.5 h-3.5 text-coral" />}
                    <span className={r.met ? "text-foreground/80" : "text-coral/80"}>{r.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-white/8 text-[10px] text-muted-foreground">
                Eröffnungsgebühr: <span className="text-foreground">{formatEuro(analysis.openFeeCents)}</span> · Täglich: <span className="text-foreground">{formatEuro(analysis.dailyCostCents)}</span>
              </div>
            </div>

            {/* Beobachtete Daten */}
            <Section title="Beobachtete Marktinformationen" icon={Package}>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <DataItem label="Kunden vor Ort" value={analysis.localCustomers.length} />
                <DataItem label="Kunden in Region" value={analysis.regionalCustomerCount} />
                <DataItem label="Beobachtetes Aufkommen" value={analysis.observedOrderCount} suffix=" Aufträge" />
                <DataItem label="Vertragsverpflichtungen" value={analysis.activeContracts.length} />
              </div>
              {analysis.localCustomers.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {analysis.localCustomers.map(c => (
                    <div key={c.id} className="text-[10px] text-muted-foreground">{c.name} — {c.industry}</div>
                  ))}
                </div>
              )}
            </Section>

            {/* Verfügbare Ressourcen */}
            <Section title="Verfügbare Ressourcen am Ort" icon={Truck}>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <DataItem label="Fahrzeuge" value={analysis.vehiclesHere} />
                <DataItem label="Fahrer" value={analysis.driversHere} />
                <DataItem label="Mitarbeiter" value={analysis.employeesHere} />
              </div>
            </Section>

            {/* Aktive Verträge */}
            {analysis.activeContracts.length > 0 && (
              <Section title="Vertragsverpflichtungen" icon={Building2}>
                <div className="space-y-1">
                  {analysis.activeContracts.map(c => (
                    <div key={c.id} className="text-[10px] text-muted-foreground">
                      {c.customerName}: {c.fromCity} → {c.toCity}, {c.transportsPerDay}/Tag
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Bekannte Relationen */}
            {analysis.nearbyRelations.length > 0 && (
              <Section title="Bekannte Auftragsrelationen" icon={Package}>
                <div className="space-y-0.5 max-h-32 overflow-y-auto scrollbar-none">
                  {analysis.nearbyRelations.map((r, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground">
                      {r.fromCity} → {r.toCity} ({r.customer}) {r.involvesCity && <span className="text-lime/70">· betrifft {analysis.city}</span>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Hinweis */}
            <div className="flex items-start gap-1.5 text-[10px] text-amber-300/70 bg-amber-500/5 rounded-lg p-2 border border-amber-500/10">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{analysis.disclaimer} Keine Gewinnprognose oder Amortisationsdauer.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" /> {title}
      </div>
      {children}
    </div>
  );
}

function DataItem({ label, value, suffix }) {
  return (
    <div>
      <div className="text-muted-foreground text-[10px]">{label}</div>
      <div className="text-foreground font-medium">{value}{suffix}</div>
    </div>
  );
}