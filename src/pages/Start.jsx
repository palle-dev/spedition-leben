import React, { useState, useEffect, useRef } from "react";
import { useGame } from "@/lib/gameContext";
import { Plus, Play, Upload, FolderOpen } from "lucide-react";
import FernwerkLogo from "@/components/brand/FernwerkLogo";

const OFFICE_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/af8b503ab_office_cinematic.png";

export default function StartScreen() {
  const { newGame, listSlots, loadSlot, importGame, busy, showToast } = useGame();
  const [slots, setSlots] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [names, setNames] = useState({ companyName: "", playerName: "", partnerName: "Mara" });
  const fileRef = useRef(null);

  useEffect(() => {
    listSlots().then(setSlots).catch(() => {});
  }, [listSlots]);

  async function create() {
    try {
      await newGame({
        companyName: names.companyName || "Nordlicht Transport GmbH",
        playerName: names.playerName || "Spielerin",
        partnerName: names.partnerName || "Mara"
      });
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleLoad(name) {
    const r = await loadSlot(name);
    if (!r.ok) showToast(r.error, "error");
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const r = await importGame(reader.result);
      if (!r.ok) showToast(r.error, "error");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const fmt = (savedAt) => savedAt
    ? new Date(savedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div className="fixed inset-0 z-0 overflow-hidden">
        <img src={OFFICE_URL} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
        <div className="absolute inset-0 shade-office" />
      </div>

      <div className="relative z-10 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <FernwerkLogo size={48} showWord={false} />
          </div>
          <h1 className="text-3xl font-bold tracking-[0.08em] uppercase text-foreground">FERNWERK</h1>
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground mt-2">Dein Unternehmen. Dein Leben. Dein Weg.</p>
          <p className="text-muted-foreground mt-3 text-sm max-w-xs mx-auto">Die Wirtschaftssimulation über Transport, Unternehmertum und das Leben dahinter.</p>
        </div>

        {slots.length > 0 && !showForm && (
          <div className="space-y-2 mb-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Spielstand laden</h2>
            {slots.map((s) => (
              <button key={s.name} onClick={() => handleLoad(s.name)}
                className="w-full text-left px-4 py-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{fmt(s.savedAt)}</div>
                </div>
                <Play className="w-4 h-4 text-lime" />
              </button>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full text-left px-4 py-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition flex items-center gap-3"
            >
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Save-Datei importieren</span>
            </button>
          </div>
        )}

        {showForm ? (
          <div className="glass border border-white/15 rounded-2xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Neue Spedition gründen</h2>
            <Field label="Firmenname" value={names.companyName} onChange={(v) => setNames({ ...names, companyName: v })} placeholder="Nordlicht Transport GmbH" />
            <Field label="Dein Name" value={names.playerName} onChange={(v) => setNames({ ...names, playerName: v })} placeholder="Spielerin" />
            <Field label="Name der Partnerin / des Partners" value={names.partnerName} onChange={(v) => setNames({ ...names, partnerName: v })} placeholder="Mara" />
            <div className="flex gap-2">
              <button onClick={create} disabled={busy} className="flex-1 px-4 py-2.5 rounded-lg bg-lime text-ink hover:brightness-110 disabled:opacity-50 font-semibold transition active:scale-[0.98]">Gründen</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition">Abbrechen</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-white/20 hover:border-lime/40 hover:bg-lime/5 transition flex items-center justify-center gap-2 text-foreground">
            <Plus className="w-5 h-5" /> Neues Spiel beginnen
          </button>
        )}

        {slots.length === 0 && !showForm && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" /> Save-Datei importieren
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />

        <p className="text-xs text-muted-foreground/50 mt-6 text-center">
          Start: Hamburg · 75.000 € Firma · 7.500 € Privat · 3 Lkw · 3 Fahrer · 8 Angebote
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 focus:border-lime/50 outline-none text-foreground" />
    </label>
  );
}