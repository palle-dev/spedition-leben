import React from "react";
import SceneHotspot from "@/components/scene/SceneHotspot";
import { dayPhase } from "@/components/scene/sceneUtils";
import { formatEuro } from "@/lib/gameData";

const WIN = {
  morning: { from: "#f4c98a", to: "#a9c9e6" },
  day: { from: "#86b6e6", to: "#cfe4f4" },
  evening: { from: "#e8916b", to: "#4a3a5e" },
  night: { from: "#16203a", to: "#0a0f1e" },
};

// Interaktive 2D-Wohnungsszene der frühen Karriere. Gegenstände öffnen
// die vorhandenen Privatfunktionen. Keine zusätzlichen Kosten oder Folgen.
export default function HomeScene({ state, onHotspot }) {
  const phase = dayPhase(state.gameTime);
  const p = state.private;
  const invites = state.appointments.filter((a) => a.status === "pending" && a.appearMin <= state.gameTime).length;
  const upcoming = state.appointments.filter((a) => ["accepted", "active"].includes(a.status)).length;
  const sky = WIN[phase];

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-wood/40 shadow-xl bg-office" style={{ aspectRatio: "800 / 500" }}>
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="hwall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2a2a" />
            <stop offset="1" stopColor="#2a1d1d" />
          </linearGradient>
          <linearGradient id="hfloor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a3a2a" />
            <stop offset="1" stopColor="#3a2418" />
          </linearGradient>
          <linearGradient id="hwood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7a5a3a" />
            <stop offset="1" stopColor="#5a3a1a" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="800" height="360" fill="url(#hwall)" />
        <rect x="0" y="360" width="800" height="140" fill="url(#hfloor)" />
        <line x1="0" y1="360" x2="800" y2="360" stroke="#1a0d08" strokeWidth="2" />

        {/* Fenster links */}
        <rect x="40" y="60" width="160" height="150" rx="5" fill="#0c1428" stroke="#7a5a3a" strokeWidth="5" />
        <linearGradient id="hsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.from} />
          <stop offset="1" stopColor={sky.to} />
        </linearGradient>
        <rect x="44" y="64" width="152" height="142" fill="url(#hsky)" />
        <line x1="120" y1="64" x2="120" y2="206" stroke="#7a5a3a" strokeWidth="2.5" />
        <line x1="44" y1="135" x2="196" y2="135" stroke="#7a5a3a" strokeWidth="2.5" />
        {phase === "night" && <circle cx="170" cy="95" r="8" fill="#e8e0d0" opacity="0.85" />}
        {phase === "day" && <circle cx="170" cy="95" r="11" fill="#fff3c4" opacity="0.85" />}

        {/* Kalender an der Wand */}
        <rect x="260" y="80" width="90" height="100" rx="3" fill="#e8e0d0" stroke="#8a6a3a" strokeWidth="2.5" />
        <rect x="260" y="80" width="90" height="16" fill="#b8803a" />
        {[0,1,2].map((r) => [0,1].map((c) => (
          <rect key={`${r}-${c}`} x={266 + c * 40} y={104 + r * 24} width="34" height="18" rx="1" fill="none" stroke="#a88a5a" strokeWidth="0.8" />
        )))}

        {/* Küchenzeile oben rechts */}
        <rect x="590" y="60" width="150" height="80" rx="3" fill="url(#hwood)" stroke="#3a2410" strokeWidth="2" />
        <rect x="600" y="68" width="55" height="40" rx="2" fill="#2a1d12" stroke="#8a6a3a" />
        <rect x="665" y="68" width="65" height="40" rx="2" fill="#3a2a1c" stroke="#8a6a3a" />
        <circle cx="697" cy="88" r="6" fill="#8a6a3a" />

        {/* Fotoecke */}
        <rect x="600" y="160" width="70" height="60" rx="3" fill="#5a3a1a" stroke="#3a2410" strokeWidth="2" />
        <rect x="608" y="168" width="54" height="44" rx="1" fill="#caa45a" />
        <path d="M620 200 L635 184 L648 196 L656 190 L660 200 Z" fill="#7a5a3a" />
        <circle cx="625" cy="180" r="4" fill="#7a5a3a" />

        {/* Briefe / Haushaltsmappe */}
        <rect x="680" y="160" width="80" height="60" rx="2" fill="#e8e0d0" stroke="#a88a5a" strokeWidth="1" />
        <rect x="686" y="156" width="80" height="60" rx="2" fill="#f0e8d8" stroke="#a88a5a" strokeWidth="1" />
        <line x1="692" y1="172" x2="760" y2="172" stroke="#a88a5a" strokeWidth="0.8" />
        <line x1="692" y1="180" x2="755" y2="180" stroke="#a88a5a" strokeWidth="0.8" />
        <line x1="692" y1="188" x2="748" y2="188" stroke="#a88a5a" strokeWidth="0.8" />

        {/* Sofa */}
        <rect x="120" y="330" width="260" height="110" rx="10" fill="#6a4a3a" stroke="#3a2410" strokeWidth="2" />
        <rect x="120" y="330" width="260" height="40" rx="10" fill="#7a5a44" />
        <rect x="130" y="370" width="80" height="55" rx="6" fill="#8a6a4a" />
        <rect x="220" y="370" width="80" height="55" rx="6" fill="#8a6a4a" />
        <rect x="310" y="370" width="60" height="55" rx="6" fill="#8a6a4a" />

        {/* Wohnzimmertisch */}
        <rect x="180" y="300" width="140" height="36" rx="4" fill="url(#hwood)" stroke="#3a2410" strokeWidth="2" />
        <circle cx="250" cy="318" r="6" fill="#caa45a" opacity="0.6" />

        {/* Esstisch mit Stühlen */}
        <rect x="440" y="330" width="220" height="100" rx="6" fill="url(#hwood)" stroke="#3a2410" strokeWidth="2" />
        <rect x="440" y="330" width="220" height="12" fill="#8a6a44" />
        <rect x="455" y="300" width="50" height="28" rx="4" fill="#5a3a2a" />
        <rect x="595" y="300" width="50" height="28" rx="4" fill="#5a3a2a" />
        <rect x="455" y="430" width="50" height="28" rx="4" fill="#5a3a2a" />
        <rect x="595" y="430" width="50" height="28" rx="4" fill="#5a3a2a" />

        {/* Garderobe / Tür */}
        <rect x="745" y="200" width="48" height="240" rx="3" fill="#3a2410" stroke="#5a3a1a" strokeWidth="2" />
        <rect x="749" y="204" width="40" height="232" rx="2" fill="#2a1a0c" />
        <circle cx="752" cy="320" r="3" fill="#caa45a" />
        <rect x="752" y="220" width="36" height="40" rx="4" fill="#5a3a2a" />

        {phase === "night" && <rect x="0" y="0" width="800" height="500" fill="#0a0f1e" opacity="0.22" />}
        {phase === "evening" && <rect x="0" y="0" width="800" height="500" fill="#e8916b" opacity="0.06" />}
      </svg>

      <SceneHotspot onClick={() => onHotspot("leisure")} label="Sofa – Freizeit" hint="Spaziergang"
        style={{ left: "15%", top: "66%", width: "32.5%", height: "22%" }} />
      <SceneHotspot onClick={() => onHotspot("invitation")} label="Esstisch – Gemeinsamer Abend" hint={invites ? `${invites} Einladung offen` : "Keine Einladung"} badge={invites || null} ringing={invites > 0}
        style={{ left: "55%", top: "66%", width: "27.5%", height: "20%" }} />
      <SceneHotspot onClick={() => onHotspot("calendar")} label="Kalender – Termine" hint={upcoming ? `${upcoming} anstehend` : "Kalender"}
        style={{ left: "32.5%", top: "16%", width: "11.25%", height: "20%" }} />
      <SceneHotspot onClick={() => onHotspot("vitals")} label="Fotoecke – Beziehung" hint={`${p.relationship}/100`}
        style={{ left: "75%", top: "32%", width: "8.75%", height: "12%" }} />
      <SceneHotspot onClick={() => onHotspot("account")} label="Briefe – Privatkonto & Haushalt" hint={formatEuro(p.accountCents)}
        style={{ left: "85%", top: "32%", width: "10%", height: "12%" }} />
      <SceneHotspot to="/" label="Garderobe – Zurück ins Büro" hint="Büro"
        style={{ left: "93.1%", top: "40%", width: "6%", height: "48%" }} />
    </div>
  );
}