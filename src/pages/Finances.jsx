import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { BookOpen, FileText, Package, Users, LayoutDashboard, AlertCircle } from "lucide-react";
import FinanceOverview from "@/components/finance/FinanceOverview";
import JournalView from "@/components/finance/JournalView";
import OpenItemsPanel from "@/components/finance/OpenItemsPanel";
import ReportsView from "@/components/finance/ReportsView";
import AssetRegister from "@/components/finance/AssetRegister";
import AccountingTeam from "@/components/finance/AccountingTeam";
import FinancingPanel from "@/components/finance/FinancingPanel";
import { Landmark } from "lucide-react";

const TABS = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "financing", label: "Finanzierung", icon: Landmark },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "open", label: "Offene Posten", icon: AlertCircle },
  { id: "reports", label: "Auswertungen", icon: FileText },
  { id: "assets", label: "Anlagen", icon: Package },
  { id: "team", label: "Buchhaltung", icon: Users },
];

export default function Finances() {
  const { state } = useGame();
  const [tab, setTab] = useState("overview");

  const openItems = (state.accounting?.openItems || []).filter(i => i.remainingCents > 0);
  const openBadge = openItems.length > 0 ? openItems.length : null;

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Finanzen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Doppelte Buchführung · Kontenplan nach SKR · Abschreibung und Periodenabschluss
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          const badge = t.id === "open" ? openBadge : null;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition active:scale-95 ${
                active ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {badge != null && (
                <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${active ? "bg-ink/20 text-ink" : "bg-coral/20 text-coral"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="min-h-[400px]">
        {tab === "overview" && <FinanceOverview state={state} />}
        {tab === "financing" && <FinancingPanel />}
        {tab === "journal" && <JournalView state={state} />}
        {tab === "open" && <OpenItemsPanel state={state} />}
        {tab === "reports" && <ReportsView state={state} />}
        {tab === "assets" && <AssetRegister state={state} />}
        {tab === "team" && <AccountingTeam state={state} />}
      </div>
    </div>
  );
}