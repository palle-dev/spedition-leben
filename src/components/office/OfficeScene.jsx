import React, { useState } from "react";
import { Link } from "react-router-dom";
import SceneHotspot from "@/components/scene/SceneHotspot";
import FleetYard from "@/components/office/FleetYard";
import { officeVariant, dayPhase, acceptedNotDispatched, pendingInvites } from "@/components/scene/sceneUtils";
import { formatGameTime } from "@/lib/gameData";
import { X } from "lucide-react";

// Interaktive 2D-Büroszene. Gegenstände sind bedienbare Zugänge zu den
// vorhandenen Fachansichten. Drei visuelle Varianten nach Fuhrparkgröße.
// Die Szene löst durch ihre Darstellung keine Spielbefehle aus.
export default function OfficeScene({ state }) {
  const variant = officeVariant(state.vehicles.length);
  const phase = dayPhase(state.gameTime);
  const offered = state.orders.filter((o) => o.status === "offered").length;
  const invites = pendingInvites(state);
  const openCosts = (state.openCosts || []).length;
  const and_ = acceptedNotDispatched(state);
  const upcoming = state.appointments.filter(
    (a) => ["accepted", "active"].includes(a.status) || (a.status === "pending" && a.appearMin <= state.gameTime)
  );
  const phoneItems = [
    ...(openCosts ? [{ label: "Offene Pflichtkosten", to: "/finanzen" }] : []),
    ...(and_.length ? [{ label: `${and_.length} Auftrag/-träge zu disponieren`, to: "/disposition" }] : []),
    ...(invites.length ? [{ label: "Private Einladung wartet", to: "/zuhause" }] : []),
  ];
  const phoneRings = phoneItems.length > 0;
  const [popover, setPopover] = useState(null);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-wood/40 shadow-xl bg-office"
      style={{ aspectRatio: "800 / 500" }}
    >
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1c2a44" />
            <stop offset="1" stopColor="#16203a" />
          </linearGradient>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a2a1c" />
            <stop offset="1" stopColor="#241710" />
          </linearGradient>
          <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6b4a2a" />
            <stop offset="1" stopColor="#4a3018" />
          </linearGradient>
          <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="800" height="360" fill="url(#wall)" />
        <rect x="0" y="360" width="800" height="140" fill="url(#floor)" />
        <line x1="0" y1="360" x2="800" y2="360" stroke="#0c1224" strokeWidth="2" />
        {/* Wandvertikale */}
        {[120, 300, 460, 620].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="360" stroke="#0c1224" strokeOpacity="0.25" strokeWidth="1" />
        ))}

        {/* Fenster */}
        <rect x="535" y="55" width="240" height="180" rx="6" fill="#0c1428" stroke="#6b4a2a" strokeWidth="6" />
        <line x1="655" y1="58" x2="655" y2="232" stroke="#6b4a2a" strokeWidth="3" />
        <line x1="538" y1="145" x2="772" y2="145" stroke="#6b4a2a" strokeWidth="3" />

        {/* Wandkarte */}
        <rect x="90" y="80" width="140" height="120" rx="4" fill="#23314f" stroke="#8a6a3a" strokeWidth="3" />
        <path d="M120 120 L160 100 L195 140 L130 160 Z" fill="none" stroke="#caa45a" strokeWidth="1.5" strokeDasharray="3 3" />
        {[[120,120],[160,100],[195,140],[130,160]].map(([cx,cy],i) => (
          <circle key={i} cx={cx} cy={cy} r="3" fill="#ffd98a" />
        ))}
        {variant !== "small" && (
          <rect x="92" y="178" width="136" height="18" fill="#1a263f" />
        )}

        {/* Kalender */}
        <rect x="250" y="80" width="95" height="120" rx="4" fill="#e8e0d0" stroke="#8a6a3a" strokeWidth="3" />
        <rect x="250" y="80" width="95" height="18" fill="#b8803a" />
        <line x1="258" y1="86" x2="258" y2="92" stroke="#e8e0d0" strokeWidth="2" />
        <line x1="337" y1="86" x2="337" y2="92" stroke="#e8e0d0" strokeWidth="2" />
        {[0,1,2,3].map((r) => [0,1,2].map((c) => (
          <rect key={`${r}-${c}`} x={256 + c * 28} y={104 + r * 22} width="22" height="16" rx="1" fill="none" stroke="#a88a5a" strokeWidth="0.8" />
        )))}

        {/* Aktenschrank / Personalmappe */}
        <rect x="380" y="200" width="110" height="200" rx="4" fill="url(#wood)" stroke="#3a2410" strokeWidth="2" />
        {[0,1,2].map((r) => (
          <g key={r}>
            <line x1="384" y1={250 + r * 50} x2="486" y2={250 + r * 50} stroke="#3a2410" strokeWidth="1.5" />
            <rect x="425" y={258 + r * 50} width="20" height="4" rx="2" fill="#caa45a" />
          </g>
        ))}

        {/* Schreibtisch */}
        <rect x="150" y="340" width="380" height="120" rx="6" fill="url(#wood)" stroke="#3a2410" strokeWidth="2" />
        <rect x="150" y="340" width="380" height="14" fill="#7a5a34" />
        <line x1="170" y1="362" x2="510" y2="362" stroke="#3a2410" strokeOpacity="0.4" />

        {/* Computer */}
        <rect x="200" y="250" width="150" height="95" rx="4" fill="#0c1428" stroke="#8a6a3a" strokeWidth="3" />
        <rect x="210" y="260" width="130" height="70" rx="2" fill="#1a3a5c" />
        <rect x="265" y="345" width="20" height="12" fill="#4a3018" />
        <rect x="250" y="355" width="50" height="6" rx="2" fill="#3a2410" />
        {variant !== "small" && (
          <rect x="350" y="270" width="70" height="70" rx="3" fill="#0c1428" stroke="#8a6a3a" strokeWidth="2.5" />
        )}

        {/* Telefon */}
        <rect x="370" y="300" width="70" height="48" rx="6" fill="#2a1d12" stroke="#8a6a3a" strokeWidth="2" />
        <circle cx="405" cy="324" r="10" fill="#3a2a1c" />
        <circle cx="405" cy="324" r="5" fill="#5a3a1a" />

        {/* Rechnungsmappe / Papierstapel */}
        <rect x="460" y="310" width="90" height="55" rx="2" fill="#e8e0d0" stroke="#a88a5a" strokeWidth="1" />
        <rect x="464" y="306" width="90" height="55" rx="2" fill="#f0e8d8" stroke="#a88a5a" strokeWidth="1" />
        {[322, 330, 338, 346].map((y) => (
          <line key={y} x1="470" y1={y} x2="540" y2={y} stroke="#a88a5a" strokeWidth="0.8" />
        ))}

        {/* Tür / Garderobe */}
        <rect x="20" y="180" width="55" height="260" rx="3" fill="#3a2410" stroke="#5a3a1a" strokeWidth="2" />
        <rect x="24" y="184" width="47" height="252" rx="2" fill="#2a1a0c" />
        <circle cx="64" cy="312" r="3.5" fill="#caa45a" />
        <rect x="30" y="200" width="35" height="50" rx="4" fill="#5a3a2a" />

        {variant === "large" && (
          <>
            <rect x="560" y="250" width="60" height="100" rx="4" fill="#3a5a3a" stroke="#2a3a1a" />
            <ellipse cx="590" cy="240" rx="40" ry="22" fill="#4a6a3a" />
            <rect x="120" y="250" width="40" height="90" rx="3" fill="#3a2410" />
            <rect x="128" y="258" width="24" height="14" rx="2" fill="#caa45a" />
          </>
        )}

        {/* Tageszeit-Tönung */}
        {phase === "morning" && <rect x="0" y="0" width="800" height="500" fill="#ffb86a" opacity="0.05" />}
        {phase === "evening" && <rect x="0" y="0" width="800" height="500" fill="#e8916b" opacity="0.07" />}
        {phase === "night" && (
          <>
            <rect x="0" y="0" width="800" height="500" fill="#0a0f1e" opacity="0.32" />
            <circle cx="275" cy="300" r="120" fill="url(#lampGlow)" />
          </>
        )}
      </svg>

      {/* Betriebshof im Fenster */}
      <div className="absolute" style={{ left: "67%", top: "11%", width: "30%", height: "36%" }}>
        <FleetYard vehicles={state.vehicles} gameTime={state.gameTime} />
      </div>

      {/* Hotspots */}
      <SceneHotspot to="/auftraege" label="Computer – Auftragsmarkt" hint={`${offered} Angebote`} badge={offered || null}
        style={{ left: "25%", top: "50%", width: "18.75%", height: "19%" }} />
      <SceneHotspot to="/disposition" label="Wandkarte – Disposition & Karte" hint="Touren planen"
        style={{ left: "11.25%", top: "16%", width: "17.5%", height: "24%" }} />
      <SceneHotspot onClick={() => setPopover(popover === "phone" ? null : "phone")}
        label="Telefon – Nachrichten" hint={phoneRings ? `${phoneItems.length} offene Nachricht(en)` : "Keine Nachrichten"}
        badge={phoneRings ? phoneItems.length : null} ringing={phoneRings}
        style={{ left: "46.25%", top: "60%", width: "8.75%", height: "9.6%" }} />
      <SceneHotspot to="/personal" label="Personalmappe – Personal" hint={`${state.drivers.length} Fahrer`}
        style={{ left: "47.5%", top: "40%", width: "13.75%", height: "40%" }} />
      <SceneHotspot to="/finanzen" label="Rechnungsmappe – Finanzen" hint={openCosts ? `${openCosts} offene Posten` : "Buchhaltung"} badge={openCosts || null}
        style={{ left: "57.5%", top: "62%", width: "11.25%", height: "11%" }} />
      <SceneHotspot to="/fuhrpark" label="Fenster – Betriebshof & Fuhrpark" hint={`${state.vehicles.length} Lkw`}
        style={{ left: "67%", top: "11%", width: "30%", height: "36%" }} />
      <SceneHotspot to="/zuhause" label="Tür – Zuhause" hint="Privatleben"
        style={{ left: "2.5%", top: "36%", width: "6.875%", height: "52%" }} />
      <SceneHotspot onClick={() => setPopover(popover === "calendar" ? null : "calendar")}
        label="Kalender – Termine" hint={upcoming.length ? `${upcoming.length} anstehend` : "Kalender"} badge={upcoming.length || null}
        style={{ left: "31.25%", top: "16%", width: "11.875%", height: "24%" }} />

      {popover === "phone" && (
        <Popover title="Telefon – Nachrichten" onClose={() => setPopover(null)} style={{ left: "46%", top: "70%" }}>
          {phoneItems.length === 0 ? (
            <p className="text-xs text-amber-100/50">Keine Nachrichten. Alles ruhig.</p>
          ) : (
            <ul className="space-y-1">
              {phoneItems.map((it, i) => (
                <li key={i}>
                  <Link to={it.to} className="block text-xs text-amber-100 hover:text-amber-300 underline-offset-2 hover:underline">
                    • {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
      {popover === "calendar" && (
        <Popover title="Kalender – Anstehende Termine" onClose={() => setPopover(null)} style={{ left: "31%", top: "40%" }}>
          {upcoming.length === 0 ? (
            <p className="text-xs text-amber-100/50">Keine anstehenden Termine.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.slice(0, 6).map((a) => (
                <li key={a.id} className="text-xs text-amber-100/80">
                  {formatGameTime(a.startMin)} – {calLabel(a)}
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

function calLabel(a) {
  if (a.type === "invitation") return "Freizeitabend (Einladung)";
  if (a.type === "invitation_ersatz") return "Freizeitabend (Ersatztermin)";
  if (a.type === "leisure") return a.label || "Freizeitaktivität";
  return a.text || "Termin";
}

function Popover({ title, onClose, style, children }) {
  return (
    <div className="absolute z-30 w-56 rounded-lg border border-wood/50 bg-office-2/95 backdrop-blur shadow-2xl p-3" style={style}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-amber-200">{title}</span>
        <button onClick={onClose} className="text-amber-100/60 hover:text-amber-50" aria-label="Schließen"><X className="w-3.5 h-3.5" /></button>
      </div>
      {children}
    </div>
  );
}