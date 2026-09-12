import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, PERSONNEL_ROLES, ROLE_LABELS } from "@/lib/gameData";
import { roleLabel, satisfactionLabel, attendanceLabel, workModeLabel, vehicleDisplayName, employmentStatusLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import DispatcherSetup from "@/components/personnel/DispatcherSetup";
import TerminationDialog from "@/components/personnel/TerminationDialog";
import { UserPlus, Users, MapPin, Clock, Truck, Headset, Sparkles, Wrench, Calculator, Settings, Check, X, AlertCircle, Briefcase, LogOut, RotateCcw } from "lucide-react";

const ROLE_ICON = {
  driver: Truck, dispatcher: Headset, dispatcher_senior: Headset,
  cleaner: Sparkles, mechanic: Wrench, accountant: Calculator,
};

export default function Personnel() {
  const { state, send, showToast } = useGame();
  const [tab, setTab] = useState("team");
  const [busyId, setBusyId] = useState(null);
  const [setupEmp, setSetupEmp] = useState(null);
  const [managePerson, setManagePerson] = useState(null); // { id, kind, name }
  const [terminatePerson, setTerminatePerson] = useState(null); // { id, kind, name }

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
      await send("hireEmployee", { applicantId: app.id });
      showToast(`${app.name} als ${roleLabel(app.role)} eingestellt.`, "success");
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

  const roleOrder = ["dispatcher", "dispatcher_senior", "driver", "cleaner", "mechanic", "accountant"];

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-5">
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
        <div className="space-y-5">
          {/* Fahrer */}
          {drivers.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Fahrer</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {drivers.map(d => <DriverCard key={d.id} driver={d} onManage={setManagePerson} />)}
              </div>
            </div>
          )}
          {/* Angestellte (nicht fahrende Rollen) */}
          {employees.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Angestellte</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {employees.map(emp => (
                  <EmployeeCard key={emp.id} employee={emp} state={state} onSetup={() => setSetupEmp(emp)} onManage={setManagePerson} />
                ))}
              </div>
            </div>
          )}
          {drivers.length === 0 && employees.length === 0 && (
            <EmptyTeam />
          )}
        </div>
      )}

      {/* Einstellen Tab */}
      {tab === "hire" && (
        <div className="space-y-5">
          {roleOrder.map(role => {
            const apps = applicantsByRole[role];
            if (!apps || apps.length === 0) return null;
            const roleDef = PERSONNEL_ROLES[role];
            const Icon = ROLE_ICON[role] || Users;
            return (
              <div key={role}>
                <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" /> {roleLabel(role)}
                </h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {apps.map(app => (
                    <ApplicantCard
                      key={app.id}
                      app={app}
                      onHire={() => hire(app)}
                      busy={busyId === app.id}
                      disabled={openCompany || state.company.accountCents < (app.hireFeeCents || roleDef?.hireFeeCents || 0)}
                      dailyCosts={dailyCosts}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {applicants.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">Aktuell keine Bewerber verfügbar.</div>
          )}
        </div>
      )}

      {/* Abwesenheiten Tab (Etappe 2) */}
      {tab === "absence" && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground bg-surface-2/50 rounded-lg px-4 py-4 border border-white/5">
            Krankheit, Urlaub und Vertretung werden in Etappe 2 implementiert.
            Hier werden künftig Abwesenheitskalender, Urlaubsanträge und Vertretungsorganisation angezeigt.
          </div>
          {/* Vorhandene Abwesenheiten anzeigen */}
          {employees.filter(e => e.attendance !== "present").length === 0 && drivers.filter(d => d.attendance !== "present").length === 0 && (
            <div className="text-xs text-muted-foreground/70 text-center py-4">Keine Abwesenheiten.</div>
          )}
        </div>
      )}

      {/* Dienstleistungen Tab (Etappe 2) */}
      {tab === "services" && (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground bg-surface-2/50 rounded-lg px-4 py-4 border border-white/5">
            Externe Dienstleistungen (Reinigungsservice, Fremdvergabe, Mietfahrzeuge, Betriebsschutz)
            werden in Etappe 2/3 implementiert.
          </div>
        </div>
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
                    <div className="grid md:grid-cols-2 gap-3">
                      {formerDrivers.map(d => <FormerCard key={d.id} person={d} roleLabel="Fahrer" />)}
                    </div>
                  </div>
                )}
                {formerEmps.length > 0 && (
                  <div>
                    <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Ehemalige Angestellte</h2>
                    <div className="grid md:grid-cols-2 gap-3">
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
        maxWidth="max-w-md"
      >
        {managePerson && (
          <PersonnelDetail
            personId={managePerson.id}
            kind={managePerson.kind}
            onSetupDispatcher={() => {
              const emp = employees.find(e => e.id === managePerson.id);
              setManagePerson(null);
              if (emp) setSetupEmp(emp);
            }}
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
    </div>
  );
}

function DriverCard({ driver, onManage }) {
  const sat = satisfactionLabel(driver.satisfaction);
  const att = attendanceLabel(driver.attendance);
  const empStat = employmentStatusLabel(driver.employmentStatus);
  const statusLabel = {
    free: { label: "Bereit", color: "text-lime", dot: "bg-lime" },
    on_trip: { label: "Unterwegs", color: "text-amber-300", dot: "bg-amber-300" },
    resting: { label: "Erholung", color: "text-sky-300", dot: "bg-sky-300" },
    maintenance: { label: "Wartung", color: "text-violet-300", dot: "bg-violet-300" },
    former: { label: "Ehemalig", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  }[driver.status] || { label: driver.status, color: "text-muted-foreground", dot: "bg-muted-foreground" };
  const noticed = driver.employmentStatus === "notice_given";

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Portrait portraitId={driver.portraitId} name={driver.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{driver.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Fahrer · seit Tag {driver.employedDay}</div>
          <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
            <span className={`flex items-center gap-1 ${statusLabel.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusLabel.dot}`} /> {statusLabel.label}
            </span>
            <span className={`flex items-center gap-1 ${sat.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sat.dot}`} /> {sat.label}
            </span>
            {noticed && (
              <span className={`flex items-center gap-1 ${empStat.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${empStat.dot}`} /> {empStat.label}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3 text-foreground/40" /> {driver.locationCity}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3 text-foreground/40" /> {formatEuro(driver.costPerDayCents)}/Tag
        </div>
      </div>
      {driver.restUntil && (
        <div className="text-[10px] text-sky-300 mt-2">Erholung bis {formatGameTime(driver.restUntil)}</div>
      )}
      {noticed && (
        <div className="text-[10px] text-amber-300 mt-2">Austritt am {formatGameTime(driver.exitMin)}</div>
      )}
      <button
        onClick={() => onManage({ id: driver.id, kind: "driver", name: driver.name })}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition mt-3"
      >
        <Settings className="w-3.5 h-3.5" /> Verwalten
      </button>
    </div>
  );
}

function EmployeeCard({ employee, state, onSetup, onManage }) {
  const Icon = ROLE_ICON[employee.role] || Users;
  const sat = satisfactionLabel(employee.satisfaction);
  const att = attendanceLabel(employee.attendance);
  const empStat = employmentStatusLabel(employee.employmentStatus);
  const isDispatcher = employee.role === "dispatcher" || employee.role === "dispatcher_senior";
  const wm = workModeLabel(employee.workMode);
  const assignedVehicles = (employee.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
  const pendingSuggestions = (employee.suggestions || []).filter(s => s.status === "pending");
  const noticed = employee.employmentStatus === "notice_given";

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Portrait portraitId={employee.portraitId} name={employee.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{employee.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Icon className="w-3 h-3" /> {roleLabel(employee.role)} · seit Tag {employee.employedDay}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
            <span className={`flex items-center gap-1 ${att.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${att.dot}`} /> {att.label}
            </span>
            <span className={`flex items-center gap-1 ${sat.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sat.dot}`} /> {sat.label}
            </span>
            {noticed && (
              <span className={`flex items-center gap-1 ${empStat.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${empStat.dot}`} /> {empStat.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3 text-foreground/40" /> {employee.locationCity}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3 h-3 text-foreground/40" /> {formatEuro(employee.costPerDayCents)}/Tag
        </div>
      </div>

      {noticed && (
        <div className="text-[10px] text-amber-300 mt-2">Austritt am {formatGameTime(employee.exitMin)}</div>
      )}

      {/* Disponent-spezifisch */}
      {isDispatcher && !noticed && (
        <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Arbeitsweise</span>
            <span className="text-foreground/80">{wm.label}</span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Zugewiesene Lkw</span>
            <span className="text-foreground/80">{assignedVehicles.length}/{employee.capacity}</span>
          </div>
          {pendingSuggestions.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-lime">
              <Sparkles className="w-3 h-3" /> {pendingSuggestions.length} Vorschlag{pendingSuggestions.length > 1 ? "e" : ""} offen
            </div>
          )}
          <button
            onClick={onSetup}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition mt-2"
          >
            <Settings className="w-3.5 h-3.5" /> Einrichten
          </button>
        </div>
      )}

      <button
        onClick={() => onManage({ id: employee.id, kind: "employee", name: employee.name })}
        className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition ${isDispatcher && !noticed ? "mt-2" : "mt-3"}`}
      >
        <Settings className="w-3.5 h-3.5" /> Verwalten
      </button>
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

function EmptyTeam() {
  return (
    <div className="text-center py-12">
      <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
      <div className="text-sm text-muted-foreground">Noch kein Personal eingestellt.</div>
      <div className="text-xs text-muted-foreground/60 mt-1">Wechsle zum Tab „Einstellen“, um Bewerber zu sehen.</div>
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

function PersonnelDetail({ personId, kind, onSetupDispatcher, onTerminate }) {
  const { state } = useGame();
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

      {/* Aktionen */}
      {!former && (
        <div className="space-y-2 pt-2">
          {isDispatcher && !noticed && (
            <button
              onClick={onSetupDispatcher}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition"
            >
              <Settings className="w-4 h-4" /> Einrichtung ändern
            </button>
          )}
          <button
            onClick={onTerminate}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-coral/80 text-ink text-sm font-semibold hover:brightness-110 transition active:scale-[0.98]"
          >
            {noticed ? <><AlertCircle className="w-4 h-4" /> Austritt ansehen</> : <><LogOut className="w-4 h-4" /> Arbeitsverhältnis beenden</>}
          </button>
        </div>
      )}

      {former && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Diese Person hat das Unternehmen verlassen.
          Historische Touren, Buchungen und Nachrichten bleiben erhalten.
        </div>
      )}
    </div>
  );
}