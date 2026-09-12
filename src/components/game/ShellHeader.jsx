import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import MoneyText from "@/components/MoneyText";
import FernwerkSignet from "@/components/brand/FernwerkSignet";
import AutomationControl from "@/components/game/AutomationControl";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { Building2, Heart, Sparkles, Mail as MailIcon, LineChart } from "lucide-react";
import { getMailboxStats } from "@/lib/mailData";
import { getAllNotifications } from "@/lib/eventLogClient";

// Obere Statusleiste: FERNWERK-Marke, Welt-Umschaltung, beide Konten, Bewegungs-Toggle.
export default function ShellHeader() {
  const { state, motionEnabled, toggleMotion, unseenCount, markAllEventsSeen } = useGame();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/zuhause";
  const isInvestment = location.pathname.startsWith("/investment");
  const mailStats = state?.mail ? getMailboxStats(state) : null;
  const unreadCount = mailStats?.unread || 0;
  const notifications = useMemo(() => getAllNotifications(state, 50), [state?.events]);
  const totalUnseen = unseenCount + unreadCount;

  return (
    <header className="relative z-20 flex items-center gap-3 lg:gap-6 px-4 lg:px-12 h-14 lg:h-16 border-b border-white/10 backdrop-blur-md bg-ink/60 shrink-0">
      {/* Marke */}
      <button onClick={() => navigate("/")} className="flex items-center gap-2.5 shrink-0" aria-label="FERNWERK – zum Büro">
        <FernwerkSignet size={26} />
        <div className="hidden sm:block leading-none">
          <div className="text-[13px] font-bold tracking-[0.08em] uppercase text-foreground">FERNWERK</div>
          <div className="text-[9px] tracking-[0.04em] text-muted-foreground mt-1">{state.company.name}</div>
        </div>
      </button>

      {/* Welt-Umschaltung */}
      <div className="flex items-center bg-ink/60 border border-white/10 rounded-full p-1 gap-1 backdrop-blur-lg">
        <button
          onClick={() => navigate("/")}
          className={`flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-[13px] font-medium transition ${!isHome && !isInvestment ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"}`}
          aria-pressed={!isHome && !isInvestment}
        >
          <Building2 className="w-4 h-4" /> <span className="hidden sm:inline">Unternehmen</span>
        </button>
        <button
          onClick={() => navigate("/zuhause")}
          className={`flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-[13px] font-medium transition ${isHome ? "bg-coral text-ink" : "text-muted-foreground hover:text-foreground"}`}
          aria-pressed={isHome}
        >
          <Heart className="w-4 h-4" /> <span className="hidden sm:inline">Privatleben</span>
        </button>
        <button
          onClick={() => navigate("/investment")}
          className={`flex items-center gap-2 rounded-full px-3 lg:px-4 py-1.5 text-xs lg:text-[13px] font-medium transition ${isInvestment ? "bg-invest-purple text-ink" : "text-muted-foreground hover:text-foreground"}`}
          aria-pressed={isInvestment}
        >
          <LineChart className="w-4 h-4" /> <span className="hidden sm:inline">Investment</span>
        </button>
      </div>

      {/* Konten */}
      <div className="ml-auto flex items-center gap-3 lg:gap-6">
        <AutomationControl />
        <button onClick={() => navigate("/finanzen")} className="text-left group" aria-label="Firmenkonto und Finanzen">
          <div className="text-[9px] lg:text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Firma</div>
          <MoneyText value={state.company.accountCents} className="text-sm lg:text-lg font-medium tracking-tight text-foreground group-hover:text-lime transition-colors" accentOnFlash="text-lime" />
        </button>
        <button onClick={() => navigate("/finanzen")} className="text-left group hidden sm:block" aria-label="Privatkonto und Haushalt">
          <div className="text-[9px] lg:text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Privat</div>
          <MoneyText value={state.private.accountCents} className="text-sm lg:text-lg font-medium tracking-tight text-foreground group-hover:text-coral transition-colors" accentOnFlash="text-coral" />
        </button>
        <NotificationCenter
          notifications={notifications}
          unseenCount={totalUnseen}
          onMarkAllSeen={markAllEventsSeen}
        />
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
          onClick={toggleMotion}
          className="w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:text-lime transition shrink-0"
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