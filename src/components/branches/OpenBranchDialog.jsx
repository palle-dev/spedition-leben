import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { projectCity, ALL_CITIES, BRANCH_OPEN_FEE, BRANCH_MIN_GAME_DAY, BRANCH_MIN_CAPITAL_RATIO } from "@/lib/branchData";
import { Building2, MapPin, Plus, Check, AlertCircle, Wallet } from "lucide-react";

export default function OpenBranchDialog({ onClose }) {
  const { state, send, showToast } = useGame();
  const [city, setCity] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const day = Math.floor(state.gameTime / 1440) + 1;
  const existingCities = new Set(state.branches.filter(b => b.status === "active").map(b => b.city));
  const availableCities = ALL_CITIES.filter(c => !existingCities.has(c));

  const reqCheck = {
    dayOk: day >= BRANCH_MIN_GAME_DAY,
    capitalOk: state.company.accountCents >= BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO,
    noOpenCosts: !state.openCosts.some(o => o.account === "company"),
  };
  const allOk = reqCheck.dayOk && reqCheck.capitalOk && reqCheck.noOpenCosts && city;

  async function submit() {
    if (!city || !allOk) return;
    setSaving(true);
    try {
      const r = await send("openBranch", { city, name: name.trim() || undefined });
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
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-5 h-5 text-lime" />
          <h2 className="text-xl font-medium">Filiale eröffnen</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Neuer Standort mit Basis-Lkw und Fahrer vor Ort.</p>

        {/* Voraussetzungen */}
        <div className="space-y-1.5 mb-4">
          <ReqRow ok={reqCheck.dayOk} label={`Mindestens Tag ${BRANCH_MIN_GAME_DAY}`} value={`Tag ${day}`} />
          <ReqRow ok={reqCheck.capitalOk} label={`Firmenkonto ≥ ${formatEuro(BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO)}`} value={formatEuro(state.company.accountCents)} />
          <ReqRow ok={reqCheck.noOpenCosts} label="Keine offenen betrieblichen Kosten" value={reqCheck.noOpenCosts ? "Erfüllt" : "Offen"} />
        </div>

        {/* Stadt-Auswahl */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Stadt wählen</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto">
            {availableCities.map(c => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`text-left rounded-lg px-2.5 py-2 text-xs border transition ${
                  city === c ? "border-lime/40 bg-lime/10 text-lime" : "border-white/10 hover:border-white/20 text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {availableCities.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">Alle Städte haben bereits eine Filiale.</div>
          )}
        </div>

        {/* Name (optional) */}
        <div className="mb-4">
          <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 block">Filialname (optional)</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={city ? `Filiale ${city}` : "Wähle zuerst eine Stadt"}
            className="w-full rounded-lg bg-surface-2/50 border border-white/10 px-3 py-2.5 text-sm focus:border-lime/40 focus:outline-none"
          />
        </div>

        {/* Kosten */}
        <div className="rounded-lg border border-lime/20 bg-lime/5 px-3 py-2.5 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Eröffnungsgebühr</span>
            <span className="font-medium tabular-nums">{formatEuro(BRANCH_OPEN_FEE)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">Inklusive eines Standard-Lkw und eines Fahrers vor Ort.</div>
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
            {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> Eröffnen</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReqRow({ ok, label, value }) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs border ${ok ? "border-lime/20 bg-lime/5" : "border-red-400/20 bg-red-500/5"}`}>
      <span className="flex items-center gap-1.5">
        {ok ? <Check className="w-3.5 h-3.5 text-lime" /> : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
        <span className={ok ? "text-foreground" : "text-red-300"}>{label}</span>
      </span>
      <span className={`tabular-nums ${ok ? "text-muted-foreground" : "text-red-300"}`}>{value}</span>
    </div>
  );
}