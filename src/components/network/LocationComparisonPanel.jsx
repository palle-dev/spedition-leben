import React, { useMemo, useState, useCallback } from "react";
import { useGame } from "@/lib/gameContext";
import { compareLocations, formatEuro } from "@/lib/networkData";
import { CITY_GEO } from "@/lib/geoData";
import { Check, X, Plus, MapPin, Award } from "lucide-react";

// Standortvergleich: Vergleicht bis zu drei Städte mit einheitlichen Kriterien.
// Verändert keinen Zustand.
export default function LocationComparisonPanel({ initialCities, onOpenBranch }) {
  const { state } = useGame();
  const [cities, setCities] = useState(initialCities || []);
  const [addingCity, setAddingCity] = useState("");

  const comparison = useMemo(
    () => cities.length > 0 ? compareLocations(state, cities, 30) : null,
    [state, cities]
  );

  const addCity = useCallback(() => {
    if (!addingCity) return;
    if (cities.length >= 3) return;
    if (cities.includes(addingCity)) return;
    setCities([...cities, addingCity]);
    setAddingCity("");
  }, [addingCity, cities]);

  const removeCity = useCallback((c) => {
    setCities(cities.filter(x => x !== c));
  }, [cities]);

  const availableCities = Object.keys(CITY_GEO).filter(c => !cities.includes(c));

  return (
    <div className="flex flex-col h-full">
      {/* Eingabe */}
      <div className="shrink-0 space-y-2 pb-3 border-b border-white/10">
        <div className="flex gap-1.5">
          <select value={addingCity} onChange={e => setAddingCity(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground">
            <option value="">Stadt hinzufügen…</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={addCity} disabled={!addingCity || cities.length >= 3} className="rounded-lg px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Hinzufügen
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground">{cities.length}/3 Städte ausgewählt</div>
      </div>

      {/* Vergleich */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 scrollbar-none">
        {cities.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Füge bis zu drei Städte hinzu, um sie zu vergleichen.
          </div>
        )}
        {comparison && (
          <div className="space-y-3">
            {/* Empfehlung */}
            {comparison.bestCityIndex >= 0 && (
              <div className="flex items-start gap-1.5 rounded-lg border border-lime/20 bg-lime/5 p-2.5 text-xs">
                <Award className="w-4 h-4 text-lime shrink-0 mt-0.5" />
                <div>
                  <div className="text-lime font-medium">Empfehlung</div>
                  <div className="text-foreground/80">{comparison.bestCityLabel}</div>
                </div>
              </div>
            )}

            {/* Vergleichstabelle */}
            <div className="rounded-lg border border-white/8 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5">
                    <th className="text-left p-2 text-[10px] uppercase text-muted-foreground">Kriterium</th>
                    {comparison.cities.map((c, i) => (
                      <th key={c} className="text-center p-2 text-[10px]">
                        <div className="flex items-center justify-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {c}
                          <button onClick={() => removeCity(c)} className="ml-1 text-muted-foreground hover:text-coral"><X className="w-3 h-3" /></button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.comparison.map(c => (
                    <tr key={c.key} className="border-t border-white/5">
                      <td className="p-2 text-muted-foreground">{c.label}</td>
                      {c.values.map((v, i) => (
                        <td key={i} className={`text-center p-2 ${i === c.bestIndex ? "text-lime font-medium" : "text-foreground/70"}`}>
                          {formatComparisonValue(c.key, v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detail-Analysen */}
            {comparison.analyses.map((a, i) => (
              <div key={i} className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <MapPin className="w-3.5 h-3.5 text-lime" /> {a.city}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.canOpen ? <Check className="w-3.5 h-3.5 text-lime" /> : <X className="w-3.5 h-3.5 text-coral" />}
                    <span className={`text-[10px] ${a.canOpen ? "text-lime" : "text-coral"}`}>{a.canOpen ? "Eröffnung zulässig" : "Nicht zulässig"}</span>
                  </div>
                </div>

                {/* Bestehende Filialen im Umfeld */}
                {a.nearbyBranches.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">Filialen im Umfeld (≤ 300 km)</div>
                    {a.nearbyBranches.map(b => (
                      <div key={b.city} className="text-[10px] text-foreground/70">{b.city} ({b.name}) — {b.distanceKm} km</div>
                    ))}
                  </div>
                )}

                {/* Eröffnungs-Aktion */}
                {a.canOpen && (
                  <button
                    onClick={() => onOpenBranch?.(a.city)}
                    className="w-full rounded-lg px-2.5 py-1.5 text-xs bg-lime/10 text-lime border border-lime/20 hover:bg-lime/15 transition"
                  >
                    Filiale in {a.city} eröffnen (über bestehenden Ablauf)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatComparisonValue(key, v) {
  if (key === "dailyCost") return formatEuro(v);
  if (key === "canOpen") return v ? "Ja" : "Nein";
  return v;
}