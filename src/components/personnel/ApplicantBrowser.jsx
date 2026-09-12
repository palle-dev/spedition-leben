import React, { useState, useMemo, useCallback } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, PERSONNEL_ROLES } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { ROLE_LABELS, paginate, totalPages } from "@/lib/personnelMarketData";
import ApplicantCard from "@/components/personnel/ApplicantCard";
import Drawer from "@/components/ui/Drawer";
import Portrait from "@/components/ui/Portrait";
import { Search, RotateCcw, Briefcase, ChevronLeft, ChevronRight, Truck, Headset, Sparkles, Wrench, Calculator, Users, Star, UserPlus, MapPin, Clock } from "lucide-react";

const ROLE_ICON = {
  driver: Truck, dispatcher: Headset, dispatcher_senior: Headset,
  cleaner: Sparkles, mechanic: Wrench, accountant: Calculator, accountant_senior: Calculator,
};

const ROLE_ORDER = ["driver", "dispatcher", "dispatcher_senior", "mechanic", "cleaner", "accountant", "accountant_senior"];
const PAGE_SIZE = 12;

export default function ApplicantBrowser({ onPostJob, dailyCosts }) {
  const { state, send, showToast } = useGame();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const [sort, setSort] = useState("created_desc");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const [detailApp, setDetailApp] = useState(null);

  const applicants = state.availableApplicants || [];
  const watchlist = state.personnelMarket?.watchlist || [];
  const openCompany = state.openCosts.some(o => o.account === "company");
  const nextWaveLabel = state.personnelMarket?.nextDemandWaveMin
    ? formatGameTime(Math.min(state.personnelMarket.nextDemandWaveMin, getNextRegularWave(state.gameTime)))
    : formatGameTime(getNextRegularWave(state.gameTime));

  // Gefilterte und sortierte Bewerber
  const filtered = useMemo(() => {
    let result = applicants.filter(a => {
      // Nur verfügbare, nicht abgelaufene
      if (a.expiresAtMin && a.expiresAtMin <= state.gameTime) return false;
      if (a.status && a.status !== "available") return false;
      // Suche
      if (search) {
        const q = search.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !roleLabel(a.role).toLowerCase().includes(q)) return false;
      }
      // Rollen-Filter
      if (roleFilter !== "all" && a.role !== roleFilter) return false;
      // Standort-Filter
      if (locationFilter !== "all" && a.locationCity !== locationFilter) return false;
      // Profil-Filter
      if (profileFilter === "standard" && (a.role === "dispatcher_senior" || a.role === "accountant_senior")) return false;
      if (profileFilter === "senior" && a.role !== "dispatcher_senior" && a.role !== "accountant_senior") return false;
      return true;
    });
    // Sortierung
    if (sort === "created_desc") result.sort((a, b) => (b.createdAtMin || 0) - (a.createdAtMin || 0));
    else if (sort === "created_asc") result.sort((a, b) => (a.createdAtMin || 0) - (b.createdAtMin || 0));
    else if (sort === "fee_asc") result.sort((a, b) => (a.hireFeeCents || 0) - (b.hireFeeCents || 0));
    else if (sort === "fee_desc") result.sort((a, b) => (b.hireFeeCents || 0) - (a.hireFeeCents || 0));
    else if (sort === "expiry_asc") result.sort((a, b) => (a.expiresAtMin || 0) - (b.expiresAtMin || 0));
    return result;
  }, [applicants, search, roleFilter, locationFilter, profileFilter, sort, state.gameTime]);

  const total = filtered.length;
  const pages = totalPages(total, PAGE_SIZE);
  const pageItems = paginate(filtered, page, PAGE_SIZE);

  // Filter zurücksetzen
  const resetFilters = useCallback(() => {
    setSearch(""); setRoleFilter("all"); setLocationFilter("all");
    setProfileFilter("all"); setSort("created_desc"); setPage(1);
  }, []);

  // Seite zurücksetzen wenn Filter sich ändern
  const hasActiveFilters = search || roleFilter !== "all" || locationFilter !== "all" || profileFilter !== "all";

  // Standorte für Filter
  const locations = useMemo(() => {
    const set = new Set();
    for (const a of applicants) if (a.locationCity) set.add(a.locationCity);
    return Array.from(set).sort();
  }, [applicants]);

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

  async function toggleWatch(app) {
    try {
      await send("toggleApplicantWatchlist", { applicantId: app.id });
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Kopfzeile mit Markt-Info */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-medium tracking-tight">Bewerbermarkt</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total} Bewerber verfügbar · Nächste Welle: {nextWaveLabel}
            </p>
          </div>
          <button
            onClick={onPostJob}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-lime/10 border border-lime/30 text-lime text-sm font-medium hover:bg-lime/20 transition"
          >
            <Briefcase className="w-4 h-4" /> Stelle ausschreiben
          </button>
        </div>

        {/* Offene Stellen */}
        {state.personnelMarket?.postings?.filter(p => p.status === "open").length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
            {state.personnelMarket.postings.filter(p => p.status === "open").map(p => (
              <div key={p.id} className="flex items-center gap-1.5 text-[11px] bg-surface-2/50 rounded-lg px-2.5 py-1.5 border border-white/5">
                <Briefcase className="w-3 h-3 text-lime" />
                <span className="text-foreground/80">{roleLabel(p.role)} in {p.locationCity}</span>
                <span className="text-muted-foreground">· {p.remaining}/{p.count} offen</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter-Leiste */}
      <div className="glass border border-white/10 rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name oder Rolle suchen..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2/50 border border-white/10 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-lime/30"
            />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="rounded-lg bg-surface-2/50 border border-white/10 text-sm px-3 py-2 focus:outline-none focus:border-lime/30"
          >
            <option value="created_desc">Neueste zuerst</option>
            <option value="created_asc">Älteste zuerst</option>
            <option value="fee_asc">Gebühr aufsteigend</option>
            <option value="fee_desc">Gebühr absteigend</option>
            <option value="expiry_asc">Ablauf bald</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Filter zurücksetzen
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Rollen-Filter */}
          <button
            onClick={() => { setRoleFilter("all"); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${roleFilter === "all" ? "bg-lime/15 border-lime/30 text-lime" : "border-white/10 text-muted-foreground hover:text-foreground"}`}
          >
            Alle Rollen
          </button>
          {ROLE_ORDER.map(role => {
            const count = applicants.filter(a => a.role === role && (!a.expiresAtMin || a.expiresAtMin > state.gameTime)).length;
            if (count === 0) return null;
            const Icon = ROLE_ICON[role] || Users;
            return (
              <button
                key={role}
                onClick={() => { setRoleFilter(role); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${roleFilter === role ? "bg-lime/15 border-lime/30 text-lime" : "border-white/10 text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="w-3 h-3" /> {roleLabel(role)} <span className="text-muted-foreground/70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Standort-Filter */}
          <select
            value={locationFilter}
            onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
            className="rounded-lg bg-surface-2/50 border border-white/10 text-xs px-3 py-1.5 focus:outline-none focus:border-lime/30"
          >
            <option value="all">Alle Standorte</option>
            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
          {/* Profil-Filter */}
          <select
            value={profileFilter}
            onChange={e => { setProfileFilter(e.target.value); setPage(1); }}
            className="rounded-lg bg-surface-2/50 border border-white/10 text-xs px-3 py-1.5 focus:outline-none focus:border-lime/30"
          >
            <option value="all">Alle Profile</option>
            <option value="standard">Standard</option>
            <option value="senior">Erfahren</option>
          </select>
        </div>
      </div>

      {/* Bewerber-Grid */}
      {pageItems.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <div className="text-sm text-muted-foreground">
            {hasActiveFilters ? "Keine Bewerber mit diesen Filtern." : "Aktuell keine Bewerber verfügbar."}
          </div>
          {hasActiveFilters && (
            <button onClick={resetFilters} className="mt-3 text-xs text-lime hover:text-lime/80 transition">
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageItems.map(app => (
              <ApplicantCard
                key={app.id}
                app={app}
                state={state}
                onHire={() => hire(app)}
                onWatch={() => toggleWatch(app)}
                onDetails={() => setDetailApp(app)}
                busy={busyId === app.id}
                disabled={openCompany || state.company.accountCents < (app.hireFeeCents || 0)}
                watched={watchlist.includes(app.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                Seite {page} von {pages} · {total} Bewerber insgesamt
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail-Drawer */}
      <Drawer
        open={!!detailApp}
        onClose={() => setDetailApp(null)}
        title="Bewerber-Details"
        kicker={detailApp ? roleLabel(detailApp.role) : ""}
        maxWidth="max-w-md"
      >
        {detailApp && <ApplicantDetail app={detailApp} state={state} onHire={() => { hire(detailApp); setDetailApp(null); }} busy={busyId === detailApp.id} disabled={openCompany || state.company.accountCents < (detailApp.hireFeeCents || 0)} dailyCosts={dailyCosts} />}
      </Drawer>
    </div>
  );
}

function getNextRegularWave(t) {
  const clock = t % 1440;
  if (clock < 480) return Math.floor(t / 1440) * 1440 + 480;
  if (clock < 840) return Math.floor(t / 1440) * 1440 + 840;
  return Math.floor(t / 1440) * 1440 + 1440 + 480;
}

function ApplicantDetail({ app, state, onHire, busy, disabled, dailyCosts }) {
  const roleDef = PERSONNEL_ROLES[app.role];
  const hireFee = app.hireFeeCents || roleDef?.hireFeeCents || 0;
  const dailyWage = app.costPerDayCents || roleDef?.costPerDayCents || 0;
  const newDailyTotal = dailyCosts + dailyWage;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-2/50 border border-white/5">
        <Portrait portraitId={app.portraitId} name={app.name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{app.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{roleLabel(app.role)}</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">
            {app.role === "dispatcher_senior" || app.role === "accountant_senior" ? "Erfahrenes Profil" : "Standard-Profil"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <MapPin className="w-3 h-3 text-foreground/40" /> {app.locationCity}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground p-2 rounded-lg bg-surface-2/30 border border-white/5">
          <Clock className="w-3 h-3 text-foreground/40" /> {app.earliestStartMin <= state.gameTime ? "Ab sofort" : formatGameTime(app.earliestStartMin)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-surface-2/30 border border-white/5">
          <div className="text-[10px] text-muted-foreground">Einstellungsgebühr</div>
          <div className="text-lg font-medium tabular-nums">{formatEuro(hireFee)}</div>
        </div>
        <div className="p-3 rounded-lg bg-surface-2/30 border border-white/5">
          <div className="text-[10px] text-muted-foreground">Tageslohn</div>
          <div className="text-lg font-medium tabular-nums">{formatEuro(dailyWage)}</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-lime/5 border border-lime/10">
        <div className="text-[10px] text-muted-foreground">Neue tägliche Personalkosten</div>
        <div className="text-base font-medium tabular-nums text-lime">{formatEuro(newDailyTotal)}/Tag</div>
      </div>

      {app.capacity > 0 && (
        <div className="text-xs text-muted-foreground">
          Kapazität: {app.role === "dispatcher" || app.role === "dispatcher_senior" ? `${app.capacity} Lkw` : `${app.capacity} Einheiten`}
        </div>
      )}

      {app.role === "mechanic" && ((state.workshop?.slots) || []).filter(s => s.status === "built").length === 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20 text-xs text-amber-300">
          Hinweis: Es ist kein Werkstattplatz gebaut. Der Mechaniker kann eingestellt werden, hat aber keinen Arbeitsplatz.
        </div>
      )}

      <button
        onClick={onHire}
        disabled={busy || disabled}
        className="w-full flex items-center justify-center gap-2 rounded-lg py-3 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
      >
        {busy ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" /> Einstellen</>}
      </button>
    </div>
  );
}