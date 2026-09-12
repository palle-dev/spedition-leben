import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { satisfactionLevel, formatDelta, causeTypeLabel, causeTypeColor, causeTypeBg, ACTION_INFO } from "@/lib/satisfactionData";
import Portrait from "@/components/ui/Portrait";
import { Wallet, TrendingUp, Gift, MessageCircle, HeartHandshake, Clock, CheckCircle, AlertCircle, ChevronRight, History } from "lucide-react";

// Zufriedenheits-Detailansicht mit Ursachen, Historie und Maßnahmen.
// Wird im Verwalten-Drawer der Personal-Seite angezeigt.
export default function SatisfactionDetail({ personId, personName, kind, onSetupDispatcher, onTerminate }) {
  const { state, send, showToast } = useGame();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [raiseAmount, setRaiseAmount] = useState("");
  const [showRaiseForm, setShowRaiseForm] = useState(false);

  async function loadDetail() {
    try {
      const r = await send("getSatisfactionDetail", { personId });
      setDetail(r);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { loadDetail(); }, [personId, state.gameTime]);

  async function doAction(action, params = {}) {
    setBusy(action);
    try {
      const cmdMap = {
        payWages: "payPersonWages",
        raiseSalary: "raiseSalary",
        giveBonus: "giveBonus",
        conductConversation: "conductConversation",
        retentionConversation: "conductRetentionConversation",
      };
      const r = await send(cmdMap[action], { personId, ...params });
      if (r.ok !== false) {
        showToast(actionSuccessMessage(action, r), "success");
        await loadDetail();
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !detail) {
    return <div className="text-sm text-muted-foreground text-center py-4">Lade Zufriedenheitsdaten…</div>;
  }

  const sat = satisfactionLevel(detail.satisfaction);
  const person = kind === "driver"
    ? (state.drivers || []).find(d => d.id === personId)
    : (state.employees || []).find(e => e.id === personId);

  return (
    <div className="space-y-4">
      {/* Zufriedenheits-Anzeige */}
      <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Zufriedenheit</span>
          <span className={`text-sm font-medium ${sat.color}`}>{detail.satisfaction}/100</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full ${sat.bar} transition-all`} style={{ width: `${detail.satisfaction}%` }} />
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px]">
          <span className="text-muted-foreground">30-Tage-Veränderung</span>
          <span className={detail.periodDelta > 0 ? "text-lime" : detail.periodDelta < 0 ? "text-coral" : "text-muted-foreground"}>
            {formatDelta(detail.periodDelta)}
          </span>
        </div>
      </div>

      {/* Austrittsinfo */}
      {detail.noticed && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertCircle className="w-4 h-4" /> Austritt am {detail.exitDateLabel}
          </div>
          {detail.selfTermination ? (
            <div className="text-[10px] text-muted-foreground space-y-1">
              <div>Eigenkündigung nach {detail.consecutiveLowSatisfactionDays} Tagen kritisch.</div>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {detail.unpaidWagesTotal === 0 ? "Löhne beglichen ✓" : `Offene Löhne: ${formatEuro(detail.unpaidWagesTotal)}`}
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {detail.satisfaction >= 45 ? "Zufriedenheit ≥ 45 ✓" : `${45 - detail.satisfaction} Punkte bis 45 fehlen`}
              </div>
              {detail.canRetain ? (
                <div className="text-lime">Bleibegespräch möglich.</div>
              ) : (
                <div className="text-amber-300">Voraussetzungen für Bleibegespräch nicht erfüllt.</div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground">Vom Spieler ausgesprochen – nicht durch Bleibegespräch zurücknehmbar.</div>
          )}
        </div>
      )}

      {/* Aktive Ursachen */}
      {detail.activeCauses.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Aktive Ursachen</h4>
          <div className="space-y-2">
            {detail.activeCauses.map(c => (
              <div key={c.id} className={`p-2.5 rounded-lg border border-white/10 ${causeTypeBg(c.type)}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${causeTypeColor(c.type)}`}>{causeTypeLabel(c.type)}</div>
                    <div className="text-[11px] text-foreground/80 mt-0.5">{c.label}</div>
                  </div>
                  {c.lastEffectDelta !== 0 && (
                    <span className={`text-[10px] tabular-nums ${c.lastEffectDelta < 0 ? "text-coral" : "text-lime"}`}>
                      {formatDelta(c.lastEffectDelta)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  <span>seit {formatGameTime(c.startMin)}</span>
                  {c.lastEffectMin && <span>· zuletzt {formatGameTime(c.lastEffectMin)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offene Löhne */}
      {detail.unpaidWages.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Offene Lohnforderungen</h4>
          <div className="space-y-1.5">
            {detail.unpaidWages.map(w => (
              <div key={w.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-400/5 border border-amber-400/15 text-xs">
                <span className="text-muted-foreground truncate">{w.cause}</span>
                <span className="font-medium tabular-nums text-amber-300">{formatEuro(w.remainingCents)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between p-2 rounded-lg bg-amber-400/10 border border-amber-400/20 text-xs font-medium">
              <span>Gesamt offen</span>
              <span className="tabular-nums text-amber-300">{formatEuro(detail.unpaidWagesTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Maßnahmen */}
      <div>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Maßnahmen</h4>
        <div className="space-y-2">
          {/* Löhne begleichen */}
          {detail.canPayWages && (
            <ActionButton
              icon={Wallet}
              label={ACTION_INFO.payWages.label}
              description={`${formatEuro(detail.unpaidWagesTotal)} aus Firmenbank begleichen`}
              disabled={busy !== null}
              busy={busy === "payWages"}
              onClick={() => doAction("payWages")}
            />
          )}

          {/* Gehalt erhöhen */}
          {detail.canRaiseSalary && (
            <>
              <ActionButton
                icon={TrendingUp}
                label={ACTION_INFO.raiseSalary.label}
                description={`Aktuell ${formatEuro(detail.dailyWageCents)}/Tag`}
                disabled={busy !== null}
                busy={busy === "raiseSalary"}
                onClick={() => setShowRaiseForm(!showRaiseForm)}
                expanded={showRaiseForm}
              />
              {showRaiseForm && (
                <RaiseForm
                  currentWage={detail.dailyWageCents}
                  raiseCooldownActive={detail.raiseCooldownActive}
                  nextRaiseMin={detail.nextRaiseMin}
                  value={raiseAmount}
                  onChange={setRaiseAmount}
                  onSubmit={() => {
                    const cents = Math.round(parseFloat(raiseAmount) * 100);
                    if (isNaN(cents) || cents <= detail.dailyWageCents) {
                      showToast("Neues Gehalt muss höher sein.", "error");
                      return;
                    }
                    doAction("raiseSalary", { newDailyWageCents: cents });
                    setShowRaiseForm(false);
                    setRaiseAmount("");
                  }}
                  onCancel={() => setShowRaiseForm(false)}
                />
              )}
            </>
          )}

          {/* Prämie */}
          {detail.canGiveBonus && (
            <ActionButton
              icon={Gift}
              label={ACTION_INFO.giveBonus.label}
              description={`${formatEuro(detail.dailyWageCents)} Prämie → +4 Zufriedenheit`}
              disabled={busy !== null}
              busy={busy === "giveBonus"}
              onClick={() => doAction("giveBonus")}
            />
          )}
          {detail.bonusCooldownActive && (
            <div className="text-[10px] text-muted-foreground px-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Nächste Prämie ab {detail.nextBonusMin ? formatGameTime(detail.nextBonusMin) : "—"}
            </div>
          )}

          {/* Gespräch */}
          {detail.canConductConversation && (
            <ActionButton
              icon={MessageCircle}
              label={ACTION_INFO.conductConversation.label}
              description={detail.conversationCooldownActive
                ? `+2 möglich ab ${detail.nextConversationMin ? formatGameTime(detail.nextConversationMin) : "—"}`
                : "30 Min · +2 bei Zufriedenheit < 70"}
              disabled={busy !== null || detail.conversationCooldownActive}
              busy={busy === "conductConversation"}
              onClick={() => doAction("conductConversation")}
            />
          )}

          {/* Bleibegespräch */}
          {detail.noticed && detail.selfTermination && (
            <ActionButton
              icon={HeartHandshake}
              label={ACTION_INFO.retentionConversation.label}
              description={detail.canRetain ? "Voraussetzungen erfüllt – Kündigung zurücknehmen" : "Voraussetzungen nicht erfüllt"}
              disabled={busy !== null || !detail.canRetain}
              busy={busy === "retentionConversation"}
              onClick={() => doAction("retentionConversation")}
              variant="retention"
            />
          )}
        </div>
      </div>

      {/* Verlauf */}
      {detail.trend.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1">
            <History className="w-3 h-3" /> Verlauf
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-none">
            {detail.trend.slice().reverse().map(h => (
              <div key={h.id} className="flex items-center justify-between text-[10px] py-1 border-b border-white/5 last:border-0">
                <span className="text-muted-foreground truncate flex-1">{h.trigger}</span>
                <span className={`tabular-nums ${h.actualDelta > 0 ? "text-lime" : h.actualDelta < 0 ? "text-coral" : "text-muted-foreground"}`}>
                  {formatDelta(h.actualDelta)} → {h.newValue}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Erledigte Ursachen */}
      {detail.resolvedCauses.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Behobene Ursachen</h4>
          <div className="space-y-1">
            {detail.resolvedCauses.map(c => (
              <div key={c.id} className="flex items-center justify-between text-[10px] py-1 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-lime/50" /> {causeTypeLabel(c.type)}
                </span>
                <span>{formatGameTime(c.resolvedAtMin)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, description, disabled, busy, onClick, expanded, variant }) {
  const isRetention = variant === "retention";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition disabled:opacity-40 ${
        isRetention
          ? "bg-coral/10 border-coral/30 hover:bg-coral/20"
          : "bg-surface-2/40 border-white/10 hover:border-lime/30"
      }`}
    >
      <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${
        isRetention ? "bg-coral/20 text-coral" : "bg-white/5 text-foreground/60"
      }`}>
        {busy ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <Icon className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium ${isRetention ? "text-coral" : "text-foreground"}`}>{label}</div>
        <div className="text-[10px] text-muted-foreground truncate">{description}</div>
      </div>
      {expanded !== undefined && <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition ${expanded ? "rotate-90" : ""}`} />}
    </button>
  );
}

function RaiseForm({ currentWage, raiseCooldownActive, nextRaiseMin, value, onChange, onSubmit, onCancel }) {
  const defaultRaise = Math.ceil(currentWage * 1.1 / 100);
  const newCents = Math.round((parseFloat(value) || 0) * 100);
  const pct = currentWage > 0 ? ((newCents - currentWage) / currentWage * 100) : 0;
  const morePerDay = newCents - currentWage;
  const getsBonus = pct >= 10 && !raiseCooldownActive;

  return (
    <div className="p-3 rounded-lg bg-surface-2/30 border border-white/10 space-y-2">
      {raiseCooldownActive && (
        <div className="text-[10px] text-amber-300 flex items-center gap-1">
          <Clock className="w-3 h-3" /> +5 Bonus erst ab {nextRaiseMin ? formatGameTime(nextRaiseMin) : "—"}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={defaultRaise.toFixed(0)}
          className="flex-1 bg-surface-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-lime/30"
        />
        <span className="text-xs text-muted-foreground">€/Tag</span>
      </div>
      {value && !isNaN(newCents) && newCents > currentWage && (
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between"><span>Aktuell</span><span className="tabular-nums">{formatEuro(currentWage)}/Tag</span></div>
          <div className="flex justify-between"><span>Neu</span><span className="tabular-nums text-foreground">{formatEuro(newCents)}/Tag</span></div>
          <div className="flex justify-between"><span>Erhöhung</span><span className={`tabular-nums ${pct >= 10 ? "text-lime" : "text-amber-300"}`}>+{pct.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span>Mehr pro Tag</span><span className="tabular-nums">+{formatEuro(morePerDay)}</span></div>
          <div className="flex justify-between"><span>Mehr pro 30 Tage</span><span className="tabular-nums">+{formatEuro(morePerDay * 30)}</span></div>
          <div className="flex justify-between"><span>+5 Bonus</span><span className={getsBonus ? "text-lime" : "text-muted-foreground"}>{getsBonus ? "Ja" : "Nein"}</span></div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSubmit} className="flex-1 py-2 rounded-lg bg-lime text-ink text-xs font-semibold hover:brightness-110 transition">
          Bestätigen
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

function actionSuccessMessage(action, r) {
  switch (action) {
    case "payWages": return `${formatEuro(r.paidCents)} Löhne bezahlt.`;
    case "raiseSalary": return `Gehalt auf ${formatEuro(r.newDailyWageCents)}/Tag erhöht${r.bonusApplied ? " (+5 Zufriedenheit)" : ""}.`;
    case "giveBonus": return `Prämie von ${formatEuro(r.bonusCents)} gewährt (+4 Zufriedenheit).`;
    case "conductConversation": return "Gespräch gestartet (30 Min).";
    case "retentionConversation": return "Bleibegespräch gestartet (30 Min).";
    default: return "Aktion ausgeführt.";
  }
}