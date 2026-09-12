import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import CourseCatalogTab from "@/components/personnel/CourseCatalogTab";
import ApprenticeshipTab from "@/components/personnel/ApprenticeshipTab";
import QualificationsTab from "@/components/personnel/QualificationsTab";
import TrainingScheduleTab from "@/components/personnel/TrainingScheduleTab";
import TrainingOverviewTab from "@/components/personnel/TrainingOverviewTab";
import { GraduationCap, BookOpen, Users, Award, Calendar, BarChart } from "lucide-react";

// Hauptbereich „Entwicklung" in der Personal-Verwaltung.
// Bietet Tabs für Übersicht, Weiterbildungen, Ausbildung, Qualifikationen und Termine.
export default function DevelopmentSection() {
  const { state } = useGame();
  const [tab, setTab] = useState("overview");

  const tabs = [
    { id: "overview", label: "Übersicht", icon: BarChart },
    { id: "courses", label: "Weiterbildungen", icon: BookOpen },
    { id: "apprenticeship", label: "Ausbildung", icon: GraduationCap },
    { id: "qualifications", label: "Qualifikationen", icon: Award },
    { id: "schedule", label: "Termine", icon: Calendar },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-Tabs */}
      <div className="flex gap-1 border-b border-white/10 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              tab === t.id ? "border-lime text-lime" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalte */}
      {tab === "overview" && <TrainingOverviewTab />}
      {tab === "courses" && <CourseCatalogTab />}
      {tab === "apprenticeship" && <ApprenticeshipTab />}
      {tab === "qualifications" && <QualificationsTab />}
      {tab === "schedule" && <TrainingScheduleTab />}
    </div>
  );
}