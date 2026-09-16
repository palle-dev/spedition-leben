import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import MoneyText from "@/components/MoneyText";
import FernwerkSignet from "@/components/brand/FernwerkSignet";
import SaveSlotsDialog from "@/components/game/SaveSlotsDialog";
import { Sparkles, Mail as MailIcon, Save, Loader2, HardDrive, HelpCircle, LogOut } from "lucide-react";
import HelpPanel from "@/components/help/HelpPanel";
import { getMailboxStats } from "@/lib/mailData";
import { useHeaderSlot } from "@/lib/headerSlot";
import WorldSwitch from "@/components/game/WorldSwitch";
import { base44 } from "@/api/base44Client";

// Obere Statusleiste: FERNWERK-Marke, Welt-Umschaltung, beide Konten, Bewegungs-Toggle.
export default function ShellHeader() {
  const { state, motionEnabled, toggleMotion, dirty, save, saving } = useGame();
  const { slot } = useHeaderSlot();
  const navigate = useNavigate();
  const location = useLocation();
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const mailStats = state?.mail ? getMailboxStats(state) : null;
  const unreadCount = mailStats?.unread || 0;

  return (
    <header className="relative z-20 flex items-center gap-2 lg:gap-3 px-4 lg:px-6 h-14 lg:h-16 border-b border-white/10 backdrop-blur-md bg-ink/60 shrink-0">
      {/* Marke */}
      <button onClick={() => navigate("/")} className="flex items-center gap-2.5 shrink-0" aria-label="FERNWERK – zum Büro">
        <FernwerkSignet size={26} />
        <div className="hidden sm:block leading-none">
          <div className="text-[13px] font-bold tracking-[0.08em] uppercase text-foreground">FERNWERK</div>
          <div className="text-[9px] tracking-[0.04em] text-muted-foreground mt-1">{state.company.name}</div>
        </div>
      </button>

      {/* Welt-Umschaltung */}
      <WorldSwitch />

      {/* Seiten-spezifische Steuerleiste (z.B. Disposition) */}
      {slot && (
        <>
          <div className="w-px h-6 bg-white/10 shrink-0 hidden lg:block" />
          {slot}
        </>
      )}

      {/* Konten */}
      <div className="ml-auto flex items-center gap-2 lg:gap-3">
        {dirty && (
          <button
            onClick={() => save()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-2.5 lg:px-3 py-1.5 text-xs font-medium bg-lime/15 text-lime border border-lime/30 hover:bg-lime/25 disabled:opacity-50 transition shrink-0"
            aria-label="Spielstand speichern"
            title="Spielstand in Datenbank sichern"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Speichern</span>
          </button>
        )}
        {/* Konten-Panel */}
        <div className="flex items-stretch rounded-lg border border-white/10 bg-white/[0.03] divide-x divide-white/10 overflow-hidden shrink-0">
          <button onClick={() => navigate("/finanzen")} className="text-center group px-3 py-1 transition-colors hover:bg-white/5" aria-label="Firmenkonto und Finanzen">
            <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Firma</div>
            <MoneyText value={state.company.accountCents} className="block text-sm lg:text-base font-medium tracking-tight text-foreground group-hover:text-lime transition-colors" accentOnFlash="text-lime" />
          </button>
          <button onClick={() => navigate("/finanzen")} className="text-center group px-3 py-1 transition-colors hover:bg-white/5 hidden lg:block" aria-label="Privatkonto und Haushalt">
            <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Privat</div>
            <MoneyText value={state.private.accountCents} className="block text-sm lg:text-base font-medium tracking-tight text-foreground group-hover:text-coral transition-colors" accentOnFlash="text-coral" />
          </button>
        </div>
        {/* Trennlinie zu Icon-Buttons */}
        <div className="w-px h-8 bg-white/10 shrink-0" />
        <button
          onClick={() => setSlotsOpen(true)}
          className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
          aria-label="Spielstände verwalten"
          title="Spielstände sichern und laden"
        >
          <HardDrive className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate("/postfach")}
          className="relative w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
          aria-label={`Postfach${unreadCount > 0 ? ` – ${unreadCount} ungelesen` : ""}`}
          title="Postfach"
        >
          <MailIcon className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-coral text-ink text-[9px] font-bold tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setHelpOpen(true)}
          className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
          aria-label="Hilfe öffnen"
          title="Hilfe & Erklärungen"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
        <button
          onClick={toggleMotion}
          className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
          aria-label={motionEnabled ? "Animationen ausschalten" : "Animationen einschalten"}
          aria-pressed={motionEnabled}
          title={motionEnabled ? "Bewegung reduzieren" : "Bewegung aktivieren"}
        >
          <Sparkles className={`w-4 h-4 ${motionEnabled ? "text-lime" : ""}`} />
        </button>
        <button
          onClick={() => base44.auth.logout("/login")}
          className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-coral transition shrink-0"
          aria-label="Abmelden"
          title="Abmelden"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
      <SaveSlotsDialog open={slotsOpen} onOpenChange={setSlotsOpen} />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}