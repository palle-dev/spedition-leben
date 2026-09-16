import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import OfficeHeader from "@/components/office/OfficeHeader";
import OfficeKPIs from "@/components/office/OfficeKPIs";
import FleetSummary from "@/components/office/FleetSummary";
import DecisionsPanel from "@/components/office/DecisionsPanel";
import OfficeBottom from "@/components/office/OfficeBottom";
import PageHint from "@/components/help/PageHint";
import OfficeTrends from "@/components/office/OfficeTrends";
import OfficeBranches from "@/components/office/OfficeBranches";
import OfficeCustomerRelations from "@/components/office/OfficeCustomerRelations";
import OfficeApprovalQueue from "@/components/office/OfficeApprovalQueue";
import UtilizationControl from "@/components/office/UtilizationControl";
import IdleReasonsList from "@/components/office/IdleReasonsList";
import DevelopmentPanel from "@/components/office/DevelopmentPanel";

// Büro – zentrale Führungsansicht für die gesamte Firma.
// Kompakte Kopfzeile, Kennzahlen, Flottenlage, Entscheidungen,
// Mitarbeiteraktivität und Ausblicke auf Finanzen/Personal/Wachstum/Privatleben.
export default function Office() {
  const { state } = useGame();
  const [period, setPeriod] = useState("today");

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto space-y-6">
      <PageHint pageKey="office" />

      {/* Kopfzeile */}
      <OfficeHeader state={state} period={period} setPeriod={setPeriod} />

      {/* Kennzahlen */}
      <OfficeKPIs state={state} period={period} />

      {/* Hauptbereich: Betriebsübersicht + Aktionsliste/Aktivität */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <FleetSummary state={state} />
        </div>
        <div className="space-y-4">
          <DecisionsPanel state={state} />
        </div>
      </div>

      {/* Stillstandgründe: Warum die Automatik nicht disponiert hat */}
      <IdleReasonsList state={state} />

      {/* Auslastungs-Steuerung (flottenweit) */}
      <UtilizationControl state={state} />

      {/* Ausstehende Freigaben (Führung & Delegation) */}
      <OfficeApprovalQueue state={state} />

      {/* Entwicklung: Schwerpunkt, Ziele, Meilensteine */}
      <DevelopmentPanel state={state} />

      {/* Kundenbeziehungen: aktive Rahmenverträge + Stammkunden-Zufriedenheit */}
      <OfficeCustomerRelations state={state} />

      {/* Filialübersicht (nur bei mehreren Standorten) */}
      <OfficeBranches state={state} />

      {/* Trends: Umsatz- und Flottenauslastung (30 Tage) */}
      <OfficeTrends />

      {/* Unterer Bereich: Finanzen, Personal, Wachstum, Privatleben */}
      <OfficeBottom state={state} />
    </div>
  );
}