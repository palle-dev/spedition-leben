import DispatcherQuality from "@/components/personnel/DispatcherQuality";
import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, PERSONNEL_ROLES } from "@/lib/gameData";
import { roleLabel, attendanceLabel, workModeLabel, employmentStatusLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import DispatcherSetup from "@/components/personnel/DispatcherSetup";
import TerminationDialog from "@/components/personnel/TerminationDialog";
import AbsenceTab from "@/components/personnel/AbsenceTab";
import ServicesTab from "@/components/personnel/ServicesTab";
import ApplicantBrowser from "@/components/personnel/ApplicantBrowser";
import JobPostingPanel from "@/components/personnel/JobPostingPanel";
import TeamClimate from "@/components/personnel/TeamClimate";
import TeamTab from "@/components/personnel/TeamTab";
import SatisfactionDetail from "@/components/personnel/SatisfactionDetail";
import DevelopmentSection from "@/components/personnel/DevelopmentSection";
import PersonTrainingSection from "@/components/personnel/PersonTrainingSection";
import PersonAbsenceSection from "@/components/personnel/PersonAbsenceSection";
import AssistantConfig from "@/components/journal/AssistantConfig";
import PageHint from "@/components/help/PageHint";
import { UserPlus, Users, MapPin, Clock, Truck, Headset, Sparkles, Wrench, Calculator, Settings, Building2, AlertCircle, Briefcase, LogOut, HeartHandshake, GraduationCap, Calendar } from "lucide-react";

const ROLE_ICON = {
  driver: Truck, dispatcher: Headset, dispatcher_senior: Headset,
  cleaner: Sparkles, mechanic: Wrench, accountant: Calculator,
  accountant_senior: Calculator,
  assistant: Briefcase, branch_manager: Building2,
};

export default function Personnel() {
  const { state, send, showToast } = useGame();
  const [tab, setTab] = useState("team");
  const [busyId, setBusyId] = useState(null);
  const [setupEmp, setSetupEmp] = useState(null);
  const [managePerson, setManagePerson] = useState(null); // { id, kind, name }
  const [terminatePerson, setTerminatePerson] = useState(null); // { id, kind, name }
  const [jobPostingOpen, setJobPostingOpen] = useState(false);
  const [jobPrefill, setJobPrefill] = useState(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamBranchFilter, setTeamBranchFilter] = useState("all");
  const [hireBranchId, setHireBranchId] = useState(null);
  const activeBranches = (state.branches || []).filter(b => b.status === "active");
  const selectedHireBranchId = hireBranchId || (activeBranches[0]?.id || null);

  const openCompany = state.openCosts.some(o => o.account === "company");
  const drivers = state.drivers || [];
  const employees = state.employees || [];
  const applicants = state.availableApplicants || [];

  // Tägliche Gesamtkosten (Fahrer + Angestellte + Standort)
  const dailyCosts = useMemo(() => {
    let total = drivers.length * 10000 + state.branches.length * 10000;
    for (const emp of employees) {
      if (emp.employmentStatus === "employed") total += emp.costPerDayCents;
    }
    return total;
  }, [drivers, employees, state.branches]);

  async function hire(app) {
    setBusyId(app.id);
    try {
      await send("hireEmployee", { applicantId: app.id, branchId: selectedHireBranchId });
      const branch = activeBranches.find(b => b.id === selectedHireBranchId);
      showToast(`${app.name} als ${roleLabel(app.role)} in ${branch?.city || 'Hamburg'} eingestellt.`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  // Bewerber nach Rolle gruppieren
  const applicantsByRole = useMemo(() => {
    const groups = {};
    for (const app of applicants) {
      const r = app.role || "driver";
      if (!groups[r]) groups[r] = [];
      groups[r].push(app);
    }
    return groups;
  }, [applicants]);

  const roleOrder = ["assistant", "branch_manager", "dispatcher", "dispatcher_senior", "driver", "cleaner", "mechanic", "accountant", "accountant_senior"];

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-5">
      <PageHint pageKey="personnel" />
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Personal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {drivers.length} Fahrer · {employees.length} Angestellte · {applicants.length} Bewerber offen
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tägliche Personalkosten</div>
          <div className="text-lg font-medium tabular-nums">{formatEuro(dailyCosts)}</div>
        </div>
      </div>

      {openCompany && (
        <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> Bei offenen betrieblichen Kosten ist keine Einstellung möglich.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {[
          { id: "team", label: "Team", icon: Users },
          { id: "climate", label: "Teamklima", icon: HeartHandshake },
          { id: "development", label: "Entwicklung", icon: GraduationCap },
          { id: "hire", label: "Einstellen", icon: UserPlus },
          { id: "former", label: "Ehemalige", icon: Briefcase },
          { id: "absence", label: "Abwesenheiten", icon: Clock },
          { id: "services", label: "Dienstleistungen", icon: Briefcase },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition ${
              tab === t.id ? "border-lime text-lime" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Team Tab */}
      {tab === "team" && (
        <TeamTab
          drivers={drivers}
          employees={employees}
          state={state}
          filter={teamFilter}
          setFilter={setTeamFilter}
          search={teamSearch}
          setSearch={setTeamSearch}
          branchFilter={teamBranchFilter}
          setBranchFilter={setTeamBranchFilter}
          onManage={setManagePerson}
          onSetup={setSetupEmp}
        />
      )}

      {/* Teamklima Tab (Auftrag 30) */}
      {tab === "climate" && (
        <TeamClimate onOpenPerson={(p) => setManagePerson({ id: p.personId, kind: p.kind, name: p.name })} />
      )}

      {/* Entwicklung Tab (Auftrag 31) */}
      {tab === "development" && (
        <DevelopmentSection />
      )}

      {/* Einstellen Tab – Bewerbermarkt (Auftrag 29) */}
      {tab === "hire" && (
        <ApplicantBrowser
          onPostJob={() => { setJobPrefill(null); setJobPostingOpen(true); }}
          dailyCosts={dailyCosts}
        />
      )}

      {/* Abwesenheiten Tab (Auftrag 25) */}
      {tab === "absence" && (
        <AbsenceTab state={state} send={send} showToast={showToast} />
      )}

      {/* Dienstleistungen Tab (Auftrag 25) */}
      {tab === "services" && (
        <ServicesTab state={state} send={send} showToast={showToast} />
      )}

      {/* Ehemalige Tab */}
      {tab === "former" && (
        <div className="space-y-5">
          {(() => {
            const formerDrivers = drivers.filter(d => d.employmentStatus === "former");
            const formerEmps = employees.filter(e => e.employmentStatus === "former");
            const total = formerDrivers.length + formerEmps.length;
            if (total === 0) return <div className="text-sm text-muted-foreground text-center py-8">Keine ehemaligen Mitarbeiter.</div>;
            return (
              <>
                {formerDrivers.length > 0 && (
                  <div>
                    <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Ehemalige Fahrer</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {formerDrivers.map(d => <FormerCard key={d.id} person={d} roleLabel="Fahrer" />)}
                    </div>
                  </div>
                )}
                {formerEmps.length > 0 && (
                  <div>
                    <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Ehemalige Angestellte</h2>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {formerEmps.map(e => <FormerCard key={e.id} person={e} roleLabel={roleLabel(e.role)} />)}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Dispatcher Setup Drawer */}
      <Drawer
        open={!!setupEmp}
        onClose={() => setSetupEmp(null)}
        title="Disponent einrichten"
        kicker={setupEmp?.name}
        maxWidth="max-w-md"
      >
        {setupEmp && <DispatcherSetup employee={setupEmp} onClose={() => setSetupEmp(null)} />}
      </Drawer>

      {/* Verwalten Drawer */}
      <Drawer
        open={!!managePerson}
        onClose={() => setManagePerson(null)}
        title="Mitarbeiter verwalten"
        kicker={managePerson?.name}
        maxWidth="max-w-lg"
      >
        {managePerson && (
          <PersonnelDetail
            personId={managePerson.id}
            kind={managePerson.kind}
            onTerminate={() => {
              setTerminatePerson({ id: managePerson.id, kind: managePerson.kind, name: managePerson.name });
              setManagePerson(null);
            }}
          />
        )}
      </Drawer>

      {/* Kündigungs-Dialog Drawer */}
      <Drawer
        open={!!terminatePerson}
        onClose={() => setTerminatePerson(null)}
        title="Arbeitsverhältnis beenden"
        kicker={terminatePerson?.name}
        maxWidth="max-w-md"
      >
        {terminatePerson && (
          <TerminationDialog
            personId={terminatePerson.id}
            personName={terminatePerson.name}
            kind={terminatePerson.kind}
            onClose={() => setTerminatePerson(null)}
          />
        )}
      </Drawer>

      {/* Stellen-Ausschreibung (Auftrag 29) */}
      <JobPostingPanel
        open={jobPostingOpen}
        onClose={() => setJobPostingOpen(false)}
        prefill={jobPrefill}
      />
    </div>
  );
}

function ApplicantCard({ app, onHire, busy, disabled, dailyCosts }) {
  const roleDef = PERSONNEL_ROLES[app.role];
  const hireFee = app.hireFeeCents || roleDef?.hireFeeCents || 0;
  const dailyWage = app.costPerDayCents || roleDef?.costPerDayCents || 0;
  const newDailyTotal = dailyCosts + dailyWage;

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Portrait portraitId={app.portraitId} name={app.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{app.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{roleLabel(app.role)}</div>
          {app.capacity > 0 && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">Kapazität: {app.capacity} {app.role === "dispatcher" || app.role === "dispatcher_senior" ? "Lkw" : "Einheiten"}</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-white/5">
        <div>
          <div className="text-[10px] text-muted-foreground">Einstellung</div>
          <div className="font-medium tabular-nums">{formatEuro(hireFee)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Tageslohn</div>
          <div className="font-medium tabular-nums">{formatEuro(dailyWage)}</div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-2">
        Neu: {formatEuro(newDailyTotal)}/Tag Gesamt
      </div>
      <button
        onClick={onHire}
        disabled={busy || disabled}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 mt-3 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
      >
        {busy ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" /> Einstellen</>}
      </button>
    </div>
  );
}

function FormerCard({ person, roleLabel: rl }) {
  return (
    <div className="glass border border-white/5 rounded-xl p-4 opacity-75">
      <div className="flex items-start gap-3">
        <Portrait portraitId={person.portraitId} name={person.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{person.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{rl} · ausgeschieden</div>
          {person.actualExitMin && (
            <div className="text-[10px] text-muted-foreground/70 mt-1">Austritt am {formatGameTime(person.actualExitMin)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonnelDetail({ personId, kind, onTerminate }) {
  const { state } = useGame();
  const [showDispatcherSetup, setShowDispatcherSetup] = useState(false);
  const person = kind === "driver"
    ? (state.drivers || []).find(d => d.id === personId)
    : (state.employees || []).find(e => e.id === personId);
  if (!person) return <div className="text-sm text-muted-foreground text-center py-4">Person nicht gefunden.</div>;

  const Icon = ROLE_ICON[person.role || "driver"] || Users;
  const empStat = employmentStatusLabel(person.employmentStatus);
  const att = attendanceLabel(person.attendance);
  const isDispatcher = kind === "employee" && (person.role === "dispatcher" || person.role === "dispatcher_senior");
  const noticed = person.employmentStatus === "notice_given";
  const former = person.employmentStatus === "former";

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2/50 border border-white/5">
        <Portrait portraitId={person.portraitId} name={person.name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{person.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Icon className="w-3 h-3" /> {kind === "driver" ? "Fahrer" : roleLabel(person.role)} · seit Tag {person.employedDay}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
            <span className={`flex items-center gap-1 ${empStat.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${empStat.dot}`} /> {empStat.label}
            </span>
            {!former && (
              <span className={`flex items-center gap-1 ${att.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${att.dot}`} /> {att.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <MapPin className="w-3 h-3 text-foreground/40" /> {person.locationCity}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <Clock className="w-3 h-3 text-foreground/40" /> {formatEuro(person.costPerDayCents)}/Tag
        </div>
      </div>

      {/* Austritt angekündigt */}
      {noticed && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <AlertCircle className="w-4 h-4" /> Austritt am {formatGameTime(person.exitMin)}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Ablauf: {person.exitMode === "garden_leave" ? "Freistellung" : "Weiterarbeit bis Fristende"}
          </div>
        </div>
      )}

      {former && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Diese Person hat das Unternehmen verlassen.
          Historische Touren, Buchungen und Nachrichten bleiben erhalten.
        </div>
      )}

      {/* === Zentrale Sektionen für aktive Mitarbeiter === */}
      {!former && (
        <>
          {/* Zufriedenheit & Gehalt */}
          <Section title="Zufriedenheit & Gehalt" icon={HeartHandshake}>
            <SatisfactionDetail
              personId={personId}
              personName={person.name}
              kind={kind}
              onSetupDispatcher={() => setShowDispatcherSetup(true)}
              onTerminate={onTerminate}
            />
          </Section>

          {/* Weiterbildung & Qualifikationen */}
          <Section title="Weiterbildung" icon={GraduationCap}>
            <PersonTrainingSection personId={personId} kind={kind} role={person.role} />
          </Section>

          {/* Abwesenheit & Urlaub */}
          <Section title="Abwesenheit" icon={Calendar}>
            <PersonAbsenceSection personId={personId} personName={person.name} kind={kind} />
          </Section>

          {/* Disponent-Einrichtung (nur Disponenten) */}
          {isDispatcher && !noticed && (
            <Section title="Disponent-Einrichtung" icon={Settings}>
              {showDispatcherSetup ? (
                <DispatcherSetupInline employee={person} onDone={() => setShowDispatcherSetup(false)} />
              ) : (
                <DispatcherSetupSummary employee={person} onEdit={() => setShowDispatcherSetup(true)} />
              )}
            </Section>
          )}

          {/* Assistenten-Konfiguration (nur Assistenten) */}
          {kind === "employee" && person.role === "assistant" && (
            <Section title="Assistent der Geschäftsführung" icon={Briefcase}>
              <AssistantConfig />
            </Section>
          )}

          {/* Kündigung */}
          <div className="pt-2">
            <button
              onClick={onTerminate}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-coral/80 text-ink text-sm font-semibold hover:brightness-110 transition active:scale-[0.98]"
            >
              {noticed ? <><AlertCircle className="w-4 h-4" /> Austritt ansehen</> : <><LogOut className="w-4 h-4" /> Arbeitsverhältnis beenden</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="pt-3 border-t border-white/10">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {title}
      </h3>
      {children}
    </div>
  );
}

function DispatcherSetupSummary({ employee, onEdit }) {
  const { state } = useGame();
  const wm = workModeLabel(employee.workMode);
  const branch = employee.assignedBranchId
    ? (state.branches || []).find(b => b.id === employee.assignedBranchId)
    : null;

  return (
    <div className="space-y-2">
      <DispatcherQuality state={state} employee={employee} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <div className="text-[10px] text-muted-foreground">Arbeitsweise</div>
          <div className="text-foreground/80 mt-0.5">{wm.label}</div>
        </div>
        <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <div className="text-[10px] text-muted-foreground">Zuständig</div>
          <div className="text-foreground/80 mt-0.5">{branch ? branch.name : "Firmenpool"}</div>
        </div>
      </div>
      <button
        onClick={onEdit}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition"
      >
        <Settings className="w-4 h-4" /> Einrichtung ändern
      </button>
    </div>
  );
}

function DispatcherSetupInline({ employee, onDone }) {
  return <DispatcherSetup employee={employee} onClose={onDone} />;
}