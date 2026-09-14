import React, { useState, useMemo, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { Switch } from "@/components/ui/switch";
import {
  Settings, Loader2, Package, TrendingDown, FileText, Lightbulb,
  Calculator, Clock, Truck, AlertTriangle, GraduationCap, BookOpen,
  Layers, Check, Sparkles,
} from "lucide-react";

// ---------- Konfiguration der Funktionen ----------

const SECTIONS = [
  {
    id: "orders",
    title: "Auftragsmanagement",
    icon: Package,
    accent: "lime",
    items: [
      { key: "autoAcceptOrders", label: "Auto-Auftragsannahme", icon: Package, desc: "Profitable Marktangebote automatisch annehmen" },
      { key: "orderMonitoring", label: "Auftragsüberwachung", icon: Clock, desc: "Lieferfristen überwachen und warnen" },
      { key: "autoDispatch", label: "Auto-Disposition", icon: Truck, desc: "Gefährdete Aufträge automatisch disponieren" },
    ],
  },
  {
    id: "finance",
    title: "Finanzen & Buchhaltung",
    icon: Calculator,
    accent: "cyan",
    items: [
      { key: "dailyReport", label: "Tagesbericht", icon: FileText, desc: "Tägliche Zusammenfassung per Mail" },
      { key: "costOptimization", label: "Gemeinkostenoptimierung", icon: TrendingDown, desc: "Standortkosten bei Leerstand senken" },
      { key: "accounting", label: "Buchhaltungs-Support", icon: Calculator, desc: "Buchhaltungsaufgaben vorbereiten" },
    ],
  },
  {
    id: "monitoring",
    title: "Überwachung & Warnungen",
    icon: AlertTriangle,
    accent: "amber",
    items: [
      { key: "backlogMonitoring", label: "Rückstau-Überwachung", icon: Layers, desc: "Warnt bei zu vielen ungesplanten Aufträgen" },
      { key: "fleetUtilizationMonitoring", label: "Flottenauslastung", icon: Truck, desc: "Warnt bei zu wenigen Lkw auf Tour" },
      { key: "decisionProposals", label: "Entscheidungsvorschläge", icon: Lightbulb, desc: "Vorschläge für anstehende Entscheidungen" },
    ],
  },
  {
    id: "staff",
    title: "Personalentwicklung",
    icon: GraduationCap,
    accent: "violet",
    items: [
      { key: "staffDevelopment", label: "Personalentwicklung", icon: GraduationCap, desc: "Personal automatisch schulen und entwickeln" },
      { key: "autoBookTraining", label: "Kurse automatisch buchen", icon: BookOpen, desc: "Schulungen automatisch buchen (sonst nur Vorschläge)" },
    ],
  },
];

const LIMIT_SECTIONS = [
  {
    title: "Auto-Annahme",
    limits: [
      { key: "autoAcceptMarginPct", label: "Mindestmarge", unit: "%", min: 0, max: 100, step: 1 },
      { key: "autoAcceptMinLiquidityCents", label: "Mindestliquidität", unit: "€", min: 0, step: 50, convert: true },
      { key: "maxOrdersPerHour", label: "Max. Annahmen / Std", unit: "", min: 1, max: 20, step: 1 },
    ],
  },
  {
    title: "Disposition",
    limits: [
      { key: "autoDispatchHoursBeforeDeadline", label: "Auto-Dispo: Std vor Frist", unit: " Std", min: 1, max: 48, step: 1 },
      { key: "maxBacklogOrders", label: "Rückstau-Schwellenwert", unit: " Aufträge", min: 1, max: 30, step: 1 },
    ],
  },
  {
    title: "Personal & Flotte",
    limits: [
      { key: "trainingBudgetPerDay", label: "Trainingsbudget / Tag", unit: " €", min: 0, max: 2000, step: 50 },
      { key: "minFleetUtilizationPct", label: "Mindest-Flottenauslastung", unit: "%", min: 0, max: 100, step: 5 },
    ],
  },
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
  maxBacklogOrders: 5,
  backlogMonitoring: true,
  staffDevelopment: true,
  autoBookTraining: false,
  trainingBudgetPerDay: 200,
  fleetUtilizationMonitoring: true,
  minFleetUtilizationPct: 60,
};

const ACCENT_STYLES = {
  lime:    { text: "text-lime",    bg: "bg-lime/10",    border: "border-lime/20",    glow: "shadow-lime/5" },
  cyan:    { text: "text-cyan-300", bg: "bg-cyan-300/10", border: "border-cyan-300/20", glow: "shadow-cyan-300/5" },
  amber:   { text: "text-amber-300", bg: "bg-amber-300/10", border: "border-amber-300/20", glow: "shadow-amber-300/5" },
  violet:  { text: "text-violet-300", bg: "bg-violet-300/10", border: "border-violet-300/20", glow: "shadow-violet-300/5" },
};

// ---------- Komponente ----------

export default function AssistantConfig() {
  const { state, send, showToast } = useGame();
  const config = state.assistantConfig || DEFAULTS;
  const [local, setLocal] = useState(config);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setLocal(config); }, [config]);

  const hasAssistant = useMemo(
    () => (state.employees || []).some(e => e.role === "assistant" && e.employmentStatus === "employed"),
    [state.employees]
  );

  const hasChanges = useMemo(
    () => JSON.stringify(local) !== JSON.stringify(config),
    [local, config]
  );

  const activeCount = useMemo(() => {
    return SECTIONS.reduce((sum, s) => sum + s.items.filter(i => local[i.key] !== false).length, 0);
  }, [local]);

  const totalCount = useMemo(() => SECTIONS.reduce((sum, s) => sum + s.items.length, 0), []);

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
    <div className="space-y-4">
      {/* Header-Karte */}
      <div className="glass border border-white/10 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center w-11 h-11 rounded-xl bg-lime/10 border border-lime/20">
              <Settings className="w-5 h-5 text-lime" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">Assistent der Geschäftsführung</h3>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Konfiguration der automatisierten Management-Funktionen</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold tabular-nums text-lime">{activeCount}<span className="text-sm text-muted-foreground/50">/{totalCount}</span></div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Funktionen aktiv</div>
          </div>
        </div>
      </div>

      {/* Funktions-Sektionen */}
      <div className="space-y-3">
        {SECTIONS.map(section => {
          const accent = ACCENT_STYLES[section.accent];
          const activeInSection = section.items.filter(i => local[i.key] !== false).length;
          return (
            <div key={section.id} className="glass border border-white/10 rounded-2xl overflow-hidden">
              {/* Sektion-Header */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5 bg-white/[0.015]">
                <span className={`grid place-items-center w-7 h-7 rounded-lg ${accent.bg} border ${accent.border}`}>
                  <section.icon className={`w-3.5 h-3.5 ${accent.text}`} />
                </span>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/90 flex-1">{section.title}</h4>
                <span className="text-[10px] tabular-nums text-muted-foreground/60">{activeInSection}/{section.items.length}</span>
              </div>

              {/* Toggle-Rows */}
              <div className="divide-y divide-white/5">
                {section.items.map(item => {
                  const enabled = local[item.key] !== false;
                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                        enabled ? "bg-transparent" : "bg-white/[0.01]"
                      }`}
                    >
                      <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 transition-colors ${
                        enabled ? `${accent.bg} ${accent.border} border` : "bg-white/5 border border-white/5"
                      }`}>
                        <item.icon className={`w-4 h-4 transition-colors ${enabled ? accent.text : "text-muted-foreground/40"}`} />
                      </span>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className={`text-xs font-medium transition-colors ${enabled ? "text-foreground" : "text-muted-foreground"}`}>
                          {item.label}
                        </div>
                        <div className="text-[11px] text-muted-foreground/60 leading-snug mt-0.5">{item.desc}</div>
                      </div>
                      <Switch checked={enabled} onCheckedChange={() => toggle(item.key)} className="shrink-0 mt-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grenzwerte */}
      <div className="glass border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/5 bg-white/[0.015]">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-white/5 border border-white/10">
            <Settings className="w-3.5 h-3.5 text-muted-foreground/70" />
          </span>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">Grenzwerte & Limits</h4>
        </div>

        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
          {LIMIT_SECTIONS.map((ls, idx) => (
            <div key={ls.title} className="px-4 py-3.5 space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">{ls.title}</div>
              {ls.limits.map(l => {
                const val = l.convert ? local[l.key] / 100 : local[l.key];
                const onChange = v => setLimit(l.key, l.convert ? Math.round(v * 100) : v);
                return <LimitInput key={l.key} label={l.label} value={val} onChange={onChange} unit={l.unit} min={l.min} max={l.max} step={l.step} />;
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Save-Bar */}
      <div className={`sticky bottom-3 z-10 transition-all duration-300 ${hasChanges ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>
        <div className="glass border border-lime/20 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-lg shadow-lime/5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5 text-lime" />
            <span>{hasChanges ? "Änderungen werden beim Speichern übernommen" : "Alle Änderungen gespeichert"}</span>
          </div>
          <button
            onClick={save}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime text-ink text-xs font-semibold hover:bg-lime/90 transition disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {submitting ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- LimitInput ----------

function LimitInput({ label, value, onChange, unit, min, max, step }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground/80">{label}</div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full bg-surface-2/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs tabular-nums text-right focus:outline-none focus:border-lime/30 focus:bg-surface-2/60 transition-colors"
        />
        {unit && <span className="text-[11px] text-muted-foreground/50 w-8 shrink-0">{unit.trim()}</span>}
      </div>
    </div>
  );
}