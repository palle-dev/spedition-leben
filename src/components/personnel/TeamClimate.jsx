import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { satisfactionLevel, CLIMATE_FILTERS } from "@/lib/satisfactionData";
import Portrait from "@/components/ui/Portrait";
import { AlertTriangle, Clock, Wallet, HeartHandshake, ChevronRight, Users } from "lucide-react";

// Teamklima-Übersicht mit Filtern für kritische Fälle,
// Austrittsrisiken und offene Zusagen.
export default function TeamClimate({ onOpenPerson }) {
  const { state, send } = useGame();
  const [filter, setFilter] = useState("all");
  const [climate, setClimate] = useState(null);

  React.useEffect(() => {
    send("getTeamClimate").then(r => setClimate(r)).catch(() => setClimate(null));
  }, [state.gameTime, state.satisfaction?.causes?.length]);

  const persons = useMemo(() => {
    if (!climate) return [];
    let list = climate.persons;
    if (filter === "critical") list = list.filter(p => p.satisfaction < 40);
    else if (filter === "atRisk") list = list.filter(p => p.consecutiveLowSatisfactionDays >= 2);
    else if (filter === "noticeGiven") list = list.filter(p => p.noticed);
    else if (filter === "unpaidWages") list = list.filter(p => p.hasUnpaidWages);
    return list.sort((a, b) => a.satisfaction - b.satisfaction);
  }, [climate, filter]);

  if (!climate) {
    return <div className="text-sm text-muted-foreground text-center py-8">Lade Teamklima…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Kritisch" value={climate.critical.length} icon={AlertTriangle} color="text-coral" />
        <SummaryCard label="Austrittsrisiko" value={climate.atRisk.length} icon={Clock} color="text-amber-300" />
        <SummaryCard label="Kündigung offen" value={climate.noticeGiven.length} icon={HeartHandshake} color="text-amber-300" />
        <SummaryCard label="Offene Löhne" value={climate.persons.filter(p => p.hasUnpaidWages).length} icon={Wallet} color="text-amber-300" />
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5">
        {CLIMATE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f.id
                ? "bg-lime/15 text-lime border border-lime/30"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Personen-Liste */}
      {persons.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Keine Personen in diesem Filter.</div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-2">
          {persons.map(p => (
            <ClimateCard key={p.personId} person={p} onOpen={() => onOpenPerson(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <div className={`text-xl font-medium tabular-nums ${value > 0 ? color : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function ClimateCard({ person, onOpen }) {
  const sat = satisfactionLevel(person.satisfaction);
  const roleLbl = roleLabel(person.role);

  return (
    <button
      onClick={onOpen}
      className="glass border border-white/10 rounded-xl p-3 text-left hover:border-lime/20 transition w-full"
    >
      <div className="flex items-start gap-2.5">
        <Portrait portraitId={person.portraitId} name={person.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm truncate">{person.name}</div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{roleLbl}</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full ${sat.bar}`} style={{ width: `${person.satisfaction}%` }} />
            </div>
            <span className={`text-[10px] tabular-nums ${sat.color}`}>{person.satisfaction}</span>
          </div>
        </div>
      </div>

      {/* Indikatoren */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {person.hasUnpaidWages && (
          <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded">
            <Wallet className="w-2.5 h-2.5" /> {formatEuro(person.unpaidWagesCents)} offen
          </span>
        )}
        {person.consecutiveLowSatisfactionDays >= 2 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" /> {person.consecutiveLowSatisfactionDays} Tage kritisch
          </span>
        )}
        {person.noticed && (
          <span className="flex items-center gap-1 text-[10px] text-coral bg-coral/10 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" /> Austritt {person.exitMin ? formatGameTime(person.exitMin) : ""}
          </span>
        )}
        {person.hasOpenVacationRequest && (
          <span className="flex items-center gap-1 text-[10px] text-sky-300 bg-sky-300/10 px-1.5 py-0.5 rounded">
            Urlaub offen
          </span>
        )}
        {person.activeCauseCount > 0 && !person.hasUnpaidWages && (
          <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">
            {person.activeCauseCount} Ursache(n)
          </span>
        )}
      </div>
    </button>
  );
}