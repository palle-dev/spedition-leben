import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import OfficeHeader from "@/components/office/OfficeHeader";
import OfficeKPIs from "@/components/office/OfficeKPIs";
import FleetSummary from "@/components/office/FleetSummary";
import DailyOverview from "@/components/office/DailyOverview";
import UnifiedTaskList from "@/components/office/UnifiedTaskList";
import DailyCapacity from "@/components/office/DailyCapacity";
import PersonalAndGoals from "@/components/office/PersonalAndGoals";
import OfficeBottom from "@/components/office/OfficeBottom";
import PageHint from "@/components/help/PageHint";
import OfficeTrends from "@/components/office/OfficeTrends";
import OfficeBranches from "@/components/office/OfficeBranches";
import OfficeCustomerRelations from "@/components/office/OfficeCustomerRelations";
import UtilizationControl from "@/components/office/UtilizationControl";
import IdleReasonsList from "@/components/office/IdleReasonsList";
import DevelopmentPanel from "@/components/office/DevelopmentPanel";
import ScenarioProgressPanel from "@/components/scenarios/ScenarioProgressPanel";
import DisruptionPanel from "@/components/office/DisruptionPanel";
import ForecastHints from "@/components/office/ForecastHints";

// Büro – zentrale Tagesübersicht und Führungsansicht.
// Die Seite beantwortet unmittelbar:
// 1. Was braucht jetzt meine Entscheidung? (DailyOverview + UnifiedTaskList)
// 2. Welche Verpflichtungen stehen heute an? (DailyCapacity)
// 3. Was erledigen meine Mitarbeiter selbstständig? (DailyCapacity)
// 4. Wie steht es um verfügbare Mittel und Kapazität? (DailyCapacity + OfficeKPIs)
// 5. Welche persönlichen Termine habe ich? (PersonalAndGoals)
// 6. Welches meiner Ziele ist als Nächstes sinnvoll erreichbar? (PersonalAndGoals)
//
// Weitere Details sind über die Fachseiten erreichbar.
export default function Office() {
  const { state } = useGame();
  const [period, setPeriod] = useState("today");

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto space-y-6">
      <PageHint pageKey="office" />

      {/* Kopfzeile */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <OfficeHeader state={state} period={period} setPeriod={setPeriod} />
        </div>
        <Link
          to="/netzwerk"
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-lime/30 hover:bg-lime/5 transition shrink-0"
          title="Strategische Netzkarte öffnen"
        >
          <Network className="w-4 h-4" /> <span className="hidden sm:inline">Netzkarte</span>
        </Link>
      </div>

      {/* Tagesübersicht: Natürliche Aussagen aus Spieldaten */}
      <DailyOverview state={state} />

      {/* Aktive Störungen (nur bei vorhandenen Störungen sichtbar) */}
      <DisruptionPanel />

      {/* Liquiditäts-Warnhinweise (nur bei prognostizierten Engpässen) */}
      <ForecastHints />

      {/* Kennzahlen */}
      <OfficeKPIs state={state} period={period} />

      {/* Hauptbereich: Vereinheitlichte Aufgaben + Betriebsübersicht */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <UnifiedTaskList state={state} />
        </div>
        <div className="lg:col-span-2">
          <FleetSummary state={state} />
        </div>
      </div>

      {/* Szenario-Fortschritt (nur bei aktivem Szenario) */}
      <ScenarioProgressPanel />

      {/* Mittel, Kapazität, Verpflichtungen, Mitarbeiter-Autonomie */}
      <DailyCapacity state={state} />

      {/* Persönliche Termine + Nächstes Ziel */}
      <PersonalAndGoals state={state} />

      {/* Stillstandgründe: Warum die Automatik nicht disponiert hat */}
      <IdleReasonsList state={state} />

      {/* Auslastungs-Steuerung (flottenweit) */}
      <UtilizationControl state={state} />

      {/* Entwicklung: Entwicklungsziel, Ziele, Meilensteine */}
      <DevelopmentPanel state={state} />

      {/* Kundenbeziehungen: aktive Rahmenverträge + Stammkunden */}
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