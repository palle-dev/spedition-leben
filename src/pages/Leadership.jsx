import ManagementGoals from "@/components/office/ManagementGoals";
import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { ROLE_LABELS } from "@/lib/gameData";
import { useNavigate } from "react-router-dom";
import {
  PRESETS, getRuleLabel, getApprovalModeLabel, getUrgencyColor,
  getViolatedRuleLabel, formatCents,
} from "@/lib/delegationData";
import {
  Shield, CheckCircle2, XCircle, Clock, TrendingUp, Wallet, AlertTriangle, ChevronDown, ChevronUp, Building2, Settings, ArrowRight, Trash2,
} from "lucide-react";

// Führung & Delegation — zentrale Steuerung der Mitarbeiter-Automatik.
export default function Leadership() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [tab, setTab] = useState("rules");
  const [expandedBranch, setExpandedBranch] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const summary = useMemo(() => {
    if (!state.delegation) return null;
    const d = state.delegation;
    const pending = (state.approvals?.pending || []).filter(a => a.status === "pending");
    const recentDecisions = (d.decisionLog || []).slice(-15).reverse();
    const ds = d.dailySpend || { companyCents: 0 };
    const rules = d.rules || {};
    const budgetUsed = ds.companyCents || 0;
    const budgetMax = rules.dailyBudgetCents || 0;
    const budgetPct = budgetMax > 0 ? Math.min(100, Math.round(budgetUsed / budgetMax * 100)) : 0;
    return { d, pending, recentDecisions, rules, budgetUsed, budgetMax, budgetPct, stats: d.stats || {} };
  }, [state]);

  if (!summary) return null;

  const allSelected = summary.pending.length > 0 && selectedIds.size === summary.pending.length;
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(summary.pending.map(r => r.id)));
  }

  async function handlePreset(presetId) {
    try {
      await send("applyDelegationPreset", { presetId });
      showToast("Voreinstellung angewendet", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleRuleChange(key, value, branchId) {
    try {
      await send("updateDelegationRule", { key, value, branchId });
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleApprove(requestId) {
    try {
      const r = await send("approveApproval", { requestId });
      if (r?.superseded) showToast("Anfrage nicht mehr aktuell: " + r.reason, "info");
      else showToast("Freigabe erteilt", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleReject(requestId) {
    try {
      await send("rejectApproval", { requestId });
      showToast("Freigabe abgelehnt", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleDelete(requestId) {
    try {
      await send("deleteApproval", { requestId });
      showToast("Freigabe gelöscht", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  // Sammel-Aktionen für mehrere Freigaben gleichzeitig.
  async function handleBulk(action) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        if (action === "approve") {
          const r = await send("approveApproval", { requestId: id });
          if (!r?.superseded) ok++;
        } else if (action === "reject") {
          await send("rejectApproval", { requestId: id });
          ok++;
        } else if (action === "delete") {
          await send("deleteApproval", { requestId: id });
          ok++;
        }
      } catch { fail++; }
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    const label = action === "approve" ? "genehmigt" : action === "reject" ? "abgelehnt" : "gelöscht";
    if (fail === 0) showToast(`${ok} Freigabe(n) ${label}`, "success");
    else if (ok === 0) showToast(`${fail} Freigabe(n) konnten nicht bearbeitet werden`, "error");
    else showToast(`${ok} ${label}, ${fail} fehlgeschlagen`, "info");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto space-y-6">
      <ManagementGoals/>
      {/* Kopfzeile */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-lime/70" /> Führung & Delegation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mitarbeiterbefugnisse festlegen — welche Handlungen selbstständig erlaubt sind und welche Freigaben erforderlich sind.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Voreinstellung:</span>
          <select
            value={summary.d.preset || ""}
            onChange={e => handlePreset(e.target.value)}
            className="bg-surface-2 border border-white/10 rounded-lg px-3 py-1.5 text-sm"
          >
            {Object.values(PRESETS).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10">
        {[
          { id: "rules", label: "Mitarbeiterbefugnisse", icon: Settings },
          { id: "approvals", label: "Freigaben", icon: AlertTriangle, badge: summary.pending.length },
          { id: "activity", label: "Aktivität", icon: TrendingUp },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition ${
                tab === t.id ? "border-lime text-lime" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.badge > 0 && (
                <span className="ml-1 bg-coral/20 text-coral text-xs rounded-full px-1.5 py-0.5 tabular-nums">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab: Führungsregeln */}
      {tab === "rules" && (
        <div className="space-y-4">
          {/* Voreinstellungen */}
          <div className="glass border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-lime/70" /> Voreinstellungen
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.values(PRESETS).map(p => {
                const active = summary.d.preset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePreset(p.id)}
                    className={`text-left rounded-lg border p-4 transition ${
                      active ? "border-lime/40 bg-lime/5" : "border-white/10 bg-surface-2/30 hover:border-white/20"
                    }`}
                  >
                    <div className="font-medium text-sm mb-1">{p.label}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{p.description}</div>
                    {active && <div className="text-xs text-lime mt-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Aktiv</div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unternehmensregeln */}
          <div className="glass border border-white/10 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4 text-lime/70" /> Unternehmensweite Regeln
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RuleInput
                label={getRuleLabel("maxSpendPerActionCents")}
                value={summary.rules.maxSpendPerActionCents}
                step={5000}
                onChange={v => handleRuleChange("maxSpendPerActionCents", v)}
                currency
              />
              <RuleInput
                label={getRuleLabel("dailyBudgetCents")}
                value={summary.rules.dailyBudgetCents}
                step={50000}
                onChange={v => handleRuleChange("dailyBudgetCents", v)}
                currency
                extra={
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Heute ausgegeben</span>
                      <span className="tabular-nums">{formatCents(summary.budgetUsed)} / {formatCents(summary.budgetMax)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full ${summary.budgetPct >= 80 ? "bg-coral" : summary.budgetPct >= 50 ? "bg-amber-300" : "bg-lime"}`} style={{ width: `${summary.budgetPct}%` }} />
                    </div>
                  </div>
                }
              />
              <RuleInput
                label={getRuleLabel("minLiquidityCents")}
                value={summary.rules.minLiquidityCents}
                step={10000}
                onChange={v => handleRuleChange("minLiquidityCents", v)}
                hint="Einfacher Kontopuffer — keine vollständige Liquiditätsprognose."
                currency
              />
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">{getRuleLabel("approvalMode")}</label>
                <select
                  value={summary.rules.approvalMode || "continue"}
                  onChange={e => handleRuleChange("approvalMode", e.target.value)}
                  className="w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="stop">Bei Freigabe anhalten</option>
                  <option value="continue">Weiterlaufen, Freigaben sammeln</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">{getApprovalModeLabel(summary.rules.approvalMode)}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">{getRuleLabel("autoAcceptOrders")}</label>
                <Toggle value={summary.rules.autoAcceptOrders} onChange={v => handleRuleChange("autoAcceptOrders", v)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">{getRuleLabel("autoDispatch")}</label>
                <Toggle value={summary.rules.autoDispatch} onChange={v => handleRuleChange("autoDispatch", v)} />
              </div>
            </div>
          </div>

          {/* Filial-Overrides */}
          {(state.branches || []).length > 1 && (
            <div className="glass border border-white/10 rounded-xl p-5">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-lime/70" /> Filial-Überschreibungen
              </h3>
              <div className="space-y-2">
                {(state.branches || []).filter(b => b.status === "active").map(b => {
                  const hasOverride = !!(summary.d.branchOverrides || {})[b.id];
                  const expanded = expandedBranch === b.id;
                  return (
                    <div key={b.id} className="border border-white/5 rounded-lg">
                      <button
                        onClick={() => setExpandedBranch(expanded ? null : b.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          {hasOverride && <span className="text-[10px] bg-lime/10 text-lime px-1.5 py-0.5 rounded">Filialregel</span>}
                          {b.name} ({b.city})
                        </span>
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 space-y-3">
                          <RuleInput
                            label={getRuleLabel("maxSpendPerActionCents")}
                            value={(summary.d.branchOverrides[b.id] || {}).maxSpendPerActionCents ?? summary.rules.maxSpendPerActionCents}
                            step={5000}
                            onChange={v => handleRuleChange("maxSpendPerActionCents", v, b.id)}
                            currency
                          />
                          <RuleInput
                            label={getRuleLabel("dailyBudgetCents")}
                            value={(summary.d.branchOverrides[b.id] || {}).dailyBudgetCents ?? summary.rules.dailyBudgetCents}
                            step={50000}
                            onChange={v => handleRuleChange("dailyBudgetCents", v, b.id)}
                            currency
                          />
                          {hasOverride && (
                            <button
                              onClick={() => send("clearBranchOverride", { branchId: b.id }).then(() => showToast("Filial-Regel zurückgesetzt", "info"))}
                              className="text-xs text-coral/70 hover:text-coral transition"
                            >
                              Filial-Überschreibung entfernen
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Freigaben */}
      {tab === "approvals" && (
        <div className="space-y-4">
          <div className="glass border border-white/10 rounded-xl p-3 flex items-center gap-2 text-xs">
            <Settings className="w-3.5 h-3.5 text-lime/70 shrink-0" />
            <span className="text-muted-foreground">Freigabe-Limits anpassen unter</span>
            <button onClick={() => setTab("rules")} className="text-lime hover:text-lime/80 transition flex items-center gap-1">
              Führungsregeln <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {summary.pending.length === 0 ? (
            <div className="glass border border-white/10 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-lime/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Keine ausstehenden Freigaben.</p>
            </div>
          ) : (
            <>
              {/* Sammel-Aktionen-Leiste */}
              <div className="glass border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap sticky top-2 z-10">
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition"
                  >
                    <span className={`grid place-items-center w-4 h-4 rounded border transition shrink-0 ${
                      allSelected ? "bg-lime border-lime text-ink" : selectedIds.size > 0 ? "bg-lime/30 border-lime/50" : "border-white/20"
                    }`}>
                      {allSelected ? <CheckCircle2 className="w-3 h-3" /> : selectedIds.size > 0 ? <span className="text-[8px]">–</span> : null}
                    </span>
                    Alle {allSelected ? "abwählen" : "auswählen"}
                  </button>
                  {selectedIds.size > 0 && (
                    <span className="text-xs text-muted-foreground">{selectedIds.size} ausgewählt</span>
                  )}
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBulk("approve")}
                      disabled={bulkLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 disabled:opacity-50 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Alle genehmigen
                    </button>
                    <button
                      onClick={() => handleBulk("reject")}
                      disabled={bulkLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 disabled:opacity-50 transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Alle ablehnen
                    </button>
                    <button
                      onClick={() => handleBulk("delete")}
                      disabled={bulkLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-white/5 text-coral/80 hover:text-coral border border-coral/20 disabled:opacity-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Alle löschen
                    </button>
                  </div>
                )}
              </div>

              {summary.pending.map(req => {
                const checked = selectedIds.has(req.id);
                return (
                  <div key={req.id} className={`glass border rounded-xl p-4 space-y-3 transition ${checked ? "border-lime/30 bg-lime/[0.02]" : "border-white/10"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          onClick={() => toggleSelect(req.id)}
                          className={`grid place-items-center w-4 h-4 rounded border transition shrink-0 mt-0.5 ${
                            checked ? "bg-lime border-lime text-ink" : "border-white/20 hover:border-white/40"
                          }`}
                        >
                          {checked && <CheckCircle2 className="w-3 h-3" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs ${getUrgencyColor(req.urgency)}`}>● {({ low: "Niedrig", medium: "Mittel", high: "Hoch", urgent: "Dringend", critical: "Kritisch" })[req.urgency] || req.urgency}</span>
                            <span className="text-xs text-muted-foreground">{req.employeeName} ({ROLE_LABELS[req.employeeRole] || req.employeeRole})</span>
                            {req.branchName && <span className="text-xs text-muted-foreground">· {req.branchName}</span>}
                          </div>
                          <div className="font-medium text-sm">{req.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">{req.description}</div>
                          {req.reasoning && (
                            <div className="text-xs mt-2 bg-surface-2/40 rounded-lg px-2.5 py-1.5 border border-white/5">
                              <span className="text-muted-foreground">Begründung: </span>{req.reasoning}
                            </div>
                          )}
                          {req.violatedRule && (
                            <div className="text-xs text-coral/80 mt-1.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {getViolatedRuleLabel(req.violatedRule)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {req.costCents > 0 && <div className="text-sm font-medium tabular-nums">{formatCents(req.costCents)}</div>}
                        {req.deadlineMin && <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1"><Clock className="w-2.5 h-2.5" />bis Tag {Math.floor(req.deadlineMin/1440)+1}</div>}
                      </div>
                    </div>
                    {req.alternatives && req.alternatives.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="text-foreground">Alternativen:</span> {req.alternatives.join(", ")}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                      <button onClick={() => handleApprove(req.id)} disabled={bulkLoading} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 disabled:opacity-50 transition">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Freigeben
                      </button>
                      <button onClick={() => handleReject(req.id)} disabled={bulkLoading} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 disabled:opacity-50 transition">
                        <XCircle className="w-3.5 h-3.5" /> Ablehnen
                      </button>
                      <button onClick={() => handleDelete(req.id)} disabled={bulkLoading} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-white/5 text-coral/70 hover:text-coral border border-white/10 disabled:opacity-50 transition ml-auto">
                        <Trash2 className="w-3.5 h-3.5" /> Löschen
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Tab: Aktivität */}
      {tab === "activity" && (
        <div className="space-y-4">
          {/* Statistik-Karten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={CheckCircle2} label="Selbstständig erledigt" value={summary.stats.autoResolved || 0} color="text-lime" />
            <StatCard icon={AlertTriangle} label="Offene Freigaben" value={summary.pending.length} color="text-amber-300" />
            <StatCard icon={Wallet} label="Delegierte Ausgaben" value={formatCents(summary.stats.delegatedSpendCents || 0)} color="text-foreground" />
            <StatCard icon={XCircle} label="Blockierte Aktionen" value={summary.stats.blockedActions || 0} color="text-coral" />
          </div>

          {/* Letzte Entscheidungen */}
          <div className="glass border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-lime/70" /> Letzte Entscheidungen
            </h3>
            {summary.recentDecisions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Noch keine Entscheidungen protokolliert.</p>
            ) : (
              <div className="space-y-2">
                {summary.recentDecisions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-muted-foreground tabular-nums shrink-0">T{Math.floor(d.atMin/1440)+1}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground">{d.employeeName}: </span>
                      <span>{d.summary}</span>
                      {d.reasoning && <span className="text-muted-foreground"> — {d.reasoning}</span>}
                    </div>
                    {d.costCents > 0 && <span className="text-muted-foreground tabular-nums shrink-0">{formatCents(d.costCents)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Hilfskomponenten ---
function RuleInput({ label, value, onChange, step, hint = undefined, extra = undefined, currency }) {
  const displayValue = currency ? Math.round((value || 0) / 100) : (value || 0);
  const handleChange = currency
    ? e => onChange(Math.max(0, Math.round(Number(e.target.value) * 100)))
    : e => onChange(Math.max(0, Number(e.target.value)));
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={displayValue}
          onChange={handleChange}
          step={currency ? 50 : (step || 1000)}
          className="w-full bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums"
        />
        {currency && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
      {extra}
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition ${value ? "bg-lime/30" : "bg-white/10"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition ${value ? "left-5 bg-lime" : "left-0.5 bg-muted-foreground"}`} />
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}