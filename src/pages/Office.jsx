import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { Truck, Users, Package, Wallet, AlertCircle, Trophy, MapPin, Clock } from "lucide-react";
import { Link } from "react-router-dom";

export default function Office() {
  const { state } = useGame();
  const freeVehicles = state.vehicles.filter(v => v.status === "free").length;
  const freeDrivers = state.drivers.filter(d => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime)).length;
  const activeTrips = state.trips.filter(t => t.status === "in_progress");
  const offered = state.orders.filter(o => o.status === "offered").length;
  const pendingInvites = state.appointments.filter(a => a.status === "pending" && a.appearMin <= state.gameTime);
  const openCosts = state.openCosts;
  const vehicleValue = state.vehicles.reduce((s, v) => s + v.bookValueCents, 0);

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Speditionsbüro</h1>
        <p className="text-amber-100/60 text-sm">Dein Schreibtisch mit Blick auf den Betriebshof. Hier überschaust du die Lage.</p>
      </div>

      {pendingInvites.length > 0 && (
        <Link to="/zuhause" className="block bg-amber-500/15 border border-amber-400/50 rounded-lg p-4 hover:bg-amber-500/25 transition">
          <div className="flex items-center gap-2 text-amber-200 font-medium">
            <AlertCircle className="w-5 h-5" /> Eine private Einladung wartet auf deine Antwort.
          </div>
          <div className="text-sm text-amber-100/70 mt-1">{pendingInvites[0].text}</div>
        </Link>
      )}

      {openCosts.length > 0 && (
        <Link to="/finanzen" className="block bg-red-500/15 border border-red-400/50 rounded-lg p-4 hover:bg-red-500/25 transition">
          <div className="flex items-center gap-2 text-red-200 font-medium">
            <AlertCircle className="w-5 h-5" /> Es gibt offene Kosten in Höhe von {formatEuro(openCosts.reduce((s, o) => s + o.amountCents, 0))}.
          </div>
          <div className="text-sm text-red-100/70 mt-1">Unter Finanzen kannst du vorhandene Mittel einsetzen, um Schulden zu tilgen.</div>
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card icon={Wallet} label="Firmenkonto" value={formatEuro(state.company.accountCents)} sub={`Fahrzeugbuchwerte: ${formatEuro(vehicleValue)}`} />
        <Card icon={Truck} label="Fuhrpark" value={`${state.vehicles.length} Lkw`} sub={`${freeVehicles} frei`} />
        <Card icon={Users} label="Fahrer" value={`${state.drivers.length}`} sub={`${freeDrivers} einsatzbereit`} />
        <Card icon={Package} label="Aufträge" value={`${offered} Angebote`} sub={`${activeTrips.length} unterwegs`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="Laufende Fahrten" icon={MapPin}>
          {activeTrips.length === 0 ? <Empty text="Keine Fahrten unterwegs." /> : (
            <ul className="space-y-2">
              {activeTrips.map(t => {
                const v = state.vehicles.find(x => x.id === t.vehicleId);
                const d = state.drivers.find(x => x.id === t.driverId);
                const leg = t.legs[t.currentLeg];
                return (
                  <li key={t.id} className="text-sm border border-wood/30 rounded-md p-2 bg-office-2/40">
                    <div className="font-medium text-amber-100">{v?.id} · {d?.name}</div>
                    <div className="text-amber-100/60 text-xs">
                      Abschnitt: {legLabel(leg)} · bis {formatGameTime(leg.endMin)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Meilensteine" icon={Trophy}>
          <ul className="space-y-2">
            {state.milestones.map(m => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${m.achieved ? "bg-emerald-400" : "bg-amber-100/30"}`} />
                <span className={m.achieved ? "text-amber-100" : "text-amber-100/50"}>{m.name}</span>
                {m.achieved && <span className="text-xs text-amber-100/40 ml-auto">erreicht</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Kurzhinweise" icon={Clock}>
        <ul className="text-sm text-amber-100/70 space-y-1 list-disc pl-5">
          <li>Zeit läuft nur auf Befehl (1 Std / Nächstes Ereignis). Planen bei stehender Zeit ist erlaubt.</li>
          <li>Vereinfachte Einsatzgrenze: höchstens 8 Stunden pro Einsatz, danach 12 Stunden Erholung.</li>
          <li>Fahrerlohn und Standortkosten werden täglich um Mitternacht gebucht.</li>
          <li>Private Entnahme (100 €/Tag) und Lebenshaltung (30 €/Tag) laufen automatisch.</li>
        </ul>
      </Panel>
    </div>
  );
}

function legLabel(leg) {
  if (!leg) return "—";
  if (leg.type === "empty") return `Leerfahrt ${leg.fromCity} → ${leg.toCity}`;
  if (leg.type === "load") return `Laden in ${leg.fromCity}`;
  if (leg.type === "drive") return `Fahrt ${leg.fromCity} → ${leg.toCity}`;
  if (leg.type === "unload") return `Entladen in ${leg.toCity}`;
  if (leg.type === "empty_drive") return `Leerfahrt ${leg.fromCity} → ${leg.toCity}`;
  return leg.type;
}

function Card({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-office-2/60 border border-wood/30 rounded-lg p-3">
      <div className="flex items-center gap-2 text-amber-300/80 text-xs"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-xl font-semibold text-amber-100 mt-1">{value}</div>
      <div className="text-xs text-amber-100/50">{sub}</div>
    </div>
  );
}
function Panel({ title, icon: Icon, children }) {
  return (
    <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-amber-200 font-medium mb-3"><Icon className="w-4 h-4" /> {title}</div>
      {children}
    </div>
  );
}
function Empty({ text }) { return <div className="text-sm text-amber-100/40">{text}</div>; }