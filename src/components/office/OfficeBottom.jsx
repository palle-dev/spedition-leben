import React from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { getLiquidity, getGrowthInfo, getPrivatePreview, getDailyReport } from "@/lib/officeData";
import { getOpenItems } from "@/lib/accountingData";
import { computeCreditLimit } from "@/lib/financingData";
import { Wallet, Users, Wrench, Trophy, Heart, Clock, Gift } from "lucide-react";

// Kompakte Unterseite: Finanzen, Personal/Werkstatt, Wachstum, Privatleben.
export default function OfficeBottom({ state }) {
  const navigate = useNavigate();
  const liquidity = getLiquidity(state);
  const openItems = getOpenItems(state);
  const credit = computeCreditLimit(state);
  const growth = getGrowthInfo(state);
  const privatePreview = getPrivatePreview(state);
  const dailyReport = getDailyReport(state);

  // Personalbedarf
  const mechanics = (state.employees || []).filter(e => e.role === "mechanic" && e.employmentStatus === "employed").length;
  const dispatchers = (state.employees || []).filter(e => (e.role === "dispatcher" || e.role === "dispatcher_senior") && e.employmentStatus === "employed").length;
  const applicantsByRole = {};
  for (const a of (state.availableApplicants || [])) {
    applicantsByRole[a.role] = (applicantsByRole[a.role] || 0) + 1;
  }

  // Werkstatt-Status
  const workshopSlots = (state.workshop?.slots || []).length;
  const workshopOrders = (state.workshop?.maintenanceOrders || []).filter(o => ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Finanzen */}
      <div className="glass border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <Wallet className="w-3 h-3" /> Finanzen
          </h4>
          <button onClick={() => navigate("/finanzen")} className="text-[10px] text-lime/70 hover:text-lime transition">
            Details →
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Firmenbank</span><span className="font-medium tabular-nums">{formatEuro(liquidity.bankBalance)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Offene Kosten</span><span className={`tabular-nums ${liquidity.openCompanyCosts > 0 ? "text-amber-300" : ""}`}>{formatEuro(liquidity.openCompanyCosts)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Offene Posten</span><span className={`tabular-nums ${openItems.length > 0 ? "text-amber-300" : ""}`}>{formatEuro(openItems.reduce((s, o) => s + o.remainingCents, 0))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Kreditlinie</span><span className="text-muted-foreground tabular-nums">{formatEuro(credit.available)}</span></div>
        </div>
        {liquidity.openCompanyCosts > 0 && (
          <button onClick={() => navigate("/finanzen")}
            className="w-full mt-2 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-300 text-[11px] font-medium hover:bg-amber-400/20 transition">
            Offene Kosten begleichen
          </button>
        )}
      </div>

      {/* Personal & Werkstatt */}
      <div className="glass border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Personal & Werkstatt
          </h4>
          <button onClick={() => navigate("/personal")} className="text-[10px] text-lime/70 hover:text-lime transition">
            Details →
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Disponenten</span><span>{dispatchers} {applicantsByRole.dispatcher ? `(+${applicantsByRole.dispatcher + (applicantsByRole.dispatcher_senior || 0)} Bewerber)` : ""}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Mechaniker</span><span className={mechanics === 0 ? "text-amber-300" : ""}>{mechanics} {applicantsByRole.mechanic ? `(+${applicantsByRole.mechanic} Bewerber)` : ""}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Werkstattplätze</span><span>{workshopSlots} · {workshopOrders} Aufträge</span></div>
        </div>
        {mechanics === 0 && applicantsByRole.mechanic > 0 && (
          <button onClick={() => navigate("/personal")}
            className="w-full mt-2 py-1.5 rounded-lg bg-coral/10 border border-coral/20 text-coral text-[11px] font-medium hover:bg-coral/20 transition flex items-center justify-center gap-1">
            <Wrench className="w-3 h-3" /> Mechaniker einstellen
          </button>
        )}
      </div>

      {/* Wachstum */}
      <div className="glass border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <Trophy className="w-3 h-3" /> Wachstum
          </h4>
          <button onClick={() => navigate("/erfolge")} className="text-[10px] text-lime/70 hover:text-lime transition">
            Details →
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Unternehmenswert</span><span className="font-medium tabular-nums">{formatEuro(growth.companyValue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Entwicklungsstufe</span><span className="text-lime">{growth.stage.name}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Erfolge</span><span>{growth.unlockedAchievements}/{growth.totalAchievements}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Level</span><span>{growth.level.level} · {growth.level.title}</span></div>
        </div>
        <div className="flex gap-1 mt-2">
          {[0, 25000000, 100000000, 500000000].map((threshold, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full ${growth.companyValue >= threshold ? "bg-lime" : "bg-white/10"}`} />
          ))}
        </div>
      </div>

      {/* Privatleben */}
      <div className="glass border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <Heart className="w-3 h-3" /> Privatleben
          </h4>
          <button onClick={() => navigate("/zuhause")} className="text-[10px] text-coral/70 hover:text-coral transition">
            Details →
          </button>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Belastung</span>
            <span className={privatePreview.stress >= 80 ? "text-red-300" : privatePreview.stress >= 60 ? "text-amber-300" : "text-lime"}>{privatePreview.stress}/100</span>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Zufriedenheit</span><span>{privatePreview.happiness}/100</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Beziehung</span><span>{privatePreview.relationship}/100</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Privatkonto</span><span className="font-medium tabular-nums">{formatEuro(privatePreview.privateAccount)}</span></div>
        </div>
        {privatePreview.nextAppointment && (
          <div className="flex items-center gap-1 text-[10px] text-coral mt-2">
            <Clock className="w-2.5 h-2.5" /> Nächster Termin: {formatGameTime(privatePreview.nextAppointment.startMin)}
          </div>
        )}
        {privatePreview.claimableRewards > 0 && (
          <button onClick={() => navigate("/zuhause")}
            className="w-full mt-2 py-1.5 rounded-lg bg-coral/10 border border-coral/20 text-coral text-[11px] font-medium hover:bg-coral/20 transition flex items-center justify-center gap-1">
            <Gift className="w-3 h-3" /> {privatePreview.claimableRewards} Belohnung(en) abholbar
          </button>
        )}
      </div>
    </div>
  );
}