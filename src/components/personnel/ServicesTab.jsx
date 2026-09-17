import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro, dayOf, CITIES, getDistance } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import { SERVICE_PROVIDERS, SERVICE_TYPE_LABELS, CLEANING_PRICE_PER_UNIT, TOWING_BASE_CENTS, TOWING_PER_KM_CENTS, TOWING_APPROACH_MIN, TOWING_SPEED, TOWING_HANDOVER_MIN, BLOCK_DURATION_MIN, countPersonsAtCity, computeCleaningNeedFront } from "@/lib/absenceData";
import {
  Sparkles, Wrench, Truck, Users, Headset, Calculator, X, Check, Clock,
  Calendar, MapPin, Euro, AlertCircle, Phone, Package,
} from "lucide-react";

const DAY_MIN = 1440;

const TYPE_ICON = {
  cleaning: Sparkles, maintenance: Wrench, towing: Truck,
  temp_driver: Users, temp_dispatcher: Headset,
  external_accounting: Calculator, rental_truck: Truck,
};

const TYPE_FILTERS = [
  { id: "all", label: "Alle" },
  { id: "cleaning", label: "Reinigung" },
  { id: "maintenance", label: "Wartung" },
  { id: "towing", label: "Abschleppen" },
  { id: "temp_staff", label: "Fremdpersonal" },
  { id: "external_accounting", label: "Buchhaltung" },
  { id: "rental_truck", label: "Mietfahrzeug" },
];

export default function ServicesTab({ state, send, showToast }) {
  const [filter, setFilter] = useState("all");
  const [bookingType, setBookingType] = useState(null);
  const [selectedContract, setSelectedContract] = useState(null);

  const contracts = state.serviceContracts || [];
  const now = state.gameTime;

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      if (filter === "all") return true;
      if (filter === "temp_staff") return c.type === "temp_driver" || c.type === "temp_dispatcher";
      return c.type === filter;
    }).sort((a, b) => (b.createdAtMin || 0) - (a.createdAtMin || 0));
  }, [contracts, filter]);

  const activeContracts = filteredContracts.filter(c => c.status === "active" || c.status === "planned");
  const completedContracts = filteredContracts.filter(c => c.status === "completed");
  const cancelledContracts = filteredContracts.filter(c => c.status === "cancelled");

  async function handleCancel(contractId) {
    try {
      await send("cancelService", { contractId });
      showToast("Dienstleistung storniert.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="space-y-5">
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              filter === f.id ? "bg-lime/20 border-lime/40 text-lime" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Buchen-Buttons */}
      <div>
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Neue Dienstleistung buchen</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { type: "cleaning", label: "Reinigung", icon: Sparkles },
            { type: "maintenance", label: "Wartung", icon: Wrench },
            { type: "towing", label: "Abschleppen", icon: Truck },
            { type: "temp_driver", label: "Fahrervertretung", icon: Users },
            { type: "temp_dispatcher", label: "Dispo-Vertretung", icon: Headset },
            { type: "external_accounting", label: "Ext. Buchhaltung", icon: Calculator },
            { type: "rental_truck", label: "Mietfahrzeug", icon: Truck },
          ].map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.type}
                onClick={() => setBookingType(s.type)}
                className="glass flex flex-col items-center gap-1.5 rounded-xl p-3 border border-white/10 hover:border-lime/30 hover:bg-lime/5 text-muted-foreground hover:text-lime transition"
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium text-center">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aktive/Geplante Verträge */}
      {activeContracts.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Aktive & geplante Verträge
          </h2>
          <div className="space-y-2">
            {activeContracts.map(c => (
              <ContractCard key={c.id} contract={c} state={state} onCancel={handleCancel} onSelect={() => setSelectedContract(c)} />
            ))}
          </div>
        </div>
      )}

      {/* Abgeschlossene Verträge */}
      {completedContracts.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> Abgeschlossene Leistungen
          </h2>
          <div className="space-y-2">
            {completedContracts.slice(0, 10).map(c => (
              <ContractCard key={c.id} contract={c} state={state} onSelect={() => setSelectedContract(c)} />
            ))}
          </div>
        </div>
      )}

      {filteredContracts.length === 0 && (
        <div className="text-center py-8">
          <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Keine Dienstleistungen in dieser Kategorie.</div>
        </div>
      )}

      {/* Buchungs-Drawer */}
      <Drawer
        open={!!bookingType}
        onClose={() => setBookingType(null)}
        title={`${SERVICE_TYPE_LABELS[bookingType] || "Dienstleistung"} buchen`}
        maxWidth="max-w-md"
      >
        {bookingType && (
          <BookingForm
            type={bookingType}
            state={state}
            send={send}
            showToast={showToast}
            onClose={() => setBookingType(null)}
          />
        )}
      </Drawer>

      {/* Vertrags-Detail-Drawer */}
      <Drawer
        open={!!selectedContract}
        onClose={() => setSelectedContract(null)}
        title="Vertragsdetails"
        maxWidth="max-w-md"
      >
        {selectedContract && (
          <ContractDetails contract={selectedContract} state={state} />
        )}
      </Drawer>
    </div>
  );
}

function ContractCard({ contract, state, onCancel, onSelect }) {
  const Icon = TYPE_ICON[contract.type] || Package;
  const statusColors = {
    planned: "text-sky-300 bg-sky-500/10",
    active: "text-amber-300 bg-amber-500/10",
    completed: "text-lime bg-lime/10",
    cancelled: "text-muted-foreground bg-white/5",
    disrupted: "text-red-300 bg-red-500/10",
  };
  const statusLabels = {
    planned: "Geplant", active: "Aktiv", completed: "Abgeschlossen",
    cancelled: "Storniert", disrupted: "Gestört",
  };
  const cost = contract.costCents || contract.totalCostCents || 0;

  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg glass border border-white/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{contract.providerName}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColors[contract.status] || ""}`}>{statusLabels[contract.status] || contract.status}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {SERVICE_TYPE_LABELS[contract.type] || contract.type}
            {contract.branchName && ` · ${contract.branchName}`}
            {contract.vehicleId && ` · ${vehicleDisplayName(state.vehicles.find(v => v.id === contract.vehicleId) || { id: contract.vehicleId })}`}
            {contract.substitutesPersonName && ` · für ${contract.substitutesPersonName}`}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> {formatGameTime(contract.startMin)}</span>
            <span className="flex items-center gap-1"><Euro className="w-2.5 h-2.5" /> {formatEuro(cost)}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onSelect} className="flex-1 text-xs py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-foreground transition">
          Details
        </button>
        {(contract.status === "planned" || (contract.recurring && contract.status === "active")) && (
          <button onClick={() => onCancel(contract.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-400/40 hover:text-red-300 text-xs text-foreground transition">
            <X className="w-3 h-3" /> Stornieren
          </button>
        )}
      </div>
    </div>
  );
}

function ContractDetails({ contract, state }) {
  const Icon = TYPE_ICON[contract.type] || Package;
  const cost = contract.costCents || contract.totalCostCents || 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-lg glass border border-white/10">
        <Icon className="w-5 h-5 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium">{contract.providerName}</div>
          <div className="text-[10px] text-muted-foreground">{SERVICE_TYPE_LABELS[contract.type]}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <DetailRow label="Beginn" value={formatGameTime(contract.startMin)} />
        <DetailRow label="Ende" value={formatGameTime(contract.endMin)} />
        <DetailRow label="Kosten" value={formatEuro(cost)} />
        {contract.units && <DetailRow label="Einheiten" value={contract.units} />}
        {contract.blocks && <DetailRow label="Blöcke" value={contract.blocks} />}
        {contract.distanceKm && <DetailRow label="Distanz" value={`${contract.distanceKm} km`} />}
        {contract.branchName && <DetailRow label="Standort" value={contract.branchName} />}
        {contract.vehicleId && <DetailRow label="Fahrzeug" value={contract.vehicleId} />}
        {contract.substitutesPersonName && <DetailRow label="Vertritt" value={contract.substitutesPersonName} />}
        {contract.capacityPoints && <DetailRow label="Kapazität" value={`${contract.capacityPoints} Prüfpunkte`} />}
      </div>
      {contract.recurring && (
        <div className="text-[10px] text-sky-300 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" /> Wiederkehrend: alle {contract.recurringIntervalDays || 7} Tage
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="p-2 rounded-lg glass border border-white/10">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function BookingForm({ type, state, send, showToast, onClose }) {
  if (type === "cleaning") return <CleaningBooking state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "maintenance") return <MaintenanceBooking state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "towing") return <TowingBooking state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "temp_driver") return <TempStaffBooking type="temp_driver" state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "temp_dispatcher") return <TempStaffBooking type="temp_dispatcher" state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "external_accounting") return <AccountingBooking state={state} send={send} showToast={showToast} onClose={onClose} />;
  if (type === "rental_truck") return <RentalBooking state={state} send={send} showToast={showToast} onClose={onClose} />;
  return null;
}

function CleaningBooking({ state, send, showToast, onClose }) {
  const [branchId, setBranchId] = useState(state.branches?.[0]?.id || "");
  const [units, setUnits] = useState(1);
  const [recurring, setRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const branch = state.branches?.find(b => b.id === branchId);
  const need = branch ? computeCleaningNeedFront(countPersonsAtCity(state, branch.city)) : 1;
  const cost = units * CLEANING_PRICE_PER_UNIT;
  const startMin = (Math.floor(state.gameTime / DAY_MIN) + 1) * DAY_MIN + 600;

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookCleaning", { branchId, units, recurring, recurringIntervalDays: 7 });
      showToast(`Reinigung gebucht: ${units} Einheit(en), ${formatEuro(cost)}.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted-foreground">Standort</label>
        <select value={branchId} onChange={e => setBranchId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          {state.branches?.map(b => <option key={b.id} value={b.id}>{b.name} ({b.city})</option>)}
        </select>
      </div>
      {branch && (
        <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Aktuelle Sauberkeit</span><span className="tabular-nums">{branch.cleanliness ?? 85}/100</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tagesbedarf</span><span className="tabular-nums">{need} Einheit(en)</span></div>
        </div>
      )}
      <div>
        <label className="text-[11px] text-muted-foreground">Einheiten</label>
        <input type="number" min={1} max={8} value={units} onChange={e => setUnits(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} className="accent-lime" />
        Wiederkehrend (alle 7 Tage)
      </label>
      <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Erster Termin</span><span>{formatGameTime(startMin)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Kosten</span><span className="tabular-nums font-medium">{formatEuro(cost)}</span></div>
      </div>
      <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}

function MaintenanceBooking({ state, send, showToast, onClose }) {
  const [vehicleId, setVehicleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const freeVehicles = (state.vehicles || []).filter(v => v.status === "free" && v.condition < 100);

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookMaintenance", { vehicleId });
      showToast("Wartung gebucht.", "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted-foreground">Fahrzeug</label>
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          <option value="">– wählen –</option>
          {freeVehicles.map(v => <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {v.locationCity} · Zustand {v.condition}</option>)}
        </select>
      </div>
      <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Dauer</span><span>8 Spielstunden</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Kosten</span><span className="tabular-nums font-medium">{formatEuro(150000)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Ziel</span><span>Zustand 100</span></div>
        {state.private?.stress >= 80 && <div className="text-amber-300 text-[10px]">Belastungszuschlag +25 % → {formatEuro(187500)}</div>}
      </div>
      <button onClick={submit} disabled={submitting || !vehicleId} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}

function TowingBooking({ state, send, showToast, onClose }) {
  const [vehicleId, setVehicleId] = useState("");
  const [targetCity, setTargetCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const vehicles = (state.vehicles || []).filter(v => v.status === "free" || v.status === "on_trip");
  const vehicle = vehicles.find(v => v.id === vehicleId);
  const dist = vehicle && targetCity ? getDistance(vehicle.locationCity, targetCity) : 0;
  const cost = TOWING_BASE_CENTS + dist * TOWING_PER_KM_CENTS;
  const transportMin = Math.ceil((dist / TOWING_SPEED) * 60);
  const totalTime = TOWING_APPROACH_MIN + transportMin + TOWING_HANDOVER_MIN;

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookTowing", { vehicleId, targetCity });
      showToast(`Abschleppdienst gebucht: ${formatEuro(cost)}.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted-foreground">Fahrzeug</label>
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          <option value="">– wählen –</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {v.locationCity}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Zielort</label>
        <select value={targetCity} onChange={e => setTargetCity(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          <option value="">– wählen –</option>
          {CITIES.filter(c => c !== vehicle?.locationCity).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {dist > 0 && (
        <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Distanz</span><span className="tabular-nums">{dist} km</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Anfahrt</span><span>{TOWING_APPROACH_MIN} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{transportMin} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Übergabe</span><span>{TOWING_HANDOVER_MIN} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gesamtzeit</span><span className="tabular-nums">{Math.floor(totalTime / 60)} h {totalTime % 60} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Kosten</span><span className="tabular-nums font-medium">{formatEuro(cost)}</span></div>
        </div>
      )}
      <button onClick={submit} disabled={submitting || !vehicleId || !targetCity} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}

function TempStaffBooking({ type, state, send, showToast, onClose }) {
  const [substitutesPersonId, setSubstitutesPersonId] = useState("");
  const [blocks, setBlocks] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const isDriver = type === "temp_driver";
  const provision = isDriver ? 15000 : 15000;
  const blockRate = isDriver ? 18000 : 26000;
  const totalCost = provision + blocks * blockRate;

  const candidates = [
    ...(state.drivers || []).filter(d => d.employmentStatus === "employed").map(d => ({ ...d, kind: "driver" })),
    ...(state.employees || []).filter(e => e.employmentStatus === "employed" && (isDriver ? e.role === undefined : (e.role === "dispatcher" || e.role === "dispatcher_senior"))).map(e => ({ ...e, kind: "employee" })),
  ];

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookTempStaff", { type, substitutesPersonId: substitutesPersonId || null, blocks });
      showToast(`Fremdpersonal gebucht: ${formatEuro(totalCost)}.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted-foreground">Vertretung für (optional)</label>
        <select value={substitutesPersonId} onChange={e => setSubstitutesPersonId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          <option value="">– ohne Zuordnung –</option>
          {candidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.kind === "driver" ? "Fahrer" : p.role}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Einsatzblöcke (24h)</label>
        <input type="number" min={2} max={30} value={blocks} onChange={e => setBlocks(Math.max(2, parseInt(e.target.value) || 2))} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none" />
      </div>
      <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Bereitstellung</span><span className="tabular-nums">{formatEuro(provision)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Pro Block (24h)</span><span className="tabular-nums">{formatEuro(blockRate)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Mindestblöcke</span><span>2</span></div>
        <div className="flex justify-between border-t border-white/5 pt-1 mt-1"><span className="text-muted-foreground">Gesamtkosten</span><span className="tabular-nums font-medium">{formatEuro(totalCost)}</span></div>
        {!isDriver && <div className="text-[10px] text-muted-foreground/70">Kapazität: 6 Lkw, Dienstzeit 08:00–16:00</div>}
      </div>
      <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}

function AccountingBooking({ state, send, showToast, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const openReceipts = (state.accounting?.receipts || []).filter(r => r.status === "generated").length;
  const startMin = (Math.floor(state.gameTime / DAY_MIN) + 1) * DAY_MIN + 480;

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookExternalAccounting", {});
      showToast("Externe Buchhaltung gebucht.", "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Erster Termin</span><span>{formatGameTime(startMin)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Dienstzeit</span><span>08:00–16:00</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Kapazität</span><span>40 Prüfpunkte</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Offene Belege</span><span className="tabular-nums">{openReceipts}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Tagespauschale</span><span className="tabular-nums font-medium">{formatEuro(16000)}</span></div>
      </div>
      <div className="text-[10px] text-amber-300 flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Pauschale ist auch bei geringerem Belegaufkommen fällig. Kernbuchhaltung und Löhne laufen ohne diesen Service weiter.
      </div>
      <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}

function RentalBooking({ state, send, showToast, onClose }) {
  const [provisionCity, setProvisionCity] = useState("Hamburg");
  const [blocks, setBlocks] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const totalCost = 15000 + blocks * 12000;

  async function submit() {
    setSubmitting(true);
    try {
      await send("bookRentalTruck", { provisionCity, blocks });
      showToast(`Mietfahrzeug gebucht: ${formatEuro(totalCost)}.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] text-muted-foreground">Übergabeort</label>
        <select value={provisionCity} onChange={e => setProvisionCity(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Blöcke (24h)</label>
        <input type="number" min={2} max={30} value={blocks} onChange={e => setBlocks(Math.max(2, parseInt(e.target.value) || 2))} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none" />
      </div>
      <div className="p-3 rounded-lg glass border border-white/10 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Übergabe</span><span className="tabular-nums">{formatEuro(15000)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Pro Block (24h)</span><span className="tabular-nums">{formatEuro(12000)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Mindestblöcke</span><span>2</span></div>
        <div className="flex justify-between border-t border-white/5 pt-1 mt-1"><span className="text-muted-foreground">Gesamtkosten</span><span className="tabular-nums font-medium">{formatEuro(totalCost)}</span></div>
      </div>
      <div className="text-[10px] text-muted-foreground/70">Fahrzeug bleibt fremdes Eigentum.</div>
      <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
      </button>
    </div>
  );
}