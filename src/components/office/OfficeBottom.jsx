import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { getLiquidity, getGrowthInfo, getPrivatePreview, getPersonnelStats } from "@/lib/officeData";
import { getOpenItems } from "@/lib/accountingData";
import { computeCreditLimit } from "@/lib/financingData";
import { Wallet, Users, Trophy, Heart, Clock, Gift, ArrowRight, AlertTriangle } from "lucide-react";

// Vier substantielle Übersichtspanels: Finanzen, Personal, Wachstum, Privatleben.
// Jedes Panel hat klare Hierarchie und handlungsrelevante Informationen.
export default function OfficeBottom({ state }) {
  const navigate = useNavigate();
  const liquidity = useMemo(() => getLiquidity(state), [state]);
  const openItems = useMemo(() => getOpenItems(state), [state]);
  const credit = useMemo(() => computeCreditLimit(state), [state]);
  const growth = useMemo(() => getGrowthInfo(state), [state]);
  const privatePreview = useMemo(() => getPrivatePreview(state), [state]);
  const personnel = useMemo(() => getPersonnelStats(state), [state]);

  const openItemsTotal = useMemo(() => openItems.reduce((s, o) => s + o.remainingCents, 0), [openItems]);
  const stages = [0, 25000000, 100000000, 500000000];
  const currentStageIdx = stages.findIndex((s, i) => growth.companyValue >= s && (i === stages.length - 1 || growth.companyValue < stages[i + 1]));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Finanzen */}
      <Panel
        icon={Wallet}
        title="Finanzen"
        to="/finanzen"
        navigate={navigate}
        alert={liquidity.openCompanyCosts > 0}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Firmenbank</span>
            <span className="text-lg font-semibold tabular-nums">{formatEuro(liquidity.bankBalance)}</span>
          </div>
          <div className="h-px bg-white/5" />
          <Row label="Offene Kosten" value={formatEuro(liquidity.openCompanyCosts)} tone={liquidity.openCompanyCosts > 0 ? "amber" : "muted"} />
          <Row label="Offene Posten" value={formatEuro(openItemsTotal)} tone={openItemsTotal > 0 ? "amber" : "muted"} />
          <Row label="Kreditlinie" value={formatEuro(credit.available)} tone="muted" />
        </div>
        {liquidity.openCompanyCosts > 0 && (
          <button onClick={() => navigate("/finanzen")}
            className="w-full mt-3 py-2 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-medium hover:bg-amber-400/20 transition flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Offene Kosten begleichen
          </button>
        )}
      </Panel>

      {/* Personal */}
      <Panel
        icon={Users}
        title="Personal"
        to="/personal"
        navigate={navigate}
        alert={personnel.criticalSatisfaction > 0 || personnel.noticeGiven > 0}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Beschäftigte</span>
            <span className="text-lg font-semibold tabular-nums">{personnel.total}</span>
          </div>
          <div className="h-px bg-white/5" />
          <Row label="Verfügbar" value={`${personnel.present}`} tone="default" />
          <Row label="Krank / Urlaub" value={`${personnel.sick} / ${personnel.vacation}`} tone={personnel.sick > 0 ? "amber" : "muted"} />
          <Row label="Kritische Zufriedenheit" value={`${personnel.criticalSatisfaction}`} tone={personnel.criticalSatisfaction > 0 ? "red" : "muted"} />
          <Row label="Austritte angekündigt" value={`${personnel.noticeGiven}`} tone={personnel.noticeGiven > 0 ? "amber" : "muted"} />
          <Row label="Bewerber offen" value={`${personnel.applicants}`} tone={personnel.applicants > 0 ? "lime" : "muted"} />
        </div>
      </Panel>

      {/* Wachstum */}
      <Panel
        icon={Trophy}
        title="Unternehmensentwicklung"
        to="/erfolge"
        navigate={navigate}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Unternehmenswert</span>
            <span className="text-lg font-semibold tabular-nums">{formatEuro(growth.companyValue)}</span>
          </div>
          <div className="text-xs text-lime font-medium">{growth.stage.name}</div>
          {/* Stufen-Balken */}
          <div className="flex gap-1 pt-1">
            {stages.map((threshold, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${growth.companyValue >= threshold ? "bg-lime" : "bg-white/10"}`} />
            ))}
          </div>
          <div className="h-px bg-white/5 mt-1" />
          <Row label="Erfolge" value={`${growth.unlockedAchievements} / ${growth.totalAchievements}`} tone="default" />
          <Row label="Level" value={`${growth.level.level} · ${growth.level.title}`} tone="muted" />
        </div>
      </Panel>

      {/* Privatleben */}
      <Panel
        icon={Heart}
        title="Privatleben"
        to="/zuhause"
        navigate={navigate}
        alert={privatePreview.stress >= 80}
      >
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Privatkonto</span>
            <span className="text-lg font-semibold tabular-nums">{formatEuro(privatePreview.privateAccount)}</span>
          </div>
          <div className="h-px bg-white/5" />
          {/* Belastungs-/Zufriedenheits-Balken */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Belastung</span>
              <span className={privatePreview.stress >= 80 ? "text-red-300" : privatePreview.stress >= 60 ? "text-amber-300" : "text-lime"}>{Math.round(privatePreview.stress)}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className={`h-full rounded-full ${privatePreview.stress >= 80 ? "bg-red-400" : privatePreview.stress >= 60 ? "bg-amber-400" : "bg-lime"}`} style={{ width: `${Math.round(privatePreview.stress)}%` }} />
            </div>
          </div>
          <Row label="Zufriedenheit" value={`${Math.round(privatePreview.happiness)}/100`} tone="default" />
          <Row label="Beziehung" value={`${Math.round(privatePreview.relationship)}/100`} tone="muted" />
        </div>
        {privatePreview.nextAppointment && (
          <div className="flex items-center gap-1.5 text-[11px] text-coral mt-3 pt-2 border-t border-white/5">
            <Clock className="w-3 h-3" /> Nächster Termin: {formatGameTime(privatePreview.nextAppointment.startMin)}
          </div>
        )}
        {privatePreview.claimableRewards > 0 && (
          <button onClick={() => navigate("/zuhause")}
            className="w-full mt-3 py-2 rounded-lg bg-coral/10 border border-coral/20 text-coral text-xs font-medium hover:bg-coral/20 transition flex items-center justify-center gap-1.5">
            <Gift className="w-3 h-3" /> {privatePreview.claimableRewards} Belohnung(en) abholbar
          </button>
        )}
      </Panel>
    </div>
  );
}

function Panel({ icon: Icon, title, to, navigate, alert, children }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${alert ? "text-amber-300" : "text-muted-foreground/70"}`} /> {title}
        </h4>
        <button onClick={() => navigate(to)} className="text-[10px] text-lime/70 hover:text-lime transition flex items-center gap-0.5">
          Details <ArrowRight className="w-2.5 h-2.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, tone }) {
  const toneClass = tone === "red" ? "text-red-300" : tone === "amber" ? "text-amber-300" : tone === "lime" ? "text-lime" : tone === "muted" ? "text-muted-foreground/60" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}