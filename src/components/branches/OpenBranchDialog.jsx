import { countryOf } from "@/lib/simulation/dachGeography";
import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { ALL_CITIES, BRANCH_OPEN_FEE, BRANCH_MIN_GAME_DAY, BRANCH_MIN_CAPITAL_RATIO, CITY_LATLON } from "@/lib/branchData";
import BranchPlanningMap from "./BranchPlanningMap";
import { Building2, MapPin, Plus, Check, AlertCircle, Wallet, Ruler, Crown } from "lucide-react";

// Haversine-Distanz in km
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function OpenBranchDialog({ onClose }) {
  const { state, send, showToast } = useGame();
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const day = Math.floor(state.gameTime / 1440) + 1;
  const existingBranches = state.branches.filter(b => b.status === "active");
  const existingCities = new Set(existingBranches.map(b => b.city));
  const availableCities = ALL_CITIES.filter(c => !existingCities.has(c) && (state.dach?.enabled || countryOf(c)==="DE"));

  const reqCheck = {
    dayOk: day >= BRANCH_MIN_GAME_DAY,
    capitalOk: state.company.accountCents >= BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO,
    noOpenCosts: !state.openCosts.some(o => o.account === "company"),
  };
  const allOk = reqCheck.dayOk && reqCheck.capitalOk && reqCheck.noOpenCosts && city;

  // Entfernungen zur ausgewählten Stadt
  const distances = useMemo(() => {
    if (!city) return [];
    const center = CITY_LATLON[city];
    if (!center) return [];
    return existingBranches
      .map(b => {
        const target = CITY_LATLON[b.city];
        if (!target) return null;
        return { branch: b, km: Math.round(haversineKm(center, target)) };
      })
      .filter(Boolean)
      .sort((a, b) => a.km - b.km);
  }, [city, existingBranches]);

  const avgDist = distances.length > 0 ? Math.round(distances.reduce((s, d) => s + d.km, 0) / distances.length) : 0;
  const minDist = distances.length > 0 ? distances[0].km : 0;
  const maxDist = distances.length > 0 ? distances[distances.length - 1].km : 0;

  async function submit() {
    if (!city || !allOk) return;
    setSaving(true);
    try {
      await send("openBranch", { city, name: name.trim() || undefined });
      showToast(`Filiale in ${city} eröffnet – Lkw und Fahrer vor Ort einsatzbereit.`, "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="glass border border-white/15 rounded-2xl p-5 max-w-4xl w-full max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-lime" />
          <h2 className="text-xl font-medium">Filiale eröffnen</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Wähle den optimalen Standort anhand der Karte und der Entfernungen zu deinen bestehenden Filialen.</p>

        {/* Voraussetzungen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-4">
          <ReqRow ok={reqCheck.dayOk} label={`Tag ≥ ${BRANCH_MIN_GAME_DAY}`} value={`Tag ${day}`} />
          <ReqRow ok={reqCheck.capitalOk} label={`Konto ≥ ${formatEuro(BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO)}`} value={formatEuro(state.company.accountCents)} />
          <ReqRow ok={reqCheck.noOpenCosts} label="Keine offenen Kosten" value={reqCheck.noOpenCosts ? "Erfüllt" : "Offen"} />
        </div>

        {/* Karte + Seitenleiste */}
        <div className="grid lg:grid-cols-[1fr_280px] gap-4 mb-4">
          {/* Karte */}
          <div className="h-[380px]">
            <BranchPlanningMap
              availableCities={availableCities}
              existingBranches={existingBranches}
              selectedCity={city}
              onSelectCity={setCity}
            />
          </div>

          {/* Seitenleiste: Entfernungsanalyse */}
          <div className="space-y-2">
            {city ? (
              <>
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Ruler className="w-3 h-3" /> Entfernungsanalyse
                </div>
                <div className="glass border border-white/10 rounded-lg p-3">
                  <div className="text-sm font-medium text-amber-300 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> {city}
                  </div>
                  {distances.length === 0 ? (
                    <div className="text-xs text-muted-foreground">Keine bestehenden Filialen zum Vergleich.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <DistStat label="Min" value={minDist} />
                        <DistStat label="Ø" value={avgDist} />
                        <DistStat label="Max" value={maxDist} />
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {distances.map(d => (
                          <div key={d.branch.id} className="flex items-center justify-between text-xs px-2 py-1 rounded-md bg-surface-2/40">
                            <span className="flex items-center gap-1 truncate">
                              {d.branch.isHeadquarters ? <Crown className="w-3 h-3 text-amber-300 shrink-0" /> : <Building2 className="w-3 h-3 text-lime/60 shrink-0" />}
                              <span className="truncate">{d.branch.name}</span>
                            </span>
                            <span className="tabular-nums text-muted-foreground shrink-0 ml-2">{d.km} km</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="glass border border-white/10 rounded-lg p-4 text-center">
                <MapPin className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Klicke auf einen Marker in der Karte oder wähle eine Stadt aus der Liste, um die Entfernungsanalyse zu sehen.</p>
              </div>
            )}

            {/* Stadt-Liste (kompakt) */}
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 block">Verfügbare Städte</label>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                {availableCities.map(c => (
                  <button
                    key={c}
                    onClick={() => setCity(c)}
                    className={`text-left rounded-md px-2 py-1.5 text-xs border transition ${
                      city === c ? "border-amber-300/40 bg-amber-300/10 text-amber-300" : "border-white/10 hover:border-white/20 text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {availableCities.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-2">Alle Städte belegt.</div>
              )}
            </div>
          </div>
        </div>

        {/* Filialname + Kosten */}
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 block">Filialname (optional)</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={city ? `Filiale ${city}` : "Wähle zuerst eine Stadt"}
              className="w-full rounded-lg bg-surface-2/50 border border-white/10 px-3 py-2.5 text-sm focus:border-lime/40 focus:outline-none"
            />
          </div>
          <div className="rounded-lg border border-lime/20 bg-lime/5 px-3 py-2.5 flex flex-col justify-center">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Eröffnungsgebühr</span>
              <span className="font-medium tabular-nums">{formatEuro(BRANCH_OPEN_FEE)}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">Inklusive eines Standard-Lkw und eines Fahrers vor Ort.</div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={!allOk || saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> {city ? `In ${city} eröffnen` : "Eröffnen"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReqRow({ ok, label, value }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border ${ok ? "border-lime/20 bg-lime/5" : "border-red-400/20 bg-red-500/5"}`}>
      <span className="flex items-center gap-1.5 min-w-0">
        {ok ? <Check className="w-3.5 h-3.5 text-lime shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className={`truncate ${ok ? "text-foreground" : "text-red-300"}`}>{label}</span>
      </span>
      <span className={`tabular-nums shrink-0 ml-2 ${ok ? "text-muted-foreground" : "text-red-300"}`}>{value}</span>
    </div>
  );
}

function DistStat({ label, value }) {
  return (
    <div className="rounded-md bg-surface-2/40 border border-white/5 px-1.5 py-1 text-center">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-xs font-medium tabular-nums">{value} km</div>
    </div>
  );
}