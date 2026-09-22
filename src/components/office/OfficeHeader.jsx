import React from "react";
import { useGame } from "@/lib/gameContext";
import { Wifi, WifiOff } from "lucide-react";
import CompanyYard from "./CompanyYard";

export default function OfficeHeader({ period, setPeriod }) {
  const { automationEnabled, connectionState } = useGame();
  const connected = connectionState === "connected";
  return <CompanyYard><div className="ff-office-controls">
    <div className="ff-office-period" role="group" aria-label="Zeitraum der Bürokennzahlen">
      {[{ id: "today", label: "Heute" }, { id: "week", label: "7 Tage" }, { id: "month", label: "30 Tage" }].map(p => <button type="button" key={p.id} onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}>{p.label}</button>)}
    </div>
    <div className="ff-office-state"><span title="Steuerung unten neben +1 Tag">{automationEnabled ? "Live · 15 Min / 5 Sek" : "Pausiert"}</span><span title={connected ? "Verbindung hergestellt" : "Keine Verbindung"} className={connected ? "ff-office-connected" : "ff-office-disconnected"}>{connected ? <Wifi size={14} aria-label="Verbunden" /> : <WifiOff size={14} aria-label="Offline" />}</span></div>
  </div></CompanyYard>;
}
