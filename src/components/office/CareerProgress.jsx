import React from "react";
import { Link } from "react-router-dom";
import { formatEuro } from "@/lib/gameData";
import { VEHICLE_PRICE_EUR, HIRE_FEE_EUR, DRIVER_COST_PER_DAY_EUR } from "@/lib/gameData";
import { Truck, Users, TrendingUp } from "lucide-react";

// Sichtbares Wachstum: echte Meilenstein-Fortschritte, der nächste
// Kaufschritt mit Spielwerten (keine zweite Preisliste) und eine
// kompakte Unternehmensübersicht aus vorhandenen Daten.
export default function CareerProgress({ state }) {
  const vehicleValue = state.vehicles.reduce((s, v) => s + v.bookValueCents, 0);
  const allDone = state.milestones.every((m) => m.achieved);
  const buyCostCents = (VEHICLE_PRICE_EUR + HIRE_FEE_EUR) * 100;
  const buyReady = state.company.accountCents >= buyCostCents;
  const showBuy = !allDone && state.milestones.find((m) => !m.achieved)?.id === "m3";

  return (
    <div className="bg-office-2/60 border border-wood/30 rounded-lg p-3 h-full">
      <div className="flex items-center gap-2 text-amber-200 text-sm font-medium mb-3">
        <TrendingUp className="w-4 h-4" /> Unternehmenswachstum
      </div>

      <div className="space-y-2 mb-3">
        {state.milestones.map((m) => {
          let prog = 0, target = 1;
          if (m.id === "m1") { prog = state.stats.totalDeliveries; target = 1; }
          else if (m.id === "m2") { prog = state.stats.timelyDeliveries; target = 10; }
          else if (m.id === "m3") { prog = state.vehicles.length; target = 4; }
          const pct = Math.min(100, Math.round((prog / target) * 100));
          return (
            <div key={m.id}>
              <div className="flex justify-between text-xs">
                <span className={m.achieved ? "text-emerald-300" : "text-amber-100/70"}>{m.name}</span>
                <span className="font-mono text-amber-100/60">{m.achieved ? "✓" : `${prog}/${target}`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-office overflow-hidden mt-0.5">
                <div className={`h-full ${m.achieved ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${m.achieved ? 100 : pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {showBuy && (
        <div className="border border-wood/30 rounded-md p-2 bg-office/40 mb-2">
          <div className="text-xs text-amber-100/70">Nächster Wachstumsschritt</div>
          <div className="text-sm text-amber-50">Lkw {formatEuro(VEHICLE_PRICE_EUR * 100)} · Fahrer {formatEuro(HIRE_FEE_EUR * 100)}</div>
          <div className="text-[11px] text-amber-100/50">Tägliche Fahrerkosten: {formatEuro(DRIVER_COST_PER_DAY_EUR * 100)}/Tag</div>
          {buyReady ? (
            <Link to="/fuhrpark" className="mt-1.5 inline-block text-xs px-2.5 py-1 rounded bg-amber-500 text-amber-950 font-semibold hover:bg-amber-400">
              Jetzt kaufen →
            </Link>
          ) : (
            <div className="text-[11px] text-amber-100/40 mt-1">Noch {formatEuro(buyCostCents - state.company.accountCents)} fehlen.</div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Mini icon={Truck} label="Lkw" value={state.vehicles.length} />
        <Mini icon={Users} label="Fahrer" value={state.drivers.length} />
        <div className="rounded bg-office/40 p-1.5 text-center">
          <div className="text-[10px] text-amber-100/50">Buchwerte</div>
          <div className="text-xs font-mono text-amber-100">{formatEuro(vehicleValue)}</div>
        </div>
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value }) {
  return (
    <div className="rounded bg-office/40 p-1.5 text-center">
      <div className="text-[10px] text-amber-100/50 flex items-center justify-center gap-1"><Icon className="w-3 h-3" /> {label}</div>
      <div className="text-sm font-mono text-amber-100">{value}</div>
    </div>
  );
}