import React, { useState, useEffect, useRef } from "react";
import { useGame } from "@/lib/gameContext";
import { Plus, Play, Upload, FolderOpen, LogOut, Check } from "lucide-react";
import FernwerkLogo from "@/components/brand/FernwerkLogo";
import { base44 } from "@/api/base44Client";
import { DIFFICULTY_PROFILES, DEFAULT_PROFILE_ID } from "@/lib/simulation/difficultyProfiles";
import { HELP_OPTIONS, DEFAULT_HELP_SETTINGS } from "@/lib/simulation/helpSettings";

const OFFICE_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/af8b503ab_office_cinematic.png";

export default function StartScreen() {
  const { state, newGame, listSlots, loadSlot, loadAutosaveSlot, autosaveMetas, importGame, busy, showToast, dismissStart } = useGame();
  const [slots, setSlots] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [names, setNames] = useState({ companyName: "", playerName: "", partnerName: "Mara" });
  const [withOnboarding, setWithOnboarding] = useState(true);
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [helpSettings, setHelpSettings] = useState({ ...DEFAULT_HELP_SETTINGS });
  const fileRef = useRef(null);

  useEffect(() => {
    listSlots().then(setSlots).catch(() => {});
  }, [listSlots]);

  async function create() {
    try {
      await newGame({
        companyName: names.companyName || "Nordlicht Transport GmbH",
        playerName: names.playerName || "Spielerin",
        partnerName: names.partnerName || "Mara",
        onboarding: withOnboarding,
        difficultyProfileId: profileId,
        helpSettings,
      });
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleLoad(name) {
    const r = await loadSlot(name);
    if (!r.ok) showToast(r.error, "error");
  }

  async function handleLoadAutosave(index) {
    const r = await loadAutosaveSlot(index);
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

      <button
        onClick={() => base44.auth.logout("/login")}
        className="fixed top-4 right-4 z-20 w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-coral transition"
        aria-label="Abmelden"
        title="Abmelden"
      >
        <LogOut className="w-4 h-4" />
      </button>

      <div className="relative z-10 max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <FernwerkLogo size={48} showWord={false} />
          </div>
          <h1 className="text-3xl font-bold tracking-[0.08em] uppercase text-foreground">FERNWERK</h1>
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground mt-2">Dein Unternehmen. Dein Leben. Dein Weg.</p>
          <p className="text-muted-foreground mt-3 text-sm max-w-xs mx-auto">Die Wirtschaftssimulation über Transport, Unternehmertum und das Leben dahinter.</p>
        </div>

        {state && !showForm && (
          <button
            onClick={dismissStart}
            className="w-full mb-4 px-4 py-3.5 rounded-xl bg-lime text-ink font-semibold hover:brightness-110 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_20px_-4px_hsl(var(--lime)/0.4)]"
          >
            <Play className="w-5 h-5" /> Weiter spielen
          </button>
        )}

        {!showForm && (slots.length > 0 || autosaveMetas.some(m => m)) && (
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
            {autosaveMetas.map((m, i) => m && (
              <button key={"auto" + i} onClick={() => handleLoadAutosave(i)}
                className="w-full text-left px-4 py-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">Automatisch · Slot {i + 1}</div>
                  <div className="text-xs text-muted-foreground">{fmt(m.savedAt)}</div>
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
            <div>
              <span className="text-xs text-muted-foreground">Einstieg</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setWithOnboarding(true)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition ${withOnboarding ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20"}`}>
                  <div className="text-sm font-medium">Mit Begleitung</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Geführter Einstieg in 5 Schritten</div>
                </button>
                <button type="button" onClick={() => setWithOnboarding(false)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition ${!withOnboarding ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20"}`}>
                  <div className="text-sm font-medium">Frei spielen</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Ohne Anleitung entdecken</div>
                </button>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Schwierigkeit</span>
              <div className="mt-1.5 space-y-2">
                {DIFFICULTY_PROFILES.map(p => (
                  <button key={p.id} type="button" onClick={() => setProfileId(p.id)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-left transition flex items-start gap-2.5 ${profileId === p.id ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20"}`}>
                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 grid place-items-center ${profileId === p.id ? "border-lime bg-lime" : "border-white/20"}`}>
                      {profileId === p.id && <Check className="w-3 h-3 text-ink" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{p.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Einstiegshilfen (optional)</span>
              <div className="mt-1.5 space-y-1.5">
                {HELP_OPTIONS.map(opt => (
                  <label key={opt.id} className="flex items-start gap-2.5 cursor-pointer">
                    <button type="button" onClick={() => setHelpSettings(s => ({ ...s, [opt.id]: !s[opt.id] }))}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 grid place-items-center transition ${helpSettings[opt.id] ? "border-lime bg-lime" : "border-white/20"}`}>
                      {helpSettings[opt.id] && <Check className="w-3 h-3 text-ink" />}
                    </button>
                    <div>
                      <div className="text-xs font-medium">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
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

        {!showForm && slots.length === 0 && !autosaveMetas.some(m => m) && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" /> Save-Datei importieren
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />

        <p className="text-xs text-muted-foreground/50 mt-6 text-center">
          Start: Hamburg · {(DIFFICULTY_PROFILES.find(p => p.id === profileId)?.startCapitalCents / 100).toLocaleString("de-DE")} € Firma · {(DIFFICULTY_PROFILES.find(p => p.id === profileId)?.privateCapitalCents / 100).toLocaleString("de-DE")} € Privat · 3 Lkw · 3 Fahrer · 8 Angebote
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