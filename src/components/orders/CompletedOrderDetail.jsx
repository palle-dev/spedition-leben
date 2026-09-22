import React from "react";
import {
  FileText, MapPin, Package, Truck, Flame, Calendar, Clock, Gauge,
  Route as RouteIcon, History,
} from "lucide-react";
import { formatGameTime } from "@/lib/gameData";

const TYPE_LABELS = { normal: "Standard", express: "Express", advance: "Vorlauf" };

const STATUS_META = {
  geliefert: { label: "Geliefert", color: "text-lime", ring: "bg-lime/10 border-lime/30", icon: "CheckCircle2" },
  storniert: { label: "Storniert", color: "text-red-300", ring: "bg-red-300/10 border-red-300/30", icon: "XCircle" },
  expired: { label: "Verfallen", color: "text-muted-foreground", ring: "bg-white/5 border-white/15", icon: "Clock" },
  failed: { label: "Gescheitert", color: "text-red-400", ring: "bg-red-400/10 border-red-400/30", icon: "AlertOctagon" },
};

// Detail-Ansicht für einen erledigten Auftrag im Drawer.
// Zeigt Status, Auftragsdaten, Finanzen, Einsatz und Verlauf.
export default function CompletedOrderDetail({ order }) {
  const M = STATUS_META[order.status];
  const trip = order._trip;
  const driver = order._driver;
  const vehicle = order._vehicle;
  const history = order.history || [];

  const rows = [
    { icon: FileText, label: "Auftragsnummer", value: order.id },
    { icon: MapPin, label: "Route", value: `${order.fromCity} → ${order.toCity}` },
    { icon: Package, label: "Fracht", value: `${order.cargo} · ${order.tons} t` },
    { icon: Truck, label: "Frachtart", value: TYPE_LABELS[order.offerType] || order.offerType },
    { icon: Flame, label: "Gefahrgut", value: order.isDangerousGoods ? `Ja (ADR ${order.dgClass || "—"})` : "Nein" },
    { icon: Calendar, label: "Lieferfrist", value: formatGameTime(order.deliveryDeadlineMin) },
    { icon: Clock, label: "Erledigt am", value: formatGameTime(order._refMin) },
    { icon: Gauge, label: "Pünktlichkeit", value: order._onTime === true ? "Pünktlich" : order._onTime === false ? "Verspätet" : "—" },
  ];

  const finRows = [
    { label: "Vergütung (Soll)", value: formatEuroSafe(order.paymentCents) },
    { label: "Bezahlt (Ist)", value: order.paidCents != null ? formatEuroSafe(order.paidCents) : "—" },
    { label: "Distanz", value: `${order._km} km` },
    { label: "Treibstoff", value: trip ? formatEuroSafe(trip.fuelCents || 0) : "—" },
    { label: "Zollagentur", value: trip ? formatEuroSafe(trip.customsCents || 0) : "—" },
    { label: "Maut", value: trip ? formatEuroSafe(trip.tollCents || 0) : "—" },
    { label: "Deckungsbeitrag", value: order._contribution != null ? formatEuroSafe(order._contribution) : "—", highlight: true },
  ];

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-3 rounded-xl border p-3 ${M.ring}`}>
        <StatusGlyph status={order.status} />
        <div>
          <div className={`text-sm font-medium ${M.color}`}>{M.label}</div>
          <div className="text-xs text-muted-foreground">{order.customer}</div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Auftragsdaten</h4>
        <div className="grid grid-cols-2 gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-2">
              <r.icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">{r.label}</div>
                <div className="text-foreground truncate">{r.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Finanzen</h4>
        <div className="space-y-1.5">
          {finRows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${r.highlight ? "bg-lime/5 border border-lime/20" : "bg-white/[0.02] border border-white/5"}`}>
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`tabular-nums font-medium ${r.highlight ? (order._contribution >= 0 ? "text-lime" : "text-red-300") : "text-foreground"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {(driver || vehicle) && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Einsatz</h4>
          <div className="grid grid-cols-2 gap-2">
            {driver && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Fahrer</div>
                <div className="text-sm text-foreground">{driver.name}</div>
              </div>
            )}
            {vehicle && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><RouteIcon className="w-3 h-3" /> Fahrzeug</div>
                <div className="text-sm text-foreground">{vehicle.plate || vehicle.model || vehicle.id}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1"><History className="w-3 h-3" /> Verlauf</h4>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs px-2.5 py-1.5 bg-white/[0.02] border border-white/5 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-lime/60 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-foreground/80 capitalize">{h.type}</span>
                  {h.actorName && <span className="text-muted-foreground"> · {h.actorName}</span>}
                  <span className="text-muted-foreground/60 block text-[10px]">{formatGameTime(h.min)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatEuroSafe(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function StatusGlyph({ status }) {
  // Inline-SVG-ähnliche Darstellung über lucide nicht nötig — nutzen einfache Symbole
  const map = {
    geliefert: "✓",
    storniert: "✕",
    expired: "◷",
    failed: "!",
  };
  const color = STATUS_META[status]?.color || "text-muted-foreground";
  return <span className={`text-lg font-bold ${color} w-5 text-center`}>{map[status] || "•"}</span>;
}