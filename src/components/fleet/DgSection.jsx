import React, { useState, useMemo } from "react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import StatusBadge from "@/components/ui/StatusBadge";
import Drawer from "@/components/ui/Drawer";
import {
  Flame, Droplet, ShieldCheck, Sparkles, AlertTriangle, MapPin, Clock, Plus, Check,
} from "lucide-react";

const TANK_TRUCK_PRICE = 6500000;
const EQUIP_COST = 250000;
const EQUIP_DURATION = 240;
const INSPECTION_COST = 350000;
const TANK_CLEAN_COST = 12000;

export default function DgSection({ state, send, showToast }) {
  const [busyId, setBusyId] = useState(null);
  const [buyingTank, setBuyingTank] = useState(false);
  const [equipVehicle, setEquipVehicle] = useState(null);
  const [cleanVehicle, setCleanVehicle] = useState(null);

  const dgStatus = useMemo(() => {
    const equipped = (state.vehicles || []).filter(v => v.dgEquipment && (!v.dgEquipment.validUntilMin || v.dgEquipment.validUntilMin > state.gameTime));
    const tankVehicles = (state.vehicles || []).filter(v => v.isTankVehicle);
    const dirtyTanks = (state.vehicles || []).filter(v => v.isTankVehicle && v.tankState === "dirty");
    const inspectionDue = (state.vehicles || []).filter(v => {
      if (!v.dgEquipment?.validUntilMin) return false;
      const days = Math.floor((v.dgEquipment.validUntilMin - state.gameTime) / 1440);
      return days <= 30 && days >= 0;
    });
    return { equipped, tankVehicles, dirtyTanks, inspectionDue };
  }, [state.vehicles, state.gameTime]);

  async function buyTank() {
    setBuyingTank(true);
    try {
      const r = await send("buyTankTruck", {});
      showToast("Tankwagen in Hamburg übernommen.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBuyingTank(false); }
  }

  async function equipExternal(v) {
    setBusyId(v.id);
    try {
      const r = await send("equipVehicleExternal", { vehicleId: v.id });
      showToast(`Ausrüstung gestartet – fertig ${formatGameTime(r.endMin)}.`, "success");
      setEquipVehicle(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  async function inspectExternal(v) {
    setBusyId(v.id);
    try {
      const r = await send("inspectDgEquipmentExternal", { vehicleId: v.id });
      showToast(`Spielprüfung gestartet – fertig ${formatGameTime(r.endMin)}.`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  async function doTankCleaning(providerId) {
    const v = cleanVehicle;
    setBusyId(v.id);
    try {
      const r = await send("bookTankCleaning", { vehicleId: v.id, providerId });
      showToast(`Tankreinigung gebucht – fertig ${formatGameTime(r.endMin)}.`, "success");
      setCleanVehicle(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  const activeVehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");
  const unequippedVehicles = activeVehicles.filter(v => !v.isTankVehicle && !v.dgEquipment && v.status === "free");

  return (
    <div className="space-y-5">
      {/* DG-Übersicht */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={ShieldCheck} label="Ausgerüstet (Versandstück)" value={dgStatus.equipped.filter(v => !v.isTankVehicle).length} />
        <StatCard icon={Droplet} label="Tankfahrzeuge" value={dgStatus.tankVehicles.length} />
        <StatCard icon={Sparkles} label="Tank unrein" value={dgStatus.dirtyTanks.length} alert={dgStatus.dirtyTanks.length > 0} />
        <StatCard icon={AlertTriangle} label="Prüfung fällig" value={dgStatus.inspectionDue.length} alert={dgStatus.inspectionDue.length > 0} />
      </div>

      {/* Prüfung-Warnung */}
      {dgStatus.inspectionDue.length > 0 && (
        <div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {dgStatus.inspectionDue.length} Fahrzeug(e) benötigen bald eine Gefahrgut-Spielprüfung (innerhalb 30 Tagen).
        </div>
      )}

      {/* Tankwagen kaufen */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium flex items-center gap-2"><Droplet className="w-4 h-4 text-sky-300" /> Tankwagen kaufen</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Mineralöl-Tankwagen · 18 t Nutzlast · 0,34 l/km · eingebaute DG-Ausrüstung mit Spielprüfung.
              Nur für Tank-Profile geeignet – keine Versandstückfracht.
            </p>
          </div>
          <button onClick={buyTank} disabled={buyingTank || state.company.accountCents < TANK_TRUCK_PRICE}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98] shrink-0">
            {buyingTank ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
            {formatEuro(TANK_TRUCK_PRICE)}
          </button>
        </div>
      </div>

      {/* Fahrzeug-Liste mit DG-Status */}
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Fahrzeuge mit Gefahrgut-Status</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {activeVehicles.map(v => (
            <DgVehicleCard
              key={v.id}
              vehicle={v}
              gameTime={state.gameTime}
              onEquip={() => setEquipVehicle(v)}
              onInspect={() => inspectExternal(v)}
              onClean={() => setCleanVehicle(v)}
              busy={busyId === v.id}
            />
          ))}
        </div>
      </div>

      {/* Ausrüstung-Drawer */}
      <Drawer
        open={!!equipVehicle}
        onClose={() => setEquipVehicle(null)}
        title="Gefahrgut-Ausrüstung"
        kicker={equipVehicle ? vehicleDisplayName(equipVehicle) : ""}
        maxWidth="max-w-md"
      >
        {equipVehicle && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Rüstet diesen Lkw für Versandstück-Gefahrguttransporte (ADR-Klassen 3, 8, 9) aus.
              Tanktransporte erfordern einen separaten Tankwagen.
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-muted-foreground">Kosten</div>
                <div className="font-medium">{formatEuro(EQUIP_COST)}</div>
              </div>
              <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-muted-foreground">Dauer</div>
                <div className="font-medium">4 Stunden</div>
              </div>
              <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-muted-foreground">Gültigkeit</div>
                <div className="font-medium">360 Tage</div>
              </div>
              <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-muted-foreground">Standort</div>
                <div className="font-medium">Hamburg</div>
              </div>
            </div>
            {equipVehicle.locationCity !== "Hamburg" && (
              <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                Externe Ausrüstung nur in Hamburg möglich. Fahrzeug zuerst überführen.
              </div>
            )}
            <button
              onClick={() => equipExternal(equipVehicle)}
              disabled={busyId === equipVehicle.id || equipVehicle.locationCity !== "Hamburg" || state.company.accountCents < EQUIP_COST}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
            >
              {busyId === equipVehicle.id
                ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                : <><ShieldCheck className="w-4 h-4" /> Ausrüstung buchen ({formatEuro(EQUIP_COST)})</>}
            </button>
          </div>
        )}
      </Drawer>

      {/* Tankreinigung-Drawer */}
      <Drawer
        open={!!cleanVehicle}
        onClose={() => setCleanVehicle(null)}
        title="Tankreinigung"
        kicker={cleanVehicle ? vehicleDisplayName(cleanVehicle) : ""}
        maxWidth="max-w-md"
      >
        {cleanVehicle && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Tankreinigung nach jeder Tankladung erforderlich, bevor das Fahrzeug für eine neue Tankladung eingesetzt werden kann.
            </div>
            <div className="p-2 rounded-lg bg-surface-2/30 border border-white/5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Kosten</span><span className="font-medium">{formatEuro(TANK_CLEAN_COST)}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Dauer</span><span className="font-medium">2 Stunden</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Fahrzeugstandort</span><span className="font-medium">{cleanVehicle.locationCity}</span></div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Anbieter wählen (Fahrzeug muss am Anbieterstandort sein):</div>
              {[
                { id: "tc_hamburg", name: "Tankreinigung Hamburg GmbH", city: "Hamburg" },
                { id: "tc_bremen", name: "Weser Tank-Service", city: "Bremen" },
              ].map(p => {
                const here = cleanVehicle.locationCity === p.city;
                return (
                  <button
                    key={p.id}
                    onClick={() => doTankCleaning(p.id)}
                    disabled={busyId === cleanVehicle.id || !here || state.company.accountCents < TANK_CLEAN_COST}
                    className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 border text-sm transition disabled:opacity-40 ${here ? "bg-white/5 border-white/10 hover:border-lime/30 hover:text-lime" : "bg-white/5 border-white/5 opacity-50"}`}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-muted-foreground">{here ? formatEuro(TANK_CLEAN_COST) : `in ${p.city}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DgVehicleCard({ vehicle, gameTime, onEquip, onInspect, onClean, busy }) {
  const isTank = vehicle.isTankVehicle;
  const hasEquip = !!vehicle.dgEquipment;
  const equipValid = hasEquip && (!vehicle.dgEquipment.validUntilMin || vehicle.dgEquipment.validUntilMin > gameTime);
  const daysLeft = hasEquip && vehicle.dgEquipment.validUntilMin ? Math.floor((vehicle.dgEquipment.validUntilMin - gameTime) / 1440) : null;
  const isDirty = isTank && vehicle.tankState === "dirty";
  const Icon = isTank ? Droplet : hasEquip ? ShieldCheck : Flame;

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <Icon className={`w-4 h-4 ${isTank ? "text-sky-300" : hasEquip ? "text-lime" : "text-muted-foreground/40"}`} />
          {vehicleDisplayName(vehicle)}
          {isTank && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300">Tank</span>}
          {hasEquip && !isTank && <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime/15 text-lime">DG</span>}
        </div>
        <StatusBadge status={vehicle.status} />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
        <MapPin className="w-3 h-3 text-foreground/40" /> {vehicle.locationCity}
        {isTank && <><span>·</span><span className="text-muted-foreground/60">18 t · 0,34 l/km</span></>}
        {!isTank && <><span>·</span><span className="text-muted-foreground/60">{vehicle.capacityTons} t · {vehicle.consumptionPer100km} L/100km</span></>}
      </div>

      {/* DG-Status */}
      <div className="mt-2 text-xs space-y-1">
        {hasEquip && equipValid && daysLeft !== null && daysLeft <= 30 && (
          <div className="text-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Spielprüfung in {daysLeft} Tagen fällig
          </div>
        )}
        {hasEquip && equipValid && daysLeft !== null && daysLeft > 30 && (
          <div className="text-lime flex items-center gap-1">
            <Check className="w-3 h-3" /> Ausrüstung gültig bis {formatGameTime(vehicle.dgEquipment.validUntilMin)}
          </div>
        )}
        {isDirty && (
          <div className="text-amber-300 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Tank unrein – Reinigung erforderlich
          </div>
        )}
        {isTank && !isDirty && (
          <div className="text-sky-300 flex items-center gap-1">
            <Check className="w-3 h-3" /> Tank sauber
          </div>
        )}
      </div>

      {/* Aktionen */}
      <div className="mt-3 flex gap-2">
        {!hasEquip && !isTank && vehicle.status === "free" && (
          <button onClick={onEquip} disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-xs hover:border-lime/30 hover:text-lime disabled:opacity-40 transition active:scale-95">
            <ShieldCheck className="w-3.5 h-3.5" /> Ausrüsten
          </button>
        )}
        {hasEquip && equipValid && daysLeft !== null && daysLeft <= 30 && vehicle.status === "free" && (
          <button onClick={onInspect} disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-xs hover:border-lime/30 hover:text-lime disabled:opacity-40 transition active:scale-95">
            <ShieldCheck className="w-3.5 h-3.5" /> Prüfung ({formatEuro(INSPECTION_COST)})
          </button>
        )}
        {isTank && isDirty && vehicle.status === "free" && (
          <button onClick={onClean} disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-xs hover:border-lime/30 hover:text-lime disabled:opacity-40 transition active:scale-95">
            <Sparkles className="w-3.5 h-3.5" /> Tankreinigung
          </button>
        )}
        {vehicle.status === "maintenance" && (
          <div className="flex-1 text-center text-xs text-sky-300 py-2">
            <Clock className="w-3.5 h-3.5 inline mr-1" /> Beschäftigt bis {formatGameTime(vehicle.maintenanceUntil)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, alert }) {
  return (
    <div className={`glass border rounded-xl p-3 ${alert ? "border-amber-400/20" : "border-white/10"}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`w-3 h-3 ${alert ? "text-amber-300" : ""}`} /> {label}
      </div>
      <div className={`text-xl font-medium mt-1 tabular-nums ${alert ? "text-amber-300" : "text-foreground"}`}>{value}</div>
    </div>
  );
}