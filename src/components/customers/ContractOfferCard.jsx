import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatDay, formatClock, CONTRACT_DURATION_DAYS, CONTRACT_DISCOUNT } from "@/lib/customerData";
import { MapPin, Clock, Truck, AlertTriangle, CheckCircle2, FileText } from "lucide-react";

export default function ContractOfferCard({ contract, capacity, onAccept, onDismiss }) {
  const { state } = useGame();
  const [accepting, setAccepting] = React.useState(false);
  const [showConsequences, setShowConsequences] = React.useState(false);

  if (!contract) return null;

  const totalTransports = contract.transportsPerDay * CONTRACT_DURATION_DAYS;
  const totalRevenue = contract.paymentPerTransportCents * totalTransports;

  // Geschätzte Kosten pro Transport (Kraftstoff + Maut)
  const km = contract.driveMin > 0 ? Math.round((contract.driveMin / 60) * 60) : 0; // ~60 km/h
  const fuelPerTrip = Math.round(km * 28 / 100 * 170); // 28 L/100km, 1.70 €/L
  const tollPerTrip = Math.round(km * 20); // 0.20 €/km
  const costPerTrip = fuelPerTrip + tollPerTrip;
  const contributionPerTrip = contract.paymentPerTransportCents - costPerTrip;
  const totalContribution = contributionPerTrip * totalTransports;

  async function handleAccept() {
    setAccepting(true);
    try {
      await onAccept(contract.id);
    } catch (e) {
      // Fehler wird vom Context als Toast angezeigt
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="rounded-xl border border-coral/20 bg-coral/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <FileText className="w-5 h-5 text-coral shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium text-sm">Rahmenvertragsangebot</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {contract.customerName} bietet einen festen Transportvertrag an. Abschluss ist eine bewusste Entscheidung.
          </p>
        </div>
      </div>

      {/* Vertragsdetails */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Relation:</span>
          <span className="font-medium">{contract.fromCity} → {contract.toCity}</span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Fracht:</span>
          <span className="font-medium">{contract.cargo}, {contract.tons} t</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Laufzeit:</span>
          <span className="font-medium">{formatDay(contract.startMin)} – {formatDay(contract.endMin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Transporte/Tag:</span>
          <span className="font-medium">{contract.transportsPerDay}</span>
        </div>
      </div>

      {/* Vergütung */}
      <div className="rounded-lg bg-white/5 p-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vergütung pro Transport:</span>
          <span className="font-medium tabular-nums">{formatEuro(contract.paymentPerTransportCents)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Davon {Math.round(CONTRACT_DISCOUNT * 100)}% Vertragsabschlag:</span>
          <span className="text-coral/80 tabular-nums">−{formatEuro(Math.round(contract.paymentPerTransportCents * CONTRACT_DISCOUNT / (1 - CONTRACT_DISCOUNT)))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Transporte gesamt:</span>
          <span className="font-medium tabular-nums">{totalTransports}</span>
        </div>
        <div className="border-t border-white/10 pt-1.5 flex justify-between">
          <span className="font-medium">Geplanter Gesamtumsatz:</span>
          <span className="font-medium tabular-nums text-lime">{formatEuro(totalRevenue)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Geschätzter Deckungsbeitrag:</span>
          <span className="tabular-nums">{formatEuro(totalContribution)}</span>
        </div>
        <div className="text-[10px] text-muted-foreground/70 pl-2">
          Kosten: Kraftstoff ({formatEuro(fuelPerTrip)}/Transport) + Maut ({formatEuro(tollPerTrip)}/Transport)
        </div>
      </div>

      {/* Lieferfenster */}
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Lieferfenster:</span> Abholung ab {formatClock(contract.startMin + 480)},
        Lieferfrist bis {formatClock(contract.startMin + contract.opMin + contract.deliveryBufferMin)} Uhr.
        Keine Gefahrgut-Qualifikation erforderlich. Mindestkapazität: {contract.minCapacityTons} t.
      </div>

      {/* Kapazitätsbedarf */}
      {capacity && (
        <div className="flex items-start gap-2 text-xs rounded-lg bg-white/5 p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-coral/70 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Kapazitätsbedarf:</span> {capacity.pairsNeededPerDay} Fahrzeug-Fahrer-Paarung(en)
            pro Tag, insgesamt {capacity.totalWorkMin} Minuten Fahr- und Ladezeit. Stellen Sie sicher,
            dass ausreichend Kapazität für die Vertragslaufzeit gebunden ist.
          </div>
        </div>
      )}

      {/* Vertragsbedingungen */}
      <div className="text-[11px] text-muted-foreground/80 space-y-0.5">
        <p>· Die Vergütung ist während des Vertrags fest.</p>
        <p>· Zahlung und Umsatz entstehen durch die tatsächliche Leistung.</p>
        <p>· Vertragsaufträge gelten als angenommen und erscheinen in der Auftragsliste.</p>
        <p>· Eine vorzeitige Beendigung stoppt zukünftige Transporte und kostet 6 Vertrauen.</p>
        <p>· Auftragsbezogene Konventionalstrafen bei Fristverletzung bleiben wirksam.</p>
      </div>

      {/* Aktionen */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-lime/15 hover:bg-lime/25 border border-lime/30 text-lime py-2 text-sm font-medium transition disabled:opacity-50"
        >
          <CheckCircle2 className="w-4 h-4" />
          {accepting ? "Wird abgeschlossen…" : "Vertrag abschließen"}
        </button>
        <button
          onClick={onDismiss}
          className="px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground py-2 text-sm transition"
        >
          Später
        </button>
      </div>
    </div>
  );
}