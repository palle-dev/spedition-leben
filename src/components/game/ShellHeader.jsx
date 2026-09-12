import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import MoneyText from "@/components/MoneyText";
import { Building2, Heart, Sparkles } from "lucide-react";

// Obere Statusleiste: Marke, Welt-Umschaltung, beide Konten, Bewegungs-Toggle.
export default function ShellHeader() {
  const { state, motionEnabled, toggleMotion } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/zuhause";

  return (
    <header className="relative z-20 flex items-center gap-4 lg:gap-8 px-4 lg:px-12 h-16 lg:h-[88px] border-b border-white/10 backdrop-blur-md bg-ink/40">
      {/* Marke */}
      <div className="flex items-center gap-2.5 lg:gap-3 shrink-0">
        <div className="w-9 h-10 lg:w-10 lg:h-11 grid place-items-center rounded-xl border border-lime/40 bg-lime/5">
          <Building2 className="w-5 h-5 text-lime" />
        </div>
        <div className="hidden sm:block">
          <div className="text-[13px] font-semibold tracking-[0.1em] leading-tight">SPEDITION & LEBEN</div>
          <div className="text-[9px] tracking-[0.2em] text-muted-foreground mt-0.5">{state.company.name}</div>
        </div>
      </div>

      {/* Welt-Umschaltung */}
      <div className="flex items-center bg-ink/60 border border-white/10 rounded-full p-1 gap-1 backdrop-blur-lg">
        <button
          onClick={() => navigate("/")}
          className={`flex items-center gap-2 rounded-full px-3 lg:px-5 py-2 text-xs lg:text-[13px] font-medium transition ${!isHome ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"}`}
          aria-pressed={!isHome}
        >
          <Building2 className="w-4 h-4" /> <span className="hidden sm:inline">Unternehmen</span>
        </button>
        <button
          onClick={() => navigate("/zuhause")}
          className={`flex items-center gap-2 rounded-full px-3 lg:px-5 py-2 text-xs lg:text-[13px] font-medium transition ${isHome ? "bg-coral text-ink" : "text-muted-foreground hover:text-foreground"}`}
          aria-pressed={isHome}
        >
          <Heart className="w-4 h-4" /> <span className="hidden sm:inline">Privatleben</span>
        </button>
      </div>

      {/* Konten */}
      <div className="ml-auto flex items-center gap-3 lg:gap-7">
        <button onClick={() => navigate("/finanzen")} className="text-left group" aria-label="Firmenkonto und Finanzen">
          <div className="text-[9px] lg:text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Firmenkonto</div>
          <MoneyText value={state.company.accountCents} className="text-sm lg:text-xl font-medium tracking-tight text-foreground group-hover:text-lime transition-colors" accentOnFlash="text-lime" />
        </button>
        <button onClick={() => navigate("/finanzen")} className="text-left group hidden sm:block" aria-label="Privatkonto und Haushalt">
          <div className="text-[9px] lg:text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Privatkonto</div>
          <MoneyText value={state.private.accountCents} className="text-sm lg:text-xl font-medium tracking-tight text-foreground group-hover:text-coral transition-colors" accentOnFlash="text-coral" />
        </button>
        <button
          onClick={toggleMotion}
          className="w-9 h-9 lg:w-10 lg:h-10 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
          aria-label={motionEnabled ? "Animationen ausschalten" : "Animationen einschalten"}
          aria-pressed={motionEnabled}
          title={motionEnabled ? "Bewegung reduzieren" : "Bewegung aktivieren"}
        >
          <Sparkles className={`w-4 h-4 ${motionEnabled ? "text-lime" : ""}`} />
        </button>
      </div>
    </header>
  );
}