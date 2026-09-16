import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { motion } from "framer-motion";
import { heroStagger, heroItem, EASE } from "@/lib/motion";
import { Heart, Clock, Check, X, Footprints, Zap, Smile, MapPin, ArrowRight, Gift, ShoppingBag, Home as HomeIcon, Target, Activity, Smartphone } from "lucide-react";
import RewardsSection from "@/components/home/RewardsSection";
import PurchaseCatalog from "@/components/home/PurchaseCatalog";
import PossessionsSection from "@/components/home/PossessionsSection";
import ActivityPanel from "@/components/home/ActivityPanel";
import GoalsPanel from "@/components/home/GoalsPanel";
import RelationshipPanel from "@/components/home/RelationshipPanel";
import DatingPanel from "@/components/home/DatingPanel";
import PageHint from "@/components/help/PageHint";

export default function Home() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [busyKey, setBusyKey] = useState(null);
  const [privateTab, setPrivateTab] = useState("activities");
  const p = state.private;

  const pendingInvites = state.appointments.filter(
    a => a.status === "pending" && a.appearMin <= state.gameTime && state.gameTime < a.decisionDeadline
  );
  const active = state.appointments.find(a => a.status === "active");
  const upcoming = state.appointments.filter(a => ["accepted", "active"].includes(a.status)).sort((a, b) => a.startMin - b.startMin);
  const nextAccepted = state.appointments.filter(a => a.status === "accepted").sort((a, b) => a.startMin - b.startMin)[0];
  const canWalk = state.leisureUsedDay !== dayOf(state.gameTime) && !active;

  const refs = { leisure: useRef(null), invitation: useRef(null), vitals: useRef(null), account: useRef(null) };
  function scrollTo(key) { refs[key]?.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }

  async function answer(invite, choice) {
    setBusyKey(invite.id + choice);
    try { await send("answerInvitation", { appointmentId: invite.id, choice }); showToast("Einladung beantwortet.", "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyKey(null); }
  }
  async function walk() {
    try { await send("startLeisure", { type: "walk" }); showToast("Spaziergang gestartet – 2 Spielstunden.", "success"); }
    catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto">
      <PageHint pageKey="home" />
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start lg:items-center">
        {/* Hero */}
        <motion.div variants={heroStagger} initial="initial" animate="animate" className="flex-1 max-w-2xl">
          <motion.div variants={heroItem} className="flex items-center gap-3 mb-5 lg:mb-7">
            <span className="w-7 h-px bg-coral" />
            <span className="text-[10px] lg:text-xs tracking-[0.2em] uppercase text-muted-foreground">Privatleben</span>
          </motion.div>
          <motion.h1 variants={heroItem} className="text-[clamp(36px,5vw,68px)] leading-[1.04] tracking-[-0.06em] font-medium text-balance">
            Zeit für das,<br /><em className="text-coral not-italic">was dir wichtig ist.</em>
          </motion.h1>
          <motion.p variants={heroItem} className="mt-5 lg:mt-7 max-w-md text-sm lg:text-base text-muted-foreground leading-relaxed">
            Erfolg hat mehr als eine Seite. {p.partnerName} und du – zwischen Aufträgen und Abendlicht.
          </motion.p>
          <motion.div variants={heroItem} className="mt-5 lg:mt-7 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {p.residence}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 text-coral" /> Beziehung {Math.round(p.relationship)}/100</span>
          </motion.div>
        </motion.div>

        {/* Opportunity Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="w-full lg:w-[340px] shrink-0 glass-coral border border-coral/20 rounded-2xl p-5 lg:p-6 shadow-2xl"
        >
          {active ? (
            <>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-coral">
                <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" style={{ boxShadow: "0 0 12px hsl(var(--coral) / 0.6)" }} />
                Aktiv
              </div>
              <h2 className="text-xl lg:text-2xl font-medium tracking-tight mt-4">Gemeinsame Zeit.</h2>
              <div className="text-xs text-muted-foreground mt-1">{labelOf(active)}</div>
              <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatGameTime(active.startMin)} – {formatGameTime(active.endMin)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-5 leading-relaxed border-t border-white/10 pt-4">
                Du bist beschäftigt. Operative Aktionen sind bis {formatGameTime(active.endMin)} gesperrt.
              </div>
            </>
          ) : pendingInvites.length > 0 ? (
            <>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-coral">
                <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" style={{ boxShadow: "0 0 12px hsl(var(--coral) / 0.6)" }} />
                Einladung offen
              </div>
              <h2 className="text-xl lg:text-2xl font-medium tracking-tight mt-4">Ein Abend für euch.</h2>
              <div className="text-xs text-muted-foreground mt-1">{p.partnerName} lädt dich ein</div>
              <p className="text-sm text-foreground/80 mt-4 leading-relaxed">{pendingInvites[0].text}</p>
              <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatGameTime(pendingInvites[0].startMin)} – {formatGameTime(pendingInvites[0].endMin)}</span>
                <span>60 € privat</span>
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-2">Antwort nötig bis {formatGameTime(pendingInvites[0].decisionDeadline)}</div>
              <div ref={refs.invitation} className="grid grid-cols-3 gap-2 mt-5 scroll-mt-4">
                <button onClick={() => answer(pendingInvites[0], "accept")} disabled={busyKey === pendingInvites[0].id + "accept" || p.accountCents < 6000}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-coral text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95">
                  <Check className="w-4 h-4" /> Zusagen
                </button>
                <button onClick={() => answer(pendingInvites[0], "reschedule")} disabled={busyKey === pendingInvites[0].id + "reschedule"}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 disabled:opacity-40 transition active:scale-95">
                  <Clock className="w-4 h-4" /> Verschieben
                </button>
                <button onClick={() => answer(pendingInvites[0], "decline")} disabled={busyKey === pendingInvites[0].id + "decline"}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-red-500/15 border border-red-400/30 text-red-200 text-xs font-medium hover:bg-red-500/25 disabled:opacity-40 transition active:scale-95">
                  <X className="w-4 h-4" /> Absagen
                </button>
              </div>
              {p.accountCents < 6000 && <div className="text-[10px] text-red-300 mt-2 text-center">Zusage gesperrt: Privatkonto reicht für 60 € nicht aus.</div>}
            </>
          ) : nextAccepted ? (
            <>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-coral">
                <span className="w-1.5 h-1.5 rounded-full bg-coral" />
                Zugesagt
              </div>
              <h2 className="text-xl lg:text-2xl font-medium tracking-tight mt-4">Ein Abend für euch.</h2>
              <div className="text-xs text-muted-foreground mt-1">{p.partnerName} freut sich</div>
              <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {formatGameTime(nextAccepted.startMin)} – {formatGameTime(nextAccepted.endMin)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-5 leading-relaxed border-t border-white/10 pt-4">
                Du hast zugesagt. Der Termin steht – nutze die Zeit bis dahin.
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-coral/60" />
                Freie Zeit
              </div>
              <h2 className="text-xl lg:text-2xl font-medium tracking-tight mt-4">Ein Moment für dich.</h2>
              <div className="text-xs text-muted-foreground mt-1">Keine offene Einladung</div>
              <div ref={refs.leisure} className="scroll-mt-4 mt-5 border-t border-white/10 pt-5">
                <div className="text-sm text-foreground/80">Spaziergang an der Alster</div>
                <div className="text-[11px] text-muted-foreground mt-1">2 Spielstunden · Belastung −8 · Zufriedenheit +2</div>
                <button onClick={walk} disabled={!canWalk}
                  className="w-full flex items-center justify-center gap-2 rounded-lg py-3 mt-4 bg-coral text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
                  <Footprints className="w-4 h-4" /> Spaziergang starten
                </button>
                {!canWalk && <div className="text-[10px] text-muted-foreground/70 mt-2 text-center">Heute bereits eine Freizeitaktivität geplant.</div>}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Beziehung & Familie */}
      <div className="mt-8 lg:mt-10 pt-6 border-t border-white/10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <RelationshipPanel state={state} send={send} showToast={showToast} />
          </div>
          <div ref={refs.vitals} className="scroll-mt-4 glass rounded-2xl border border-white/10 p-5">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-4">Wie es dir geht</div>
            <div className="space-y-4">
              <VitalBar icon={Heart} label="Beziehung" value={p.relationship} />
              <VitalBar icon={Smile} label="Zufriedenheit" value={p.happiness} />
              <VitalBar icon={Zap} label="Belastung" value={p.stress} invert />
            </div>
          </div>
          <div className="glass rounded-2xl border border-white/10 p-5">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-4">Anstehende Termine</div>
            {upcoming.length === 0 ? (
              <div className="text-sm text-muted-foreground/50">Keine anstehenden Termine.</div>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 4).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs border border-white/10 rounded-lg px-3 py-2 bg-surface/40">
                    <span className="text-foreground/80">{labelOf(a)}</span>
                    <span className="text-muted-foreground tabular-nums">{formatGameTime(a.startMin)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div ref={refs.account} className="scroll-mt-4 glass rounded-2xl border border-white/10 p-5">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-4">Privatkonto & Haushalt</div>
            <div className="text-2xl lg:text-3xl font-medium tracking-tight tabular-nums">{formatEuro(p.accountCents)}</div>
            <div className="text-xs text-muted-foreground mt-1">{p.residence}</div>
            <div className="text-xs text-muted-foreground mt-2">Lebenshaltung: 30 €/Tag · Entnahme: 100 €/Tag</div>
            <button onClick={() => navigate("/finanzen")} className="text-xs text-coral hover:text-coral/80 mt-3 flex items-center gap-1 transition">
              Finanzen ansehen <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Belohnungen & Privatleben Tabs (Auftrag 26) */}
      <div className="mt-8 lg:mt-10 pt-6 border-t border-white/10">
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { id: "activities", label: "Aktivitäten", icon: Activity },
            { id: "rewards", label: "Belohnungen", icon: Gift },
            { id: "purchases", label: "Anschaffungen", icon: ShoppingBag },
            { id: "possessions", label: "Besitz", icon: HomeIcon },
            { id: "dating", label: "Dating-App", icon: Smartphone },
            { id: "goals", label: "Lebensziele", icon: Target },
          ].map(t => {
            const Icon = t.icon;
            const availableRewards = Object.values(state.private?.rewards?.claims || {}).filter(c => c.status === "available").length;
            return (
              <button
                key={t.id}
                onClick={() => setPrivateTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                  privateTab === t.id
                    ? "bg-coral/15 border-coral/30 text-coral"
                    : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.id === "rewards" && availableRewards > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-lime/20 text-lime text-[9px] font-semibold">{availableRewards}</span>
                )}
              </button>
            );
          })}
        </div>

        {privateTab === "activities" && <ActivityPanel state={state} send={send} showToast={showToast} />}
        {privateTab === "rewards" && <RewardsSection state={state} send={send} showToast={showToast} />}
        {privateTab === "purchases" && <PurchaseCatalog state={state} send={send} showToast={showToast} />}
        {privateTab === "possessions" && <PossessionsSection state={state} send={send} showToast={showToast} />}
        {privateTab === "dating" && <DatingPanel state={state} send={send} showToast={showToast} />}
        {privateTab === "goals" && <GoalsPanel state={state} send={send} showToast={showToast} />}
      </div>
    </div>
  );
}

function labelOf(a) {
  if (a.type === "invitation") return "Freizeitabend (Einladung)";
  if (a.type === "invitation_ersatz") return "Freizeitabend (Ersatztermin)";
  if (a.type === "leisure") return a.label || "Freizeitaktivität";
  return a.text || "Termin";
}

function VitalBar({ icon: Icon, label, value, invert }) {
  const color = invert
    ? value >= 80 ? "bg-red-500" : value >= 50 ? "bg-amber-500" : "bg-lime"
    : value >= 60 ? "bg-lime" : value >= 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {label}</span>
        <span className="tabular-nums text-foreground">{Math.round(value)}/100</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/10 mt-1.5 overflow-hidden">
        <motion.div className={`h-full ${color} rounded-full`} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.6, ease: EASE }} />
      </div>
    </div>
  );
}