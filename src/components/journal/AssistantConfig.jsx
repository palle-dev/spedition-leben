import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { Switch } from "@/components/ui/switch";
import { Settings, Loader2, Package, TrendingDown, FileText, Lightbulb, Calculator, Clock, Truck } from "lucide-react";

const FUNCTIONS = [
  { key: "dailyReport", label: "Tagesbericht", icon: FileText, desc: "Tägliche Zusammenfassung per Mail" },
  { key: "autoAcceptOrders", label: "Auto-Auftragsannahme", icon: Package, desc: "Profitable Marktangebote automatisch annehmen" },
  { key: "orderMonitoring", label: "Auftragsüberwachung", icon: Clock, desc: "Lieferfristen überwachen und warnen" },
  { key: "autoDispatch", label: "Auto-Disposition", icon: Truck, desc: "Gefährdete Aufträge automatisch disponieren" },
  { key: "costOptimization", label: "Gemeinkostenoptimierung", icon: TrendingDown, desc: "Standortkosten bei Leerstand senken" },
  { key: "decisionProposals", label: "Entscheidungsvorschläge", icon: Lightbulb, desc: "Vorschläge für anstehende Entscheidungen" },
  { key: "accounting", label: "Buchhaltungs-Support", icon: Calculator, desc: "Buchhaltungsaufgaben vorbereiten" },
];

const DEFAULTS = {
  dailyReport: true,
  autoAcceptOrders: true,
  costOptimization: true,
  decisionProposals: true,
  accounting: true,
  orderMonitoring: true,
  autoDispatch: false,
  autoAcceptMarginPct: 15,
  autoAcceptMinLiquidityCents: 50000,
  autoDispatchHoursBeforeDeadline: 4,
  maxOrdersPerHour: 3,
};

export default function AssistantConfig() {
  const { state, send, showToast } = useGame();
  const config = state.assistantConfig || DEFAULTS;
  const [local, setLocal] = useState(config);
  const [submitting, setSubmitting] = useState(false);

  const hasAssistant = useMemo(
    () => (state.employees || []).some(e => e.role === "assistant" && e.employmentStatus === "employed"),
    [state.employees]
  );

  const hasChanges = useMemo(
    () => JSON.stringify(local) !== JSON.stringify(config),
    [local, config]
  );

  if (!hasAssistant) return null;

  function toggle(key) {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function setLimit(key, value) {
    setLocal(prev => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSubmitting(true);
    try {
      await send("setAssistantConfig", { config: local });
      showToast("Assistenten-Einstellungen aktualisiert.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="w-4 h-4 text-lime/70" />
        <h3 className="font-medium text-sm">Assistenten-Einstellungen</h3>
        <span className="text-[10px] text-muted-foreground/50">— was der Assistent darf und darf nicht</span>
      </div>

      {/* Funktions-Toggles */}
      <div className="grid sm:grid-cols-2 gap-2">
        {FUNCTIONS.map(f => {
          const enabled = local[f.key] !== false;
          return (
            <div
              key={f.key}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors ${
                enabled ? "bg-lime/5 border-lime/15" : "bg-surface-2/30 border-white/5"
              }`}
            >
              <span className={`grid place-items-center w-7 h-7 rounded-md shrink-0 mt-0.5 ${enabled ? "bg-lime/15" : "bg-white/5"}`}>
                <f.icon className={`w-3.5 h-3.5 ${enabled ? "text-lime" : "text-muted-foreground/50"}`} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{f.label}</div>
                <div className="text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{f.desc}</div>
              </div>
              <Switch checked={enabled} onCheckedChange={() => toggle(f.key)} className="shrink-0 mt-0.5" />
            </div>
          );
        })}
      </div>

      {/* Grenzwerte */}
      <div className="border-t border-white/5 pt-3 space-y-2.5">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Grenzwerte & Limits</div>
        <LimitInput
          label="Mindestmarge für Auto-Annahme"
          value={local.autoAcceptMarginPct}
          onChange={v => setLimit("autoAcceptMarginPct", v)}
          unit="%"
          min={0}
          max={100}
          step={1}
        />
        <LimitInput
          label="Mindestliquidität Firmenkonto"
          value={local.autoAcceptMinLiquidityCents / 100}
          onChange={v => setLimit("autoAcceptMinLiquidityCents", Math.round(v * 100))}
          unit="€"
          min={0}
          step={50}
        />
        <LimitInput
          label="Auto-Disposition: Stunden vor Frist"
          value={local.autoDispatchHoursBeforeDeadline}
          onChange={v => setLimit("autoDispatchHoursBeforeDeadline", v)}
          unit=" Std"
          min={1}
          max={48}
          step={1}
        />
        <LimitInput
          label="Max. Annahmen pro Stunde"
          value={local.maxOrdersPerHour}
          onChange={v => setLimit("maxOrdersPerHour", v)}
          unit=""
          min={1}
          max={20}
          step={1}
        />
      </div>

      {/* Speichern */}
      <button
        onClick={save}
        disabled={submitting || !hasChanges}
        className="w-full px-3 py-2 rounded-lg bg-lime/10 text-lime border border-lime/20 text-xs font-medium hover:bg-lime/20 transition disabled:opacity-40 flex items-center justify-center gap-1.5"
      >
        {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {hasChanges ? "Einstellungen speichern" : "Keine Änderungen"}
      </button>
    </div>
  );
}

function LimitInput({ label, value, onChange, unit, min, max, step }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-24 bg-surface-2/50 border border-white/10 rounded-md px-2 py-1 text-xs tabular-nums text-right focus:outline-none focus:border-lime/30"
        />
        {unit && <span className="text-xs text-muted-foreground/60 w-8">{unit}</span>}
      </div>
    </div>
  );
}