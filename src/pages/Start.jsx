import { flushSync } from "react-dom";
import React, { useState, useEffect, useRef } from "react";
import { useGame } from "@/lib/gameContext";
import { Plus, Play, Upload, LogOut, Check, Cloud, Loader2 } from "lucide-react";
import ScenarioPicker from "@/components/scenarios/ScenarioPicker";
import FrachtfieberLogo from "@/components/brand/FrachtfieberLogo";
import FrachtfieberMobileSignet from "@/components/brand/FrachtfieberMobileSignet";
import { base44 } from "@/api/base44Client";
import { DIFFICULTY_PROFILES, DEFAULT_PROFILE_ID } from "@/lib/simulation/difficultyProfiles";
import { HELP_OPTIONS, DEFAULT_HELP_SETTINGS } from "@/lib/simulation/helpSettings";

const OFFICE_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/af8b503ab_office_cinematic.png";

export default function StartScreen() {
  const { state, newGame, listSlots, loadSlot, loadAutosaveSlot, autosaveMetas, importGame, busy, showToast, dismissStart, cloudSaves, cloudLoading, loadCloudGame, refreshCloudSaves } = useGame();
  const [slots, setSlots] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const [names, setNames] = useState({ companyName: "", playerName: "", partnerName: "Mara" });
  const [withOnboarding, setWithOnboarding] = useState(true);
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [helpSettings, setHelpSettings] = useState({ ...DEFAULT_HELP_SETTINGS });
  const fileRef = useRef(null);
  const loadLock = useRef(false);
  const [loadLabel,setLoadLabel]=useState("");
  const [loadError,setLoadError]=useState("");
  const [takingLonger,setTakingLonger]=useState(false);
  useEffect(()=>{
    if(!loadLabel)return;
    const timer=setTimeout(()=>setTakingLonger(true),8000);
    return ()=>clearTimeout(timer);
  },[loadLabel]);
  async function runLoad(label,operation){
    if(loadLock.current || busy)return;
    loadLock.current=true;
    flushSync(()=>{setLoadLabel(label);setLoadError("");setTakingLonger(false);});
    try{
      // Give the browser a paint before parsing/migrating a large save.
      await new Promise(resolve=>setTimeout(resolve,40));
      const result=await operation();
      if(result?.ok===false || result?.skipped)throw Error(result.error||"Der Ladevorgang wurde unterbrochen. Bitte erneut versuchen.");
    }catch(error){setLoadError(error.message||"Der Spielstand konnte nicht geladen werden.");}
    finally{loadLock.current=false;setLoadLabel("");}
  }

  useEffect(() => {
    Promise.all([listSlots(false), listSlots(true)]).then(([free, scenarios]) => {
      setSlots([...free.map(s => ({ ...s, isScenario: false })), ...scenarios.map(s => ({ ...s, isScenario: true }))].sort((a, b) => b.savedAt - a.savedAt));
    }).catch(() => {});
    refreshCloudSaves();
  }, [listSlots, refreshCloudSaves]);

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

  function handleLoad(name,isScenario){
    return runLoad(name,()=>loadSlot(name,isScenario));
  }
  function handleLoadAutosave(index){
    return runLoad("Automatische Sicherung · Slot "+(index+1),()=>loadAutosaveSlot(index));
  }
  function handleLoadCloud(id){
    const entry=cloudSaves.find(s=>s.id===id);
    return runLoad(entry?.save_label||entry?.company_name||"Cloud-Spielstand",()=>loadCloudGame(id));
  }
  function handleFile(e){
    const file=e.target.files?.[0];e.target.value="";
    if(file)void runLoad(file.name,async()=>importGame(await file.text()));
  }

  const fmt = (savedAt) => savedAt
    ? new Date(savedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      {loadLabel&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/90 backdrop-blur-sm p-6" role="status" aria-live="polite" aria-atomic="true">
        <div className="max-w-sm w-full rounded-3xl border border-lime/25 bg-slate-900 p-8 text-center shadow-2xl">
          <Loader2 className="w-10 h-10 animate-spin motion-reduce:animate-none text-lime mx-auto mb-5" aria-hidden="true"/>
          <h1 className="text-xl font-semibold text-white">Spielstand wird geladen …</h1>
          <p className="mt-3 text-sm text-lime break-words">{loadLabel}</p>
          <p className="mt-4 text-sm text-slate-300">{takingLonger?"Das Laden dauert etwas länger. Dein Spielstand wird weiterhin vorbereitet.":"Deine Spedition wird vorbereitet. Bitte kurz warten."}</p>
        </div>
      </div>}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <img src={OFFICE_URL} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        <div className="absolute inset-0 shade-office" />
      </div>

      <button
        disabled={!!loadLabel||busy} onClick={() => base44.auth.logout("/login")}
        className="fixed top-4 right-4 z-20 w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-coral transition"
        aria-label="Abmelden"
        title="Abmelden"
      >
        <LogOut className="w-4 h-4" />
      </button>

      <fieldset disabled={!!loadLabel||busy} aria-busy={!!loadLabel} className="relative z-10 max-w-lg w-full min-w-0">
        {loadError&&<p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-950 p-4 text-sm text-red-100">{loadError} Du kannst den Spielstand erneut auswählen.</p>}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <FrachtfieberMobileSignet size={56} className="sm:hidden" />
            <FrachtfieberLogo size={52} showWord={false} className="hidden sm:block" />
          </div>
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground mt-3">Kleine Firma. Große Pläne.</p>
          <p className="text-muted-foreground mt-3 text-sm max-w-xs mx-auto">Baue deine Spedition auf, führe dein Team und finde deinen eigenen Weg zwischen Geschäft und Privatleben.</p>
        </div>

        {state && !showForm && !showScenarios && (
          <button
            onClick={dismissStart}
            className="w-full mb-4 px-4 py-3.5 rounded-xl bg-lime text-ink font-semibold hover:brightness-110 transition active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_0_20px_-4px_hsl(var(--lime)/0.4)]"
          >
            <Play className="w-5 h-5" /> Weiter spielen
          </button>
        )}

        {!showForm && !showScenarios && (slots.length > 0 || autosaveMetas.some(m => m)) && (
          <div className="space-y-2 mb-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Spielstand laden</h2>
            {slots.map((s) => (
              <button key={(s.isScenario ? "scenario:" : "free:") + s.name} onClick={() => handleLoad(s.name, s.isScenario)}
                className="w-full text-left px-4 py-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.isScenario ? "Szenario" : "Freies Spiel"} · {fmt(s.savedAt)}</div>
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

        {!showForm && !showScenarios && (cloudLoading || cloudSaves.length > 0) && (
          <div className="space-y-2 mb-4">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5" /> Cloud-Spielstände
            </h2>
            {cloudLoading && (
              <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-lime/20 bg-slate-950/60 p-4 text-sm"><Loader2 className="w-5 h-5 animate-spin text-lime shrink-0" />Cloud-Spielstände werden geladen …</div>
            )}
            {cloudSaves.map((s) => (
              <button key={s.id} onClick={() => handleLoadCloud(s.id)}
                className="w-full text-left px-4 py-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{s.save_label || s.company_name || "Unbenannter Stand"}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.company_name ? s.company_name + " · " : ""}Tag {s.game_day ?? "—"}
                    {s.cloud_saved_at ? " · " + fmt(s.cloud_saved_at) : ""}
                  </div>
                </div>
                <Play className="w-4 h-4 text-lime" />
              </button>
            ))}
          </div>
        )}

        {showScenarios ? <ScenarioPicker onClose={() => setShowScenarios(false)} /> : showForm ? (
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

        {!showForm && !showScenarios && slots.length === 0 && !autosaveMetas.some(m => m) && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full mt-2 px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" /> Save-Datei importieren
          </button>
        )}
        {!showForm && !showScenarios && (
          <button onClick={() => setShowScenarios(true)} disabled={busy} className="w-full mt-3 px-4 py-3 rounded-xl border border-lime/30 bg-lime/5 hover:bg-lime/10 text-lime font-medium transition disabled:opacity-50">
            Ein Szenario spielen · 3 Herausforderungen
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />

        {!showScenarios && <p className="text-xs text-muted-foreground/50 mt-6 text-center">
          Start: Hamburg · {(DIFFICULTY_PROFILES.find(p => p.id === profileId)?.startCapitalCents / 100).toLocaleString("de-DE")} € Firma · {(DIFFICULTY_PROFILES.find(p => p.id === profileId)?.privateCapitalCents / 100).toLocaleString("de-DE")} € Privat · 3 Lkw · 3 Fahrer
        </p>}
      </fieldset>
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
