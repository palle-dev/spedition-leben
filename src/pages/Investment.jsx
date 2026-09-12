import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import InvestmentOverview from "@/components/investment/InvestmentOverview";
import MarketBrowser from "@/components/investment/MarketBrowser";
import DepotView from "@/components/investment/DepotView";
import OrderTicket from "@/components/investment/OrderTicket";
import OrdersTable from "@/components/investment/OrdersTable";
import { LineChart, Store, Wallet, ListOrdered, Building2, User } from "lucide-react";

// Investment – dritte Hauptwelt: Firmen- und Privatvermögen in Aktien und Krypto.
export default function Investment() {
  const { state } = useGame();
  const [depotId, setDepotId] = useState("company");
  const [tab, setTab] = useState("overview");
  const [selectedInstrument, setSelectedInstrument] = useState(null);

  const depotLabel = depotId === "company" ? "Firmendepot" : "Privatdepot";

  const tabs = [
    { id: "overview", label: "Übersicht", icon: LineChart },
    { id: "markets", label: "Märkte", icon: Store },
    { id: "depot", label: "Depot", icon: Wallet },
    { id: "orders", label: "Orders", icon: ListOrdered },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto space-y-4">
      {/* Header mit Depot-Umschalter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Investment</h1>
          <div className="text-xs text-muted-foreground">Fiktiver Markt · Euro · Spielzeit</div>
        </div>
        <div className="flex items-center bg-ink/60 border border-white/10 rounded-full p-1 gap-1">
          <button
            onClick={() => setDepotId("company")}
            className={`flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-[13px] font-medium transition ${depotId === "company" ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Building2 className="w-3.5 h-3.5" /> Firmendepot
          </button>
          <button
            onClick={() => setDepotId("private")}
            className={`flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-[13px] font-medium transition ${depotId === "private" ? "bg-coral text-ink" : "text-muted-foreground hover:text-foreground"}`}
          >
            <User className="w-3.5 h-3.5" /> Privatdepot
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-2 overflow-x-auto scrollbar-none">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition ${
                tab === t.id ? "bg-invest-purple/10 text-invest-purple" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Inhalt */}
      {tab === "overview" && <InvestmentOverview state={state} />}

      {tab === "markets" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MarketBrowser state={state} selectedId={selectedInstrument} onSelect={setSelectedInstrument} />
          {selectedInstrument ? (
            <OrderTicket state={state} depotId={depotId} instrumentId={selectedInstrument} />
          ) : (
            <div className="glass border border-white/10 rounded-xl p-6 text-center text-sm text-muted-foreground">
              Wähle ein Instrument aus der Marktliste, um eine Order aufzugeben.
            </div>
          )}
        </div>
      )}

      {tab === "depot" && <DepotView state={state} depotId={depotId} />}

      {tab === "orders" && <OrdersTable state={state} depotId={depotId} />}
    </div>
  );
}