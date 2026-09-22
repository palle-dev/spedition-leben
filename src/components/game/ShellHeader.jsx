import PhoneCenter from "@/components/game/PhoneCenter";
import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { useAuth } from "@/lib/AuthContext";
import MoneyText from "@/components/MoneyText";
import FrachtfieberSignet from "@/components/brand/FrachtfieberSignet";
import FrachtfieberMobileSignet from "@/components/brand/FrachtfieberMobileSignet";
import SaveSlotsDialog from "@/components/game/SaveSlotsDialog";
import MailModal from "@/components/mail/MailModal";
import { Sparkles, Mail as MailIcon, Save, Loader2, HardDrive, HelpCircle, LogOut, Settings, Menu, Shield } from "lucide-react";
import HelpPanel from "@/components/help/HelpPanel";
import SettingsDialog from "@/components/game/SettingsDialog";
import { getMailboxStats } from "@/lib/mailData";
import { useHeaderSlot } from "@/lib/headerSlot";
import WorldSwitch from "@/components/game/WorldSwitch";
import SyncStatusBadge from "@/components/game/SyncStatusBadge";
import { base44 } from "@/api/base44Client";

// Obere Statusleiste: FERNWERK-Marke, Welt-Umschaltung, beide Konten, Bewegungs-Toggle.
export default function ShellHeader() {
  const { state, motionEnabled, toggleMotion, dirty, save, saving } = useGame();
  const { user: authUser } = useAuth();
  const { slot } = useHeaderSlot();
  const navigate = useNavigate();
  const location = useLocation();
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const mailStats = state?.mail ? getMailboxStats(state) : null;
  const unreadCount = mailStats?.unread || 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <header className="relative z-20 flex flex-wrap items-center gap-2 lg:gap-3 px-3 lg:px-6 py-2 min-h-14 lg:min-h-16 border-b border-white/10 bg-ink/95 shrink-0">
      {/* Marke */}
      <button onClick={() => navigate("/")} className="flex items-center gap-2.5 shrink-0" aria-label="FRACHTFIEBER – zum Büro">
        <FrachtfieberMobileSignet size={28} className="lg:hidden" />
                    <FrachtfieberSignet size={26} className="hidden lg:block" />
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

      {/* Konten-Panel — zentriert im Header */}
      <div className="flex-1 flex justify-center px-1 sm:px-4 min-w-0">
        <div className="flex items-stretch rounded-lg border border-white/10 bg-white/[0.03] divide-x divide-white/10 overflow-hidden shrink-0">
          <button onClick={() => navigate("/finanzen")} className="text-center group px-2.5 sm:px-4 py-1 transition-colors hover:bg-white/5" aria-label="Firmenkonto und Finanzen">
            <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Firma</div>
            <MoneyText value={state.company.accountCents} className="block text-xs sm:text-sm lg:text-base font-medium tracking-tight text-foreground group-hover:text-lime transition-colors" accentOnFlash="text-lime" />
          </button>
          <button onClick={() => navigate("/finanzen")} className="text-center group px-4 py-1 transition-colors hover:bg-white/5 hidden lg:block" aria-label="Privatkonto und Haushalt">
            <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Privat</div>
            <MoneyText value={state.private.accountCents} className="block text-sm lg:text-base font-medium tracking-tight text-foreground group-hover:text-coral transition-colors" accentOnFlash="text-coral" />
          </button>
        </div>
      </div>

      {/* Rechte Steuerleiste */}
      <div className="flex items-center gap-2 lg:gap-3 shrink-0">
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
        <PhoneCenter key={state.meta?.partyId}/>
        {/* Mobile: Mail + Menü-Button */}
        <button
          onClick={() => setMailOpen(true)}
          className="relative w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0 lg:hidden"
          aria-label={`Postfach${unreadCount > 0 ? ` – ${unreadCount} ungelesen` : ""}`}
        >
          <MailIcon className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-coral text-ink text-[9px] font-bold tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <div ref={menuRef} className="relative lg:hidden">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
            aria-label="Weitere Aktionen"
            aria-expanded={menuOpen}
          >
            <Menu className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 glass border border-white/15 rounded-xl p-1.5 shadow-2xl min-w-[200px] z-50">
              <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
                <SyncStatusBadge />
                <span>Cloud-Status</span>
              </div>
              <button onClick={() => { setSlotsOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-white/5 transition">
                <HardDrive className="w-4 h-4 shrink-0" /> Spielstände
              </button>
              <button onClick={() => { setSettingsOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-white/5 transition">
                <Settings className="w-4 h-4 shrink-0" /> Einstellungen
              </button>
              <button onClick={() => { setHelpOpen(true); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-white/5 transition">
                <HelpCircle className="w-4 h-4 shrink-0" /> Hilfe
              </button>
              <button onClick={toggleMotion} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-white/5 transition">
                <Sparkles className={`w-4 h-4 shrink-0 ${motionEnabled ? "text-lime" : ""}`} /> {motionEnabled ? "Animationen aus" : "Animationen an"}
              </button>
              <div className="h-px bg-white/10 my-1" />
              {authUser?.role === "admin" && (
                <button onClick={() => navigate("/admin")} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-lime hover:bg-lime/5 transition">
                  <Shield className="w-4 h-4 shrink-0" /> Admin
                </button>
              )}
              <button onClick={() => base44.auth.logout("/login")} className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-coral hover:bg-coral/5 transition">
                <LogOut className="w-4 h-4 shrink-0" /> Abmelden
              </button>
            </div>
          )}
        </div>
        {/* Desktop: alle Buttons sichtbar */}
        <div className="hidden lg:flex items-center gap-2 lg:gap-3 shrink-0">
          <div className="w-px h-8 bg-white/10 shrink-0" />
          <SyncStatusBadge />
          <button
            onClick={() => setSlotsOpen(true)}
            className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
            aria-label="Spielstände verwalten"
            title="Spielstände sichern und laden"
          >
            <HardDrive className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMailOpen(true)}
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
            onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
            aria-label="Spieleinstellungen"
            title="Schwierigkeit & Hilfen"
          >
            <Settings className="w-4 h-4" />
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
          {authUser?.role === "admin" && (
            <button
              onClick={() => navigate("/admin")}
              className="w-9 h-9 grid place-items-center rounded-full border border-lime/30 bg-lime/10 text-lime transition shrink-0 hover:bg-lime/20"
              aria-label="Admin-Bereich"
              title="Admin-Bereich"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => base44.auth.logout("/login")}
            className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-coral transition shrink-0"
            aria-label="Abmelden"
            title="Abmelden"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
      <SaveSlotsDialog open={slotsOpen} onOpenChange={setSlotsOpen} />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <MailModal open={mailOpen} onClose={() => setMailOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}