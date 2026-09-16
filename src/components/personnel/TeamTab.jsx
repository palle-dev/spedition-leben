import React, { useMemo } from "react";
import { Search, Users, Truck, Headset, Sparkles, Wrench, Calculator, Settings, MapPin, Clock, Briefcase, Building2 } from "lucide-react";
import Portrait from "@/components/ui/Portrait";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel, satisfactionLabel, attendanceLabel, workModeLabel, employmentStatusLabel } from "@/lib/displayHelpers";

const ROLE_ICON = {
  driver: Truck, dispatcher: Headset, dispatcher_senior: Headset,
  cleaner: Sparkles, mechanic: Wrench, accountant: Calculator,
  accountant_senior: Calculator, assistant: Briefcase, branch_manager: Building2,
};

// Rollen → Gruppen für Filter-Chips und Gruppierung
const FILTER_GROUPS = [
  { id: "all", label: "Alle", icon: Users },
  { id: "driver", label: "Fahrer", icon: Truck },
  { id: "dispatcher", label: "Disponent", icon: Headset },
  { id: "cleaner", label: "Reinigung", icon: Sparkles },
  { id: "mechanic", label: "Werkstatt", icon: Wrench },
  { id: "accountant", label: "Buchhaltung", icon: Calculator },
  { id: "assistant", label: "Geschäftsführung", icon: Briefcase },
  { id: "branch_manager", label: "Filialleiter", icon: Building2 },
];

// Rolle → Gruppen-ID
function roleGroup(role) {
  if (role === "dispatcher" || role === "dispatcher_senior") return "dispatcher";
  if (role === "accountant" || role === "accountant_senior") return "accountant";
  return role; // driver, cleaner, mechanic, assistant
}

// Gruppen-Reihenfolge für die Anzeige
const GROUP_ORDER = ["driver", "dispatcher", "cleaner", "mechanic", "accountant", "assistant", "branch_manager"];
const GROUP_LABELS = {
  driver: "Fahrer",
  dispatcher: "Disponenten",
  cleaner: "Reinigung",
  mechanic: "Werkstatt",
  accountant: "Buchhaltung",
  assistant: "Geschäftsführung",
  branch_manager: "Filialleiter",
};

export default function TeamTab({ drivers, employees, state, filter, setFilter, search, setSearch, branchFilter, setBranchFilter, onManage, onSetup }) {
  const branches = state.branches || [];
  const activeBranches = branches.filter(b => b.status === "active");

  // Filiale einer Person ermitteln: Fahrer → branchId, Angestellte → assignedBranchId (Fallback branchId)
  function personBranchId(p) {
    return p._kind === "driver" ? p.branchId : (p.assignedBranchId || p.branchId);
  }

  // Alle Personen (Fahrer + Angestellte) mit einheitlichem Typ-Marker
  const allPersons = useMemo(() => {
    const list = [
      ...drivers.map(d => ({ ...d, _kind: "driver", _group: "driver" })),
      ...employees.map(e => ({ ...e, _kind: "employee", _group: roleGroup(e.role) })),
    ];
    return list;
  }, [drivers, employees]);

  // Gefilterte Personen
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPersons.filter(p => {
      if (filter !== "all" && p._group !== filter) return false;
      // Filialfilter: nach zugewiesener Filiale (nicht physischem Ort)
      if (branchFilter !== "all") {
        const pid = personBranchId(p);
        if (pid !== branchFilter) return false;
      }
      if (q) {
        const branch = branches.find(b => b.id === personBranchId(p));
        const branchName = (branch?.name || "").toLowerCase();
        const branchCity = (branch?.city || "").toLowerCase();
        const locCity = (p.locationCity || "").toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !locCity.includes(q) && !branchName.includes(q) && !branchCity.includes(q)) return false;
      }
      return true;
    });
  }, [allPersons, filter, search, branchFilter, branches]);

  // Zählungen pro Gruppe
  const counts = useMemo(() => {
    const c = { all: allPersons.length };
    for (const p of allPersons) { c[p._group] = (c[p._group] || 0) + 1; }
    return c;
  }, [allPersons]);

  // Gruppierte Anzeige
  const grouped = useMemo(() => {
    const groups = {};
    for (const p of filtered) {
      if (!groups[p._group]) groups[p._group] = [];
      groups[p._group].push(p);
    }
    return groups;
  }, [filtered]);

  if (allPersons.length === 0) return <EmptyTeam />;

  return (
    <div className="space-y-5">
      {/* Filterleiste */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_GROUPS.map(g => {
            const Icon = g.icon;
            const active = filter === g.id;
            const count = counts[g.id] || 0;
            if (count === 0 && g.id !== "all") return null;
            return (
              <button
                key={g.id}
                onClick={() => setFilter(g.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition ${
                  active
                    ? "bg-lime/15 text-lime border-lime/30"
                    : "bg-white/5 text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {g.label}
                <span className={`tabular-nums text-[10px] ${active ? "text-lime/70" : "text-muted-foreground/60"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {activeBranches.length >= 1 && (
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                className="appearance-none rounded-lg pl-9 pr-8 py-2 text-sm bg-white/5 border border-white/10 text-foreground focus:outline-none focus:border-lime/30 transition cursor-pointer"
              >
                <option value="all" style={{ backgroundColor: '#0b1011', color: '#f4f0e8' }}>Alle Filialen</option>
                {activeBranches.map(b => (
                  <option key={b.id} value={b.id} style={{ backgroundColor: '#0b1011', color: '#f4f0e8' }}>{b.name} · {b.city}</option>
                ))}
              </select>
            </div>
          )}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name, Filiale oder Ort…"
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-lime/30 transition"
            />
          </div>
        </div>
      </div>

      {/* Gruppierte Karten */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          Keine Treffer für den aktuellen Filter.
        </div>
      ) : (
        GROUP_ORDER
          .filter(g => grouped[g] && grouped[g].length > 0)
          .map(g => (
            <div key={g}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{GROUP_LABELS[g]}</h2>
                <span className="text-[10px] text-muted-foreground/50 tabular-nums">{grouped[g].length}</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[g].map(p =>
                  p._kind === "driver"
                    ? <DriverCard key={p.id} driver={p} onManage={onManage} />
                    : <EmployeeCard key={p.id} employee={p} state={state} onSetup={() => onSetup(p)} onManage={onManage} />
                )}
              </div>
            </div>
          ))
      )}
    </div>
  );
}

function DriverCard({ driver, onManage }) {
  const sat = satisfactionLabel(driver.satisfaction);
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

function EmptyTeam() {
  return (
    <div className="text-center py-12">
      <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
      <div className="text-sm text-muted-foreground">Noch kein Personal eingestellt.</div>
      <div className="text-xs text-muted-foreground/60 mt-1">Wechsle zum Tab „Einstellen", um Bewerber zu sehen.</div>
    </div>
  );
}