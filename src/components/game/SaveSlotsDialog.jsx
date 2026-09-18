import React, { useState, useEffect, useCallback, useRef } from "react";
import { useGame } from "@/lib/gameContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, FolderOpen, Trash2, Download, Upload, Loader2, History, HardDrive, X, AlertTriangle } from "lucide-react";
import CloudSyncSection from "@/components/game/CloudSyncSection";

// Spielstände-Dialog: manuelle Slots sichern/laden, Autosaves laden,
// Export als Datei und Import.
export default function SaveSlotsDialog({ open, onOpenChange }) {
  const {
    state, saveSlot, loadSlot, deleteSlot, listSlots,
    loadAutosaveSlot, autosaveMetas, exportGame, importGame,
    deleteAutosaveSlot, deleteCurrentGame, deleteAllSaves,
  } = useGame();
  const [slots, setSlots] = useState([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const fileRef = useRef(null);
  const loadLock=useRef(false);
  async function runLoad(label,operation){
    if(loadLock.current||busy)return;
    loadLock.current=true;setBusy(label);setError(null);
    try{await new Promise(resolve=>setTimeout(resolve,40));const r=await operation();if(!r?.ok)throw Error(r?.error||"Laden fehlgeschlagen.");onOpenChange(false);}
    catch(e){setError(e.message);}
    finally{loadLock.current=false;setBusy(null);}
  }

  const refresh = useCallback(async () => {
    const list = await listSlots();
    setSlots(list);
  }, [listSlots]);

  useEffect(() => { if (open) { refresh(); setError(null); } }, [open, refresh]);

  const fmt = (savedAt) => savedAt
    ? new Date(savedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) { setError("Bitte einen Namen eingeben."); return; }
    setBusy("saving"); setError(null);
    const r = await saveSlot(name);
    setBusy(null);
    if (r.ok) { setNewName(""); refresh(); }
    else setError(r.error);
  };

  const handleLoad = name => runLoad("load:"+name,()=>loadSlot(name));

  const handleDelete = async (name) => {
    setBusy("del:" + name); setError(null);
    await deleteSlot(name);
    setBusy(null);
    refresh();
  };

  const handleLoadAutosave = i => runLoad("auto:"+i,()=>loadAutosaveSlot(i));

  const handleExport = () => {
    const data = exportGame();
    if (!data) return;
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fernwerk_${(state?.gameTime || 0)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy("importing"); setError(null);
      const r = await importGame(reader.result);
      setBusy(null);
      if (r.ok) onOpenChange(false);
      else setError(r.error);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleConfirmDelete = (action) => setConfirmAction(action);

  const handleConfirmYes = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "current") {
      setBusy("delCurrent"); setError(null);
      const r = await deleteCurrentGame();
      setBusy(null);
      if (r.ok) onOpenChange(false);
      else setError(r.error);
    } else if (action === "all") {
      setBusy("delAll"); setError(null);
      const r = await deleteAllSaves();
      setBusy(null);
      if (r.ok) onOpenChange(false);
      else setError(r.error);
    } else if (action.startsWith("auto:")) {
      const i = parseInt(action.split(":")[1]);
      setBusy("delAuto:" + i); setError(null);
      await deleteAutosaveSlot(i);
      setBusy(null);
      refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={value=>{if(!loadLock.current)onOpenChange(value);}}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-surface border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><HardDrive className="w-5 h-5 text-lime" /> Spielstände</DialogTitle>
          <DialogDescription>Sichern und laden Sie Ihren Stand manuell — ergänzend zu den automatischen Sicherungen.</DialogDescription>
        </DialogHeader>

        {(busy?.startsWith("load:")||busy?.startsWith("auto:"))&&<div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-lime/30 bg-lime/10 p-4 text-sm"><Loader2 className="w-5 h-5 animate-spin shrink-0"/>Spielstand wird geladen … Bitte warten.</div>}
        {error && (
          <div className="text-sm text-destructive-foreground bg-destructive/15 border border-destructive/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Neuer Spielstand */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Neuer Spielstand</div>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="z. B. vor Großauftrag"
              aria-label="Name des neuen Spielstands"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="bg-ink/50 border-white/10"
            />
            <Button onClick={handleSave} disabled={!!busy} className="shrink-0 bg-lime text-ink hover:bg-lime/90">
              {busy === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Sichern
            </Button>
          </div>
        </div>

        {/* Gespeicherte Slots */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Gespeicherte Stände {slots.length > 0 && `(${slots.length})`}
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">Noch keine manuellen Spielstände.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {slots.map((s) => (
                <div key={s.name} className="flex items-center gap-2 rounded-lg border border-white/10 bg-ink/40 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">{fmt(s.savedAt)}</div>
                  </div>
                  <Button size="sm" variant="ghost" aria-label={`Spielstand „${s.name}“ laden`} title={`Spielstand „${s.name}“ laden`} onClick={() => handleLoad(s.name)} disabled={!!busy} className="h-8 px-2 text-lime hover:text-lime hover:bg-lime/10">
                    {busy === "load:" + s.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Spielstand „${s.name}“ löschen`} title={`Spielstand „${s.name}“ löschen`} onClick={() => handleDelete(s.name)} disabled={!!busy} className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    {busy === "del:" + s.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Autosaves */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" /> Automatische Sicherungen
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => {
              const meta = autosaveMetas?.[i] || null;
              return (
                <div key={i} className="relative rounded-lg border border-white/10 bg-ink/40 px-2 py-2 text-center">
                  <button
                    onClick={() => meta && handleLoadAutosave(i)}
                    disabled={!meta || !!busy}
                    className="w-full disabled:opacity-40 disabled:cursor-not-allowed transition hover:text-lime"
                  >
                    <div className="text-[11px] font-medium text-muted-foreground">Slot {i + 1}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {meta ? fmt(meta.savedAt).split(",")[0] : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70">
                      {meta ? fmt(meta.savedAt).split(",")[1]?.trim() : ""}
                    </div>
                    {busy === "auto:" + i && <Loader2 className="w-3 h-3 animate-spin mx-auto mt-1" />}
                  </button>
                  {meta && (
                    <button
                      onClick={() => handleConfirmDelete("auto:" + i)}
                      disabled={!!busy}
                      className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition disabled:opacity-30"
                      title="Sicherung löschen"
                      aria-label={`Automatische Sicherung ${i + 1} löschen`}
                    >
                      {busy === "delAuto:" + i ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cloud-Synchronisation */}
        <CloudSyncSection />

        {/* Export / Import */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Export / Import</div>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline" className="flex-1 border-white/10 bg-ink/40 hover:bg-ink/60">
              <Download className="w-4 h-4" /> Export
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={!!busy} variant="outline" className="flex-1 border-white/10 bg-ink/40 hover:bg-ink/60">
              {busy === "importing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Import
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Export speichert eine JSON-Datei mit Prüfsumme. Import lädt eine solche Datei und ersetzt den aktuellen Stand.
          </p>
        </div>

        {/* Gefahrenzone */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-destructive/80 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Gefahrenzone
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleConfirmDelete("current")}
              disabled={!!busy || !state}
              variant="outline"
              className="flex-1 border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {busy === "delCurrent" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Aktuellen Stand löschen
            </Button>
            <Button
              onClick={() => handleConfirmDelete("all")}
              disabled={!!busy}
              variant="outline"
              className="flex-1 border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {busy === "delAll" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Alles löschen
            </Button>
          </div>
        </div>

        {/* Bestätigung */}
        {confirmAction && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 space-y-2">
            <div className="text-sm text-destructive-foreground">
              {confirmAction === "current" && "Aktuellen Spielstand unwiderruflich löschen?"}
              {confirmAction === "all" && "Alle Spielstände (aktueller Stand, Autosaves, manuelle Slots) unwiderruflich löschen?"}
              {confirmAction.startsWith("auto:") && "Diese automatische Sicherung löschen?"}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmYes} size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Ja, löschen
              </Button>
              <Button onClick={() => setConfirmAction(null)} size="sm" variant="ghost">
                Abbrechen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}