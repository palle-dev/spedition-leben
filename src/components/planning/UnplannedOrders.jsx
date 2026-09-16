import React from "react";
import { AlertCircle, Truck, Clock, Package } from "lucide-react";
import { formatPlanningTime } from "@/lib/planningData";

// Bereich "Noch einzuplanen": Angenommene Aufträge ohne Ressourcenzuweisung.
// Zeigt Lieferfristen unabhängig davon, ob schon eine Tour geplant wurde.
export default function UnplannedOrders({ orders, onFindResources, onPlan }) {
  if (!orders || orders.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-green-500/15 bg-green-500/5 px-2.5 py-1">
        <Truck className="w-3 h-3 text-green-400" />
        <span className="text-[11px] text-green-400">Alle angenommenen Aufträge sind disponiert</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 space-y-2">
      <div className="text-xs font-medium text-red-400 flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        Noch einzuplanen — {orders.length} angenommene Aufträge ohne Ressourcenzuweisung
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-thin">
        {orders.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-2 rounded border border-white/10 bg-white/3 px-3 py-2"
          >
            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">
                {o.customer}: {o.fromCity} → {o.toCity}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                <span>{o.cargo}, {o.tons} t</span>
                {o.isDangerousGoods && <span className="text-orange-400">⚠️ Gefahrgut</span>}
                {o.isContractOrder && <span className="text-violet-400">📜 Rahmenvertrag</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatPlanningTime(o.deliveryDeadlineMin)}
              </div>
              <button
                onClick={() => onFindResources?.(o.id)}
                className="text-[10px] px-2 py-1 rounded border border-lime/30 text-lime hover:bg-lime/10 transition"
              >
                Ressourcen
              </button>
              {onPlan && (
                <button
                  onClick={() => onPlan(o.id)}
                  className="text-[10px] px-2 py-1 rounded bg-lime text-ink font-medium hover:brightness-110 transition"
                >
                  Planen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}