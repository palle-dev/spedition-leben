import React, { useState, useMemo } from "react";
import { formatEuro } from "@/lib/gameData";
import { getBalanceSheet, getPnL, getCashFlow, periodOf, periodStartMin, periodEndMin, ACCOUNT_GROUPS } from "@/lib/accountingData";
import { FileText, Scale, Banknote, Download } from "lucide-react";

const REPORTS = [
  { id: "pnl", label: "Gewinn- und Verlustrechnung", icon: FileText },
  { id: "balance", label: "Bilanz", icon: Scale },
  { id: "cashflow", label: "Cashflow-Rechnung", icon: Banknote },
];

export default function ReportsView({ state }) {
  const [report, setReport] = useState("pnl");
  const [period, setPeriod] = useState(periodOf(state.gameTime));

  const periods = useMemo(() => {
    const current = periodOf(state.gameTime);
    const list = [];
    for (let p = 1; p <= current; p++) list.push(p);
    return list;
  }, [state]);

  const pStart = periodStartMin(period);
  const pEnd = Math.min(periodEndMin(period) - 1, state.gameTime);

  const pnl = useMemo(() => report === "pnl" ? getPnL(state, pStart, pEnd) : null, [state, report, pStart, pEnd]);
  const bs = useMemo(() => report === "balance" ? getBalanceSheet(state, pEnd) : null, [state, report, pEnd]);
  const cf = useMemo(() => report === "cashflow" ? getCashFlow(state, pStart, pEnd) : null, [state, report, pStart, pEnd]);

  function exportCsv() {
    let rows = [];
    if (report === "pnl" && pnl) {
      rows.push(["Konto", "Bezeichnung", "Betrag (€)"]);
      pnl.lines.forEach(l => rows.push([l.account, l.name, (l.amountCents / 100).toFixed(2)]));
      rows.push(["", "Ergebnis", (pnl.result / 100).toFixed(2)]);
    } else if (report === "balance" && bs) {
      rows.push(["Position", "Konto", "Betrag (€)"]);
      rows.push(["Aktiva"]);
      bs.assets.forEach(a => rows.push(["Anlage", a.account, (a.amountCents / 100).toFixed(2)]));
      rows.push(["Passiva"]);
      bs.liabilities.forEach(a => rows.push(["Verbindlichkeit", a.account, (a.amountCents / 100).toFixed(2)]));
      bs.equity.forEach(a => rows.push(["Eigenkapital", a.account, (a.amountCents / 100).toFixed(2)]));
    } else if (report === "cashflow" && cf) {
      rows.push(["Kategorie", "Betrag (€)"]);
      rows.push(["Operativ", (cf.operating / 100).toFixed(2)]);
      rows.push(["Investiv", (cf.investing / 100).toFixed(2)]);
      rows.push(["Finanzierung", (cf.financing / 100).toFixed(2)]);
      rows.push(["Gesamt", (cf.total / 100).toFixed(2)]);
    }
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fernwerk_${report}_periode${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {REPORTS.map(r => {
            const Icon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => setReport(r.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-95 ${
                  report === r.id ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" /> {r.label}
              </button>
            );
          })}
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40"
        >
          {periods.map(p => <option key={p} value={p}>Periode {p}</option>)}
        </select>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition active:scale-95 ml-auto"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {state.accounting?.historyIncompleteBeforeMin != null && pStart < state.accounting.historyIncompleteBeforeMin && (
        <p role="status" className="rounded-lg border border-amber-400/30 p-3 text-sm text-amber-200">
          Dieser ältere Spielstand enthält nicht mehr alle historischen Buchungen. Berichte für diesen Zeitraum sind unvollständig.
        </p>
      )}
      {Math.abs((state.accounting?.accountBalances?.["1000"] || 0) - state.company.accountCents) > 0 && (
        <p role="status" className="rounded-lg border border-amber-400/30 p-3 text-sm text-amber-200">
          Firmenkonto und Buchhaltung weichen in diesem Spielstand voneinander ab. Historische Beträge wurden nicht automatisch verändert.
        </p>
      )}
      {report === "pnl" && pnl && <PnLReport pnl={pnl} period={period} />}
      {report === "balance" && bs && <BalanceReport bs={bs} period={period} />}
      {report === "cashflow" && cf && <CashFlowReport cf={cf} period={period} />}
    </div>
  );
}

function ReportCard({ title, children }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <h3 className="font-medium text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ReportLine({ label, amount, bold = undefined, indent = undefined, color = undefined }) {
  const c = color === "lime" ? "text-lime" : color === "red" ? "text-red-300" : "text-foreground";
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-medium border-t border-white/10 mt-1 pt-2" : "border-b border-white/5 last:border-0"}`}>
      <span className={`text-sm ${indent ? "pl-4 text-muted-foreground" : ""} ${bold ? "" : "text-foreground/80"}`}>{label}</span>
      <span className={`tabular-nums text-sm ${bold ? c : ""}`}>{amount < 0 ? "−" : ""}{formatEuro(Math.abs(amount))}</span>
    </div>
  );
}

function PnLReport({ pnl, period }) {
  const groups = {};
  for (const l of pnl.lines) {
    const g = ACCOUNT_GROUPS[l.type === "revenue" ? "operating_revenue" : "direct_costs"]?.label || "Sonstige";
    if (!groups[g]) groups[g] = [];
    groups[g].push(l);
  }
  return (
    <ReportCard title={`Gewinn- und Verlustrechnung · Periode ${period}`}>
      {pnl.lines.length === 0 ? (
        <div className="text-sm text-muted-foreground/50 py-4 text-center">Keine Buchungen in dieser Periode.</div>
      ) : (
        <div>
          {pnl.lines.filter(l => l.type === "revenue").map((l, i) => (
            <ReportLine key={i} label={l.name} amount={l.amountCents} color="lime" />
          ))}
          <div className="flex items-center justify-between py-1.5 mt-1 border-t border-white/5">
            <span className="text-sm text-muted-foreground font-medium">Erträge gesamt</span>
            <span className="tabular-nums text-sm text-lime font-medium">{formatEuro(pnl.revenue)}</span>
          </div>
          {pnl.lines.filter(l => l.type === "expense").map((l, i) => (
            <ReportLine key={i} label={l.name} amount={l.amountCents} color="red" />
          ))}
          <div className="flex items-center justify-between py-1.5 mt-1 border-t border-white/5">
            <span className="text-sm text-muted-foreground font-medium">Aufwendungen gesamt</span>
            <span className="tabular-nums text-sm text-red-300 font-medium">−{formatEuro(pnl.expenses)}</span>
          </div>
          <ReportLine label="Periodenergebnis" amount={pnl.result} bold color={pnl.result >= 0 ? "lime" : "red"} />
        </div>
      )}
    </ReportCard>
  );
}

function BalanceReport({ bs, period }) {
  return (
    <div className="space-y-3">
      <ReportCard title={`Aktiva · Periode ${period}`}>
        {bs.assets.length === 0 ? (
          <div className="text-sm text-muted-foreground/50 py-4 text-center">Keine Bestände.</div>
        ) : (
          <div>
            {bs.assets.map((a, i) => <ReportLine key={i} label={`${a.account} · ${a.name}`} amount={a.amountCents} />)}
            <ReportLine label="Summe Aktiva" amount={bs.total.assets} bold />
          </div>
        )}
      </ReportCard>
      <ReportCard title={`Passiva & Eigenkapital · Periode ${period}`}>
        <div>
          <div className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-1">Eigenkapital</div>
          {bs.equity.map((a, i) => <ReportLine key={i} label={`${a.account === "PNL" ? "" : a.account + " · "}${a.name}`} amount={a.amountCents} />)}
          <div className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-1 mt-3">Verbindlichkeiten</div>
          {bs.liabilities.map((a, i) => <ReportLine key={i} label={`${a.account} · ${a.name}`} amount={a.amountCents} />)}
          <ReportLine label="Summe Passiva" amount={bs.total.liabilities + bs.total.equity} bold />
        </div>
      </ReportCard>
      <div className={`glass border rounded-xl p-3 text-sm flex items-center justify-between ${bs.total.balanced ? "border-lime/20 bg-lime/5" : "border-red-400/20 bg-red-500/5"}`}>
        <span>Bilanzgleichung</span>
        <span className={bs.total.balanced ? "text-lime font-medium" : "text-red-300 font-medium"}>
          {bs.total.balanced ? "Aktiva = Passiva ✓" : "Ungleichgewicht ⚠"}
        </span>
      </div>
    </div>
  );
}

function CashFlowReport({ cf, period }) {
  return (
    <ReportCard title={`Cashflow-Rechnung · Periode ${period}`}>
      <ReportLine label="Operative Tätigkeit" amount={cf.operating} color={cf.operating >= 0 ? "lime" : "red"} />
      <ReportLine label="Investitionstätigkeit" amount={cf.investing} color={cf.investing >= 0 ? "lime" : "red"} />
      <ReportLine label="Finanzierungstätigkeit" amount={cf.financing} color={cf.financing >= 0 ? "lime" : "red"} />
      <ReportLine label="Netto-Cashflow" amount={cf.total} bold color={cf.total >= 0 ? "lime" : "red"} />
    </ReportCard>
  );
}