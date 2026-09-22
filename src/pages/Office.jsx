import {Link} from "react-router-dom";
import CompanyStories from "@/components/office/CompanyStories";
import JourneyPanel from "@/components/office/JourneyPanel";
import DayRecap from "@/components/office/DayRecap";
import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import OfficeHeader from "@/components/office/OfficeHeader";
import OfficeKPIs from "@/components/office/OfficeKPIs";
import DailyOverview from "@/components/office/DailyOverview";
import DailyCapacity from "@/components/office/DailyCapacity";
import PersonalAndGoals from "@/components/office/PersonalAndGoals";
import OfficeBottom from "@/components/office/OfficeBottom";
import PageHint from "@/components/help/PageHint";
import OfficeTrends from "@/components/office/OfficeTrends";
import OfficeBranches from "@/components/office/OfficeBranches";
import OfficeCustomerRelations from "@/components/office/OfficeCustomerRelations";
import IdleReasonsList from "@/components/office/IdleReasonsList";
import DevelopmentPanel from "@/components/office/DevelopmentPanel";
import ScenarioProgressPanel from "@/components/scenarios/ScenarioProgressPanel";
import DisruptionPanel from "@/components/office/DisruptionPanel";
import ForecastHints from "@/components/office/ForecastHints";
import WorldTeaser from "@/components/world/WorldTeaser";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function Office() {
 const {state}=useGame();
 const [period,setPeriod]=useState("today");
 if(!state)return null;
 return <div className="px-4 sm:px-6 lg:px-10 py-5 max-w-[1400px] mx-auto space-y-5">
  <OfficeHeader period={period} setPeriod={setPeriod}/>
  <Tabs defaultValue="overview" key={state.meta?.partyId}>
   <TabsList aria-label="Bürobereiche" className="grid grid-cols-2 sm:grid-cols-4 h-auto w-full gap-1 bg-slate-950/70 border border-white/10 p-1.5">
    <TabsTrigger value="overview" className="py-2.5">Überblick</TabsTrigger>
    <TabsTrigger value="operations" className="py-2.5">Betrieb</TabsTrigger>
    <TabsTrigger value="development" className="py-2.5">Ziele & Entwicklung</TabsTrigger>
    <TabsTrigger value="reports" className="py-2.5">Berichte & Verlauf</TabsTrigger>
   </TabsList>
   <TabsContent value="overview" className="space-y-5 mt-5">
    <OfficeKPIs state={state} period={period}/>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Jetzt wichtig</h2><DailyOverview state={state} maxItems={3}/></section>
    <JourneyPanel/>
    <ForecastHints/>
    <OfficeDetail title="Heute im Betrieb" description="Kapazität, Verpflichtungen und Aufgaben des Teams"><DailyCapacity state={state}/></OfficeDetail>
    <OfficeDetail title="Dein Büro" description="Atmosphäre und Einführung"><PageHint pageKey="office"/></OfficeDetail>
   </TabsContent>
   <TabsContent value="operations" className="space-y-4 mt-5">
    <h2 className="text-lg font-semibold">Betrieb steuern</h2>
    <DisruptionPanel key={state.meta?.partyId}/>
    <OfficeDetail title="Kapazität & Tagesplanung" description="Verfügbare Mittel, Termine und Mitarbeiter-Autonomie" initialOpen><DailyCapacity state={state}/></OfficeDetail>
    <OfficeDetail title="Stillstand & Disposition" description="Warum Fahrzeuge oder Aufträge warten"><IdleReasonsList state={state}/></OfficeDetail>
    <OfficeDetail title="Kunden & Verträge" description="Stammkunden und laufende Rahmenverträge"><OfficeCustomerRelations state={state}/></OfficeDetail>
    <OfficeDetail title="Standorte" description="Übersicht deiner Filialen"><OfficeBranches state={state}/></OfficeDetail>
    <OfficeDetail title="Persönliche Termine" description="Privatleben und nächste persönliche Ziele"><PersonalAndGoals state={state}/></OfficeDetail>
   </TabsContent>
   <TabsContent value="development" className="space-y-4 mt-5">
    <h2 className="text-lg font-semibold">Deine nächsten Schritte</h2>
    <p className="text-sm text-muted-foreground">Deinen gewählten Unternehmensweg und die Wochenbilanz findest Du im Überblick. Hier entwickelst Du Team und Betrieb im Detail.</p>
    <Link to="/fuehrung" className="block rounded-2xl border border-lime/25 bg-slate-950 p-5 focus-visible:outline focus-visible:outline-lime"><strong>Richtung geben statt alles selbst steuern →</strong><span className="block text-sm text-muted-foreground mt-1">14-Tage-Ziele für Assistenz und Filialleiter – mit messbarer Bilanz.</span></Link>
    <CompanyStories/>
    <ScenarioProgressPanel/>
    <OfficeDetail title="Entwicklung & Meilensteine" description="Langfristige Ziele und Fortschritte"><DevelopmentPanel state={state}/></OfficeDetail>
    <OfficeDetail title="Chancen in der Spielwelt" description="Neue Möglichkeiten entdecken"><WorldTeaser state={state}/></OfficeDetail>
   </TabsContent>
   <TabsContent value="reports" className="space-y-4 mt-5">
    <h2 className="text-lg font-semibold">Berichte & Verlauf</h2>
    <DayRecap key={state.meta?.partyId} state={state}/>
    <OfficeDetail title="Umsatz & Auslastung" description="Trends der letzten 30 Tage"><OfficeTrends/></OfficeDetail>
    <OfficeDetail title="Unternehmensbereiche" description="Finanzen, Personal, Wachstum und Privatleben"><OfficeBottom state={state}/></OfficeDetail>
   </TabsContent>
  </Tabs>
 </div>;
}
function OfficeDetail({title,description,initialOpen=false,children}){
 const [open,setOpen]=useState(initialOpen);
 return <details open={open} onToggle={e=>setOpen(e.currentTarget.open)} className="rounded-2xl border border-white/10 bg-slate-950/40">
  <summary className="cursor-pointer p-4 focus-visible:outline focus-visible:outline-lime rounded-2xl">
   <span className="font-medium">{title}</span><span className="block mt-1 text-xs text-muted-foreground">{description}</span>
  </summary>
  {open&&<div className="p-4 pt-0 space-y-4">{children}</div>}
 </details>;
}

