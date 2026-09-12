import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import StatusBadge from "@/components/ui/StatusBadge";
import { UserPlus, Users, MapPin, Clock, Coffee } from "lucide-react";

export default function Personnel() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);
  const openCompany = state.openCosts.some(o => o.account === "company");

  async function hire(app) {
    setBusyId(app.id);
    try { const r = await send("hireDriver", { applicantId: app.id }); showToast(`${app.name} eingestellt.`, "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Personal</h1>
        <p className="text-sm text-muted-foreground mt-1">{state.drivers.length} Fahrer · 100 €/Tag · Einstellung 500 € einmalig.</p>
      </div>
      {openCompany && <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-4 py-2.5">Bei offenen betrieblichen Kosten ist keine Einstellung möglich.</div>}

      <div>
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Angestellte Fahrer</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {state.drivers.map(d => (
            <div key={d.id} className="glass border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium"><Users className="w-4 h-4 text-lime/70" /> {d.name}</div>
                <StatusBadge status={d.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                <Info icon={MapPin} label="Standort" value={d.locationCity} />
                <Info icon={Clock} label="Kosten" value="100 €/Tag" />
              </div>
              {d.status === "resting" && d.restUntil && <div className="text-xs text-sky-300 mt-1 flex items-center gap-1"><Coffee className="w-3 h-3" /> Erholung bis {formatGameTime(d.restUntil)}</div>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Bewerber</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {state.availableApplicants.map(app => (
            <div key={app.id} className="glass border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-foreground">{app.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">500 € einmalig · 100 €/Tag · Start in Hamburg</div>
              </div>
              <button onClick={() => hire(app)} disabled={busyId === app.id || state.company.accountCents < 50000 || openCompany}
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95">
                {busyId === app.id ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" /> Einstellen</>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5 text-foreground/40" /> <span className="text-muted-foreground/60">{label}:</span> <span className="text-foreground/80">{value}</span></div>;
}