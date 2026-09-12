import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { UserPlus, Users, MapPin, Clock, Coffee } from "lucide-react";

export default function Personnel() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);
  const openCompany = state.openCosts.some(o => o.account === "company");

  async function hire(app) {
    setBusyId(app.id);
    try { const r = await send("hireDriver", { applicantId: app.id }); showToast(`${app.name} eingestellt (${r.driverId}).`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Personal</h1>
        <p className="text-amber-100/60 text-sm">{state.drivers.length} Fahrer · 100 €/Tag je Fahrer · Einstellung 500 € einmalig.</p>
      </div>
      {openCompany && <div className="text-sm text-red-300">Bei offenen betrieblichen Kosten ist keine Einstellung möglich.</div>}

      <div>
        <h2 className="text-sm uppercase tracking-wide text-amber-300/70 mb-2">Angestellte Fahrer</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {state.drivers.map(d => (
            <div key={d.id} className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-amber-100"><Users className="w-4 h-4 text-amber-300" /> {d.name}</div>
                <StatusBadge status={d.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                <Info icon={MapPin} label="Standort" value={d.locationCity} />
                <Info icon={Clock} label="Kosten" value="100 €/Tag" />
              </div>
              {d.status === "resting" && d.restUntil && <div className="text-xs text-amber-300 mt-1 flex items-center gap-1"><Coffee className="w-3 h-3" /> Erholung bis {formatGameTime(d.restUntil)}</div>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-wide text-amber-300/70 mb-2">Bewerber</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {state.availableApplicants.map(app => (
            <div key={app.id} className="bg-office-2/50 border border-wood/30 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-amber-100">{app.name}</div>
                <div className="text-xs text-amber-100/50">500 € einmalig · 100 €/Tag · Start in Hamburg</div>
              </div>
              <button onClick={() => hire(app)} disabled={busyId === app.id || state.company.accountCents < 50000 || openCompany}
                className="px-3 py-1.5 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 text-sm flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Einstellen
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { free: ["Frei", "bg-emerald-500/20 text-emerald-300"], on_trip: ["Unterwegs", "bg-amber-500/20 text-amber-300"], resting: ["Erholung", "bg-blue-500/20 text-blue-300"] };
  const [label, cls] = map[status] || [status, "bg-wood/30"];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
function Info({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-amber-100/70"><Icon className="w-3.5 h-3.5 text-amber-300/70" /> <span className="text-amber-100/50">{label}:</span> {value}</div>;
}