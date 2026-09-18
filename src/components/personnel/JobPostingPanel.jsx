import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import Drawer from "@/components/ui/Drawer";
import { Plus, X, Check, Clock, Users } from "lucide-react";

const ROLE_OPTIONS = [
  { id: "driver", label: "Fahrer" },
  { id: "dispatcher", label: "Disponent" },
  { id: "dispatcher_senior", label: "Erfahrener Disponent" },
  { id: "mechanic", label: "Werkstattmitarbeiter" },
  { id: "cleaner", label: "Reinigungskraft" },
  { id: "accountant", label: "Buchhalter/Buchhalterin" },
  { id: "accountant_senior", label: "Erfahrene Buchhaltungskraft" },
  { id: "assistant", label: "Assistent der Geschäftsführung" },
  { id: "branch_manager", label: "Filialleiter" },
];

// Panel für Stellen-Ausschreibungen im Personalmarkt (Auftrag 29).
export default function JobPostingPanel({ open, onClose, prefill }) {
  const { state, send, showToast } = useGame();
  const [role, setRole] = useState(prefill?.role || "driver");
  const [locationCity, setLocationCity] = useState(prefill?.locationCity || "Hamburg");
  const [count, setCount] = useState(1);
  const [earliestStartMin, setEarliestStartMin] = useState(state.gameTime);
  const [busy, setBusy] = useState(false);

  // Wenn prefill sich ändert, Felder aktualisieren
  React.useEffect(() => {
    if (prefill) {
      if (prefill.role) setRole(prefill.role);
      if (prefill.locationCity) setLocationCity(prefill.locationCity);
    }
  }, [prefill]);

  const branchCities = (state.branches || []).map(b => b.city);

  async function handlePost() {
    setBusy(true);
    try {
      await send("postJob", { role, locationCity, count, earliestStartMin });
      showToast(`Stelle als ${roleLabel(role)} ausgeschrieben.`, "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(postingId) {
    try {
      await send("closeJobPosting", { postingId });
      showToast("Stellenanzeige geschlossen.", "info");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const postings = (state.personnelMarket?.postings || []).filter(p => p.status === "open");

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Stelle ausschreiben"
      kicker="Personalmarkt"
      maxWidth="max-w-md"
    >
      <div className="space-y-5">
        {/* Bestehende Ausschreibungen */}
        {postings.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Offene Ausschreibungen</h3>
            <div className="space-y-2">
              {postings.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-surface-2/50 border border-white/5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{roleLabel(p.role)} in {p.locationCity}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {p.remaining}/{p.count} offen</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ab {formatGameTime(p.earliestStartMin)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleClose(p.id)}
                    className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-coral border border-white/10 hover:border-coral/30 transition"
                    aria-label="Anzeige schließen"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Neue Ausschreibung */}
        <div className="pt-2 border-t border-white/5">
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Neue Stelle ausschreiben</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Rolle</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full rounded-lg bg-surface-2/50 border border-white/10 text-sm px-3 py-2.5 focus:outline-none focus:border-lime/30"
              >
                {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Standort</label>
              <select
                value={locationCity}
                onChange={e => setLocationCity(e.target.value)}
                className="w-full rounded-lg bg-surface-2/50 border border-white/10 text-sm px-3 py-2.5 focus:outline-none focus:border-lime/30"
              >
                {branchCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Anzahl Stellen</label>
              <input
                type="number"
                min="1"
                max="10"
                value={count}
                onChange={e => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-full rounded-lg bg-surface-2/50 border border-white/10 text-sm px-3 py-2.5 focus:outline-none focus:border-lime/30"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Frühester Beginn</label>
              <div className="text-sm text-foreground/80 p-2.5 rounded-lg bg-surface-2/30 border border-white/5">
                {formatGameTime(earliestStartMin)}
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-1">
                Standard-Bewerber in Hamburg können ab sofort eingestellt werden.
              </div>
            </div>

            <div className="p-3 rounded-lg bg-lime/5 border border-lime/10 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-lime mb-1">
                <Check className="w-3.5 h-3.5" /> Kostenlos
              </div>
              Eine interne Stellenausschreibung ist kostenlos. Sie erhöht den Zielbestand für diese Rolle und löst eine bedarfsbezogene Marktwelle aus.
            </div>

            <button
              onClick={handlePost}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-3 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
            >
              {busy ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Plus className="w-4 h-4" /> Stelle ausschreiben</>}
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}