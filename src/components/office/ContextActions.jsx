import React from "react";
import { Link } from "react-router-dom";
import { deriveContextActions } from "@/components/scene/sceneUtils";
import { ChevronRight, Compass } from "lucide-react";

const TONE = {
  amber: "border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20",
  red: "border-red-400/50 bg-red-500/10 hover:bg-red-500/20",
  blue: "border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20",
  emerald: "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/20",
  wood: "border-wood/50 bg-wood/20 hover:bg-wood/30",
  neutral: "border-wood/30 bg-office-2/40 hover:bg-office-2/60",
};

// Handlungsleiste: leitet aus dem echten Spielzustand die nächste,
// dringlichste Handlung ab. Empfehlungen, kein erzwungener Pfad.
export default function ContextActions({ state }) {
  const actions = deriveContextActions(state);
  return (
    <div className="bg-office-2/60 border border-wood/30 rounded-lg p-3 h-full flex flex-col">
      <div className="flex items-center gap-2 text-amber-200 text-sm font-medium mb-3">
        <Compass className="w-4 h-4" /> Nächste Handlung
      </div>
      <ul className="space-y-2 flex-1">
        {actions.map((a) => (
          <li key={a.id}>
            <Link to={a.to} className={`block border rounded-md px-3 py-2 transition ${TONE[a.tone]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-amber-50">{a.title}</span>
                <ChevronRight className="w-4 h-4 opacity-60 text-amber-100" />
              </div>
              <div className="text-xs text-amber-100/70 mt-0.5">{a.detail}</div>
            </Link>
          </li>
        ))}
      </ul>
      <details className="mt-3 group">
        <summary className="text-[11px] text-amber-300/70 cursor-pointer hover:text-amber-200 select-none list-none flex items-center gap-1">
          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition" /> Spielhilfe
        </summary>
        <ul className="text-[11px] text-amber-100/60 space-y-1 mt-2 pl-1">
          <li>Zeit läuft nur auf Befehl (1 Std / Nächstes Ereignis).</li>
          <li>Einsatzgrenze: 8 h, danach 12 h Erholung.</li>
          <li>Fahrerlohn & Standort werden täglich um Mitternacht gebucht.</li>
          <li>Private Entnahme 100 €/Tag, Lebenshaltung 30 €/Tag.</li>
        </ul>
      </details>
    </div>
  );
}