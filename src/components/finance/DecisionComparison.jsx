import React, { useState, useMemo } from "react";
import { Calculator, GitCompare, X, Info } from "lucide-react";
import { computeLiquidityForecast, getDecisionImpact } from "@/lib/simulation/liquidityForecastEngine";
import { VEHICLE_CATALOG_LIST } from "@/lib/simulation/gameRules";
import { LEASING_OFFERS } from "@/lib/simulation/financingEngine";
import { formatEuro } from "@/lib/forecastData";

// Entscheidungsvergleich: vergleicht den aktuellen Plan mit
// bis zu zwei Varianten (Fahrzeug kaufen/leasen, MA einstellen, Filiale eröffnen).
export default function DecisionComparison({ state, horizonDays, assumptions }) {
  const [variants, setVariants] = useState([
    { id: "v1", type: null, params: {} },
    { id: "v2", type: null, params: {} },
  ]);

  // Basisprognose (ohne Entscheidung)
  const baseForecast = useMemo(() => {
    return computeLiquidityForecast(state, {
      horizonDays,
      view: "expected",
      assumptions,
      minBufferCents: 20000,
    });
  }, [state, horizonDays, assumptions]);

  // Prognosen für aktive Varianten
  const variantForecasts = useMemo(() => {
    return variants.map(v => {
      if (!v.type) return null;
      return computeLiquidityForecast(state, {
        horizonDays,
        view: "expected",
        assumptions,
        minBufferCents: 20000,
        decision: { ...v, id: v.id },
      });
    });
  }, [state, horizonDays, assumptions, variants]);

  return (
    <div className="rounded-lg border border-lime/20 bg-lime/3 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Calculator className="w-4 h-4 text-lime" />
            Auswirkung prüfen — unverbindlicher Vergleich
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Vergleicht maximal zwei Varianten mit dem aktuellen Plan. Führt keine Anschaffung, Einstellung oder Eröffnung aus.
          </p>
        </div>
      </div>

      {/* Varianten-Auswahl */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {variants.map((v, idx) => (
          <VariantSelector
            key={v.id}
            variant={v}
            state={state}
            onChange={(newV) => setVariants(prev => prev.map(x => x.id === v.id ? newV : x))}
            onClear={() => setVariants(prev => prev.map(x => x.id === v.id ? { id: v.id, type: null, params: {} } : x))}
          />
        ))}
      </div>

      {/* Vergleichstabelle */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-white/5 text-xs font-medium text-muted-foreground">
          <div>Kennzahl</div>
          <div>Aktueller Plan</div>
          {variants.map((v, i) => (
            <div key={v.id}>Variante {i + 1}{v.type ? "" : " (leer)"}</div>
          ))}
        </div>

        <ComparisonRow
          label="Sofort benötigte Mittel"
          baseValue={0}
          variantValues={variantForecasts.map((f, i) => {
            if (!f) return null;
            const impact = getDecisionImpact(state, { ...variants[i], id: variants[i].id });
            return impact ? impact.immediateCashRequired : 0;
          })}
          format={formatEuro}
        />
        <ComparisonRow
          label="Zusätzliche laufende Kosten/Tag"
          baseValue={0}
          variantValues={variantForecasts.map((f, i) => {
            if (!f) return null;
            const impact = getDecisionImpact(state, { ...variants[i], id: variants[i].id });
            return impact ? impact.additionalDailyCostCents : 0;
          })}
          format={formatEuro}
        />
        <ComparisonRow
          label="Firma Endsaldo"
          baseValue={baseForecast.company.endBalance}
          variantValues={variantForecasts.map(f => f ? f.company.endBalance : null)}
          format={formatEuro}
          highlightNeg
        />
        <ComparisonRow
          label="Firma niedrigster Stand"
          baseValue={baseForecast.company.minBalance}
          baseSub={`T${baseForecast.company.minBalanceDay}`}
          variantValues={variantForecasts.map(f => f ? f.company.minBalance : null)}
          variantSubs={variantForecasts.map(f => f ? `T${f.company.minBalanceDay}` : null)}
          format={formatEuro}
          highlightNeg
        />
        <ComparisonRow
          label="Privat niedrigster Stand"
          baseValue={baseForecast.private.minBalance}
          baseSub={`T${baseForecast.private.minBalanceDay}`}
          variantValues={variantForecasts.map(f => f ? f.private.minBalance : null)}
          variantSubs={variantForecasts.map(f => f ? `T${f.private.minBalanceDay}` : null)}
          format={formatEuro}
          highlightNeg
        />
      </div>

      {/* Hinweise zu Unsicherheiten */}
      <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-1.5">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-muted-foreground" />
          Unsichere Annahmen
        </div>
        {variantForecasts.map((f, i) => {
          if (!f) return null;
          const impact = getDecisionImpact(state, { ...variants[i], id: variants[i].id });
          if (!impact) return null;
          return (
            <div key={variants[i].id} className="text-xs">
              <span className="text-muted-foreground">Variante {i + 1}: </span>
              <span className="text-foreground/80">{impact.uncertainAssumptions.join(" · ")}</span>
            </div>
          );
        })}
        <div className="text-[11px] text-muted-foreground mt-1">
          Mehr Kapazität erzeugt nicht automatisch zusätzliche Umsätze. Zusätzliche Erlöse nur aus konkret zugeordneten Geschäftsmöglichkeiten.
        </div>
      </div>

      {/* Notizen zu bestehenden Bindungen */}
      <div className="space-y-2">
        {variantForecasts.map((f, i) => {
          if (!f) return null;
          const impact = getDecisionImpact(state, { ...variants[i], id: variants[i].id });
          if (!impact) return null;
          return (
            <div key={variants[i].id} className="rounded-lg border border-white/10 bg-white/3 p-3">
              <div className="text-xs font-medium mb-1">Variante {i + 1}: {impact.label}</div>
              <ul className="space-y-0.5">
                {impact.notes.map((n, j) => (
                  <li key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <span className="text-lime mt-0.5">•</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VariantSelector({ variant, state, onChange, onClear }) {
  const types = [
    { value: "buyVehicle", label: "Fahrzeug kaufen" },
    { value: "leaseVehicle", label: "Fahrzeug leasen" },
    { value: "hireEmployee", label: "Mitarbeiter einstellen" },
    { value: "openBranch", label: "Filiale eröffnen" },
  ];

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Entscheidung wählen</span>
        {variant.type && (
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <select
        value={variant.type || ""}
        onChange={e => onChange({ ...variant, type: e.target.value || null, params: {} })}
        className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
      >
        <option value="">— Keine —</option>
        {types.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Typspezifische Parameter */}
      {variant.type === "buyVehicle" && (
        <select
          value={variant.params.vehicleType || "standard"}
          onChange={e => onChange({ ...variant, params: { vehicleType: e.target.value } })}
          className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
        >
          {VEHICLE_CATALOG_LIST.map(v => (
            <option key={v.id} value={v.id}>{v.label} — {formatEuro(v.priceCents)}</option>
          ))}
        </select>
      )}
      {variant.type === "leaseVehicle" && (
        <select
          value={variant.params.offerId || "standard_flex"}
          onChange={e => onChange({ ...variant, params: { offerId: e.target.value } })}
          className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
        >
          {Object.values(LEASING_OFFERS).map(o => (
            <option key={o.id} value={o.id}>{o.vehicleType} ({o.id}) — {formatEuro(o.monthlyRateCents)}/Monat</option>
          ))}
        </select>
      )}
      {variant.type === "hireEmployee" && (
        <select
          value={variant.params.applicantId || ""}
          onChange={e => onChange({ ...variant, params: { applicantId: e.target.value || null } })}
          className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
        >
          <option value="">Verfügbarer Bewerber (geschätzt)</option>
          {(state.availableApplicants || []).slice(0, 10).map(a => (
            <option key={a.id} value={a.id}>{a.name} — {a.role || "Fahrer"}</option>
          ))}
        </select>
      )}
      {variant.type === "openBranch" && (
        <select
          value={variant.params.city || ""}
          onChange={e => onChange({ ...variant, params: { city: e.target.value } })}
          className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
        >
          <option value="">Stadt wählen</option>
          {["Berlin", "München", "Köln", "Frankfurt", "Stuttgart", "Hannover", "Leipzig", "Dortmund"].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ComparisonRow({ label, baseValue, baseSub, variantValues, variantSubs, format, highlightNeg }) {
  return (
    <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-white/5 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className={`tabular-nums ${highlightNeg && baseValue < 0 ? "text-red-400" : "text-foreground"}`}>
        {format(baseValue)}
        {baseSub && <span className="text-[10px] text-muted-foreground ml-1">{baseSub}</span>}
      </div>
      {variantValues.map((v, i) => (
        <div key={i} className={`tabular-nums ${v === null ? "text-muted-foreground/40" : highlightNeg && v < 0 ? "text-red-400" : "text-foreground"}`}>
          {v === null ? "—" : format(v)}
          {variantSubs && variantSubs[i] && <span className="text-[10px] text-muted-foreground ml-1">{variantSubs[i]}</span>}
        </div>
      ))}
    </div>
  );
}