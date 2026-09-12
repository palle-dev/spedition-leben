import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { PERSONNEL_ROLES } from "@/lib/gameData";
import Portrait from "@/components/ui/Portrait";
import { CheckCircle2, Clock, FileCheck, Calculator } from "lucide-react";

export default function AccountingTeam({ state }) {
  const { send, showToast } = useGame();
  const [busy, setBusy] = useState(null);

  const accountants = (state.employees || []).filter(e => e.role === "accountant" || e.role === "accountant_senior");
  const acc = state.accounting || {};
  const receipts = acc.receipts || [];
  const pendingReceipts = receipts.filter(r => r.status === "generated");
  const pendingTasks = (acc.taskQueue || []).filter(t => t.status === "pending");
  const periods = (acc.periods || []);

  async function manualAction(command, params, label) {
    setBusy(label);
    try {
      const r = await send(command, params);
      if (r.events?.length) {
        showToast(`${label} erledigt.`, "success");
      } else {
        showToast(`${label} erledigt.`, "success");
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Team-Übersicht */}
      <div>
        <h3 className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-2">Buchhaltungspersonal</h3>
        {accountants.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-sm text-muted-foreground/60">
            Keine Buchhalter eingestellt. Stelle Buchhaltungspersonal auf der Personal-Seite ein, um Belegprüfung und Zahlungsabwicklung zu automatisieren.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {accountants.map(emp => {
              const roleDef = PERSONNEL_ROLES[emp.role];
              const capacity = emp.role === "accountant_senior" ? 10 : 5;
              return (
                <div key={emp.id} className="glass border border-white/10 rounded-xl p-4 flex items-center gap-3">
                  <Portrait portraitId={emp.portraitId} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{emp.name}</div>
                    <div className="text-xs text-muted-foreground/60">{roleDef?.label || emp.role}</div>
                    <div className="text-xs text-muted-foreground/50 mt-0.5">
                      {formatEuro(emp.costPerDayCents)}/Tag · {capacity} Prüfpunkte/Stunde
                    </div>
                  </div>
                  <div className={`shrink-0 rounded-full px-2 py-1 text-xs ${emp.attendance === "present" ? "bg-lime/15 text-lime" : "bg-white/5 text-muted-foreground"}`}>
                    {emp.attendance === "present" ? "Anwesend" : "Abwesend"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Aufgaben-Queue */}
      <div>
        <h3 className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-2">Aufgaben-Queue</h3>
        {pendingTasks.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-sm text-muted-foreground/60 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime/60" /> Keine offenen Buchhaltungsaufgaben.
          </div>
        ) : (
          <div className="space-y-1.5">
            {pendingTasks.slice(0, 20).map(task => (
              <div key={task.id} className="glass border border-white/10 rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
                <TaskIcon type={task.type} />
                <span className="flex-1 text-foreground/80">
                  {taskLabel(task)}
                  {task.dueMin && <span className="text-xs text-muted-foreground/50 ml-2">Fällig {formatGameTime(task.dueMin)}</span>}
                </span>
                <span className="text-xs text-muted-foreground/50 tabular-nums">{task.points} Pkt</span>
              </div>
            ))}
            {pendingTasks.length > 20 && (
              <div className="text-xs text-muted-foreground/50 px-3">+ {pendingTasks.length - 20} weitere Aufgaben</div>
            )}
          </div>
        )}
      </div>

      {/* Manuelle Aktionen */}
      <div>
        <h3 className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-2">Manuelle Aktionen (Spieler)</h3>
        <div className="grid sm:grid-cols-3 gap-2">
          <ManualButton
            label="Beleg prüfen"
            icon={FileCheck}
            disabled={pendingReceipts.length === 0 || busy !== null}
            onClick={() => manualAction("manualCheckReceipt", { receiptId: pendingReceipts[0]?.id }, "Belegprüfung")}
            sub={pendingReceipts.length > 0 ? `${pendingReceipts.length} offen · 5 Min` : "Keine offenen Belege"}
            busy={busy === "Belegprüfung"}
          />
          <ManualButton
            label="Periode abschließen"
            icon={Calculator}
            disabled={periods.filter(p => p.status !== "closed").length === 0 || busy !== null}
            onClick={() => {
              const open = periods.find(p => p.status !== "closed");
              if (open) manualAction("manualClosePeriod", { periodId: open.id }, "Periodenabschluss");
            }}
            sub={periods.filter(p => p.status !== "closed").length > 0 ? `${periods.filter(p => p.status !== "closed").length} offen · 60 Min` : "Keine offenen Perioden"}
            busy={busy === "Periodenabschluss"}
          />
        </div>
      </div>

      {/* Belege-Liste */}
      <div>
        <h3 className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-2">Belege</h3>
        <div className="glass border border-white/10 rounded-xl overflow-hidden">
          {receipts.length === 0 ? (
            <div className="text-sm text-muted-foreground/50 py-4 text-center">Keine Belege vorhanden.</div>
          ) : (
            <div className="divide-y divide-white/5 max-h-64 overflow-auto">
              {receipts.slice(-30).reverse().map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground/50 tabular-nums w-8">#{r.receiptNo}</span>
                  <span className="text-xs text-muted-foreground tabular-nums w-24 hidden sm:block">{formatGameTime(r.gameTime)}</span>
                  <span className="flex-1 truncate text-foreground/80">{r.text}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{formatEuro(r.amountCents)}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                    r.status === "checked" ? "bg-lime/15 text-lime" :
                    r.status === "approved" ? "bg-lime/20 text-lime" :
                    "bg-white/5 text-muted-foreground"
                  }`}>
                    {r.status === "generated" ? "Offen" : r.status === "checked" ? "Geprüft" : r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskIcon({ type }) {
  const Icon = type === "check_receipt" ? FileCheck : type === "period_close" ? Calculator : Clock;
  return <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0" />;
}

function taskLabel(task) {
  if (task.type === "check_receipt") return "Beleg prüfen";
  if (task.type === "prepare_payment") return "Zahlung vorbereiten";
  if (task.type === "period_close") return "Periodenabschluss";
  return task.type;
}

function ManualButton({ label, icon: Icon, onClick, disabled, sub, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="glass border border-white/10 rounded-xl p-3 text-left hover:border-lime/30 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="w-4 h-4 text-lime/70" /> {label}
      </div>
      <div className="text-xs text-muted-foreground/60 mt-1">{busy ? "Wird ausgeführt…" : sub}</div>
    </button>
  );
}