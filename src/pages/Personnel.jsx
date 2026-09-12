import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, PERSONNEL_ROLES, ROLE_LABELS } from "@/lib/gameData";
import { roleLabel, satisfactionLabel, attendanceLabel, workModeLabel, vehicleDisplayName } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import DispatcherSetup from "@/components/personnel/DispatcherSetup";
import { UserPlus, Users, MapPin, Clock, Truck, Headset, Sparkles, Wrench, Calculator, Settings, Check, X, AlertCircle, Briefcase } from "lucide-react";

const ROLE_ICON = {
  driver: Truck, dispatcher: Headset, dispatcher_senior: Headset,
  cleaner: Sparkles, mechanic: Wrench, accountant: Calculator,
};

export default function Personnel() {
  const { state, send, showToast } = useGame();
  const [tab, setTab] = useState("team");
  const [busyId, setBusyId] = useState(null);
  const [setupEmp, setSetupEmp] = useState(null);

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
                {drivers.map(d => <DriverCard key={d.id} driver={d} />)}
              </div>
            </div>
          )}
          {/* Angestellte (nicht fahrende Rollen) */}
          {employees.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Angestellte</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {employees.map(emp => (
                  <EmployeeCard key={emp.id} employee={emp} state={state} onSetup={() => setSetupEmp(emp)} />
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
    </div>
  );
}

function DriverCard({ driver }) {
  const sat = satisfactionLabel(driver.satisfaction);
  const att = attendanceLabel(driver.attendance);
  const statusLabel = {
    free: { label: "Bereit", color: "text-lime", dot: "bg-lime" },
    on_trip: { label: "Unterwegs", color: "text-amber-300", dot: "bg-amber-300" },
    resting: { label: "Erholung", color: "text-sky-300", dot: "bg-sky-300" },
    maintenance: { label: "Wartung", color: "text-violet-300", dot: "bg-violet-300" },
  }[driver.status] || { label: driver.status, color: "text-muted-foreground", dot: "bg-muted-foreground" };

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Portrait portraitId={driver.portraitId} name={driver.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{driver.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Fahrer · seit Tag {driver.employedDay}</div>
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className={`flex items-center gap-1 ${statusLabel.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusLabel.dot}`} /> {statusLabel.label}
            </span>
            <span className={`flex items-center gap-1 ${sat.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sat.dot}`} /> {sat.label}
            </span>
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
    </div>
  );
}

function EmployeeCard({ employee, state, onSetup }) {
  const Icon = ROLE_ICON[employee.role] || Users;
  const sat = satisfactionLabel(employee.satisfaction);
  const att = attendanceLabel(employee.attendance);
  const isDispatcher = employee.role === "dispatcher" || employee.role === "dispatcher_senior";
  const wm = workModeLabel(employee.workMode);
  const assignedVehicles = (employee.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
  const pendingSuggestions = (employee.suggestions || []).filter(s => s.status === "pending");

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Portrait portraitId={employee.portraitId} name={employee.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{employee.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Icon className="w-3 h-3" /> {roleLabel(employee.role)} · seit Tag {employee.employedDay}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px]">
            <span className={`flex items-center gap-1 ${att.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${att.dot}`} /> {att.label}
            </span>
            <span className={`flex items-center gap-1 ${sat.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sat.dot}`} /> {sat.label}
            </span>
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

      {/* Disponent-spezifisch */}
      {isDispatcher && (
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