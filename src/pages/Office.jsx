import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, clockOf } from "@/lib/gameData";
import { motion } from "framer-motion";
import { heroStagger, heroItem, EASE } from "@/lib/motion";
import Drawer from "@/components/ui/Drawer";
import DispositionForm from "@/components/DispositionForm";
import { Package, Clock, MapPin, Truck, ArrowRight, Heart, TrendingUp, CheckCircle2 } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

export default function Office() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [drawerOrderId, setDrawerOrderId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const opp = deriveOpportunity(state);

  async function handleAction() {
    if (opp.actionTo) { navigate(opp.actionTo); return; }
    if (opp.actionDispatch) { openDrawer(opp.actionDispatch); return; }
    if (opp.actionAccept) {
      setBusyId(opp.actionAccept);
      try { await send("acceptOrder", { orderId: opp.actionAccept }); openDrawer(opp.actionAccept); }
      catch (e) { showToast(e.message, "error"); }
      finally { setBusyId(null); }
    }
  }

  function openDrawer(orderId) { setDrawerOrderId(orderId); setDrawerOpen(true); }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-start lg:items-center">
        <Hero state={state} opp={opp} />
        <OpportunityCard opp={opp} onAction={handleAction} busyId={busyId} />
      </div>
      <GameStrip state={state} />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Transport planen" kicker="Disposition" maxWidth="max-w-lg">
        {drawerOrderId && <DispositionForm orderId={drawerOrderId} onClose={() => setDrawerOpen(false)} onSuccess={() => setDrawerOpen(false)} />}
      </Drawer>
    </div>
  );
}

function deriveOpportunity(state) {
  const blocked = state.appointments.find(a => a.status === "active");
  if (blocked) return {
    eyebrow: "Private Aktivität", tone: "coral",
    title: "Zeit für euch.",
    customer: `${state.private.partnerName} wartet auf dich`,
    routeLabel: "Gemeinsamer Abend",
    meta: [{ icon: Clock, text: `${formatGameTime(blocked.startMin)} – ${formatGameTime(blocked.endMin)}` }],
    actionLabel: "Zum Privatleben", actionTo: "/zuhause",
    footnote: "Operative Aktionen sind währenddessen gesperrt.",
  };

  const invite = state.appointments.find(a => a.status === "pending" && a.appearMin <= state.gameTime);
  if (invite) return {
    eyebrow: "Einladung offen", tone: "coral",
    title: "Ein Abend für euch.",
    customer: `${state.private.partnerName} lädt dich ein`,
    routeLabel: invite.text.slice(0, 60) + (invite.text.length > 60 ? "…" : ""),
    meta: [{ icon: Clock, text: `Antwort nötig bis ${clockOf(invite.decisionDeadline)} Uhr` }],
    actionLabel: "Einladung ansehen", actionTo: "/zuhause",
    footnote: "Zusage, Verschiebung oder Absage – deine Entscheidung wirkt.",
  };

  const accepted = state.orders.filter(o => o.status === "angenommen" && !state.trips.some(t => t.orderId === o.id && t.status === "in_progress"));
  if (accepted.length) {
    const o = accepted[0];
    return {
      eyebrow: "Auftrag disponieren", tone: "lime",
      title: "Bereit zur Abfahrt.",
      customer: o.customer, from: o.fromCity, to: o.toCity,
      meta: [{ icon: Package, text: `${o.tons} t · ${o.cargo}` }, { icon: Clock, text: `Frist ${formatGameTime(o.deliveryDeadlineMin)}` }],
      fee: o.paymentCents, actionLabel: "Transport planen", actionDispatch: o.id,
      footnote: "Wähle Lkw und Fahrer – das System prüft alle Bedingungen.",
    };
  }

  const running = state.trips.filter(t => t.status === "in_progress");
  if (running.length) {
    const t = running[0];
    const o = state.orders.find(x => x.id === t.orderId);
    const leg = t.legs[t.currentLeg];
    return {
      eyebrow: "Auf Tour", tone: "lime",
      title: o ? `Unterwegs nach ${o.toCity}.` : "Unterwegs.",
      customer: o ? o.customer : "Leerfahrt", from: o?.fromCity, to: o?.toCity,
      meta: [{ icon: Truck, text: legLabel(leg) }, { icon: Clock, text: `bis ${formatGameTime(leg.endMin)}` }],
      fee: o?.paymentCents, actionLabel: "Zur Disposition", actionTo: "/disposition?trip=" + t.id,
      footnote: "Deine Flotte ist unterwegs. Setze die Zeit fort, um die Lieferung abzuschließen.",
    };
  }

  const offered = state.orders.filter(o => o.status === "offered");
  if (offered.length) {
    const o = offered.sort((a, b) => a.acceptDeadlineMin - b.acceptDeadlineMin)[0];
    return {
      eyebrow: "Deine nächste Gelegenheit", tone: "lime",
      title: "Ein Auftrag. Dein Anfang.",
      customer: o.customer, from: o.fromCity, to: o.toCity,
      meta: [{ icon: Package, text: `${o.tons} t · ${o.cargo}` }, { icon: Clock, text: `Annahme bis ${formatGameTime(o.acceptDeadlineMin)}` }],
      fee: o.paymentCents, actionLabel: "Annehmen & planen", actionAccept: o.id,
      footnote: `${formatEuro(o.paymentCents)} Vergütung bei pünktlicher Lieferung.`,
    };
  }

  return {
    eyebrow: "Alles ruhig", tone: "muted",
    title: "Deine Spedition.",
    customer: "Keine dringenden Aufträge",
    meta: [],
    actionLabel: "Aufträge ansehen", actionTo: "/auftraege",
    footnote: "Warte auf neue Angebote oder setze die Zeit fort.",
  };
}

function legLabel(leg) {
  if (!leg) return "—";
  if (leg.type === "empty" || leg.type === "empty_drive") return `Leerfahrt nach ${leg.toCity}`;
  if (leg.type === "load") return `Laden in ${leg.fromCity}`;
  if (leg.type === "drive") return `Fahrt nach ${leg.toCity}`;
  if (leg.type === "unload") return `Entladen in ${leg.toCity}`;
  return leg.type;
}

function Hero({ state, opp }) {
  const hero = deriveHero(state, opp);
  return (
    <motion.div variants={heroStagger} initial="initial" animate="animate" className="flex-1 max-w-2xl">
      <motion.div variants={heroItem} className="flex items-center gap-3 mb-5 lg:mb-7">
        <span className="w-7 h-px bg-lime" />
        <span className="text-[10px] lg:text-xs tracking-[0.2em] uppercase text-muted-foreground">{hero.chapter}</span>
      </motion.div>
      <motion.h1 variants={heroItem} className="text-[clamp(36px,5vw,68px)] leading-[1.04] tracking-[-0.06em] font-medium text-balance">
        {hero.headline}
      </motion.h1>
      <motion.p variants={heroItem} className="mt-5 lg:mt-7 max-w-md text-sm lg:text-base text-muted-foreground leading-relaxed">
        {hero.desc}
      </motion.p>
      <motion.div variants={heroItem} className="mt-5 lg:mt-7 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Hamburg · Hauptsitz</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
        <span>{state.vehicles.length} Lkw · {state.drivers.length} Fahrer</span>
      </motion.div>
    </motion.div>
  );
}

function deriveHero(state, opp) {
  if (state.tutorial.active && state.tutorial.step <= 1) return {
    chapter: "Kapitel 01 / Gründerzeit",
    headline: <>Deine erste Million<br /><em className="text-lime not-italic">beginnt hier.</em></>,
    desc: "Drei Lkw. Eine Chance. Baue dein Unternehmen auf – und gestalte das Leben dahinter.",
  };
  if (opp.eyebrow === "Auf Tour") return {
    chapter: "Auf Tour",
    headline: <>Deine Flotte.<br /><em className="text-lime not-italic">In Bewegung.</em></>,
    desc: "Die Tour ist geplant. Dein Fahrer übernimmt – du entscheidest, was als Nächstes kommt.",
  };
  if (state.stats.totalDeliveries >= 10) return {
    chapter: "Unternehmen",
    headline: <>Deine Spedition.<br /><em className="text-lime not-italic">läuft.</em></>,
    desc: "Zehn Lieferungen geschafft. Baue weiter auf – und vergiss das Leben nicht.",
  };
  if (state.stats.totalDeliveries > 0) return {
    chapter: "Unternehmen",
    headline: <>Erste Lieferung.<br /><em className="text-lime not-italic">geschafft.</em></>,
    desc: "Der Anfang ist gemacht. Nimm den nächsten Auftrag an und disponiere deine Flotte.",
  };
  return {
    chapter: "Unternehmen",
    headline: <>Deine erste Million<br /><em className="text-lime not-italic">beginnt hier.</em></>,
    desc: "Drei Lkw. Eine Chance. Baue dein Unternehmen auf – und gestalte das Leben dahinter.",
  };
}

function OpportunityCard({ opp, onAction, busyId }) {
  const tone = opp.tone === "coral" ? "coral" : "lime";
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
      className={`w-full lg:w-[340px] shrink-0 ${tone === "coral" ? "glass-coral" : "glass"} border rounded-2xl p-5 lg:p-6 shadow-2xl`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className={`w-1.5 h-1.5 rounded-full ${tone === "coral" ? "bg-coral" : "bg-lime"} animate-pulse`} style={{ boxShadow: `0 0 12px hsl(var(--${tone}) / 0.6)` }} />
        {opp.eyebrow}
      </div>
      <h2 className="text-xl lg:text-2xl font-medium tracking-tight mt-4 lg:mt-5">{opp.title}</h2>
      <div className="text-xs text-muted-foreground mt-1">{opp.customer}</div>

      {opp.from && opp.to && (
        <div className="flex items-center gap-3 mt-5">
          <span className="text-sm font-medium">{opp.from}</span>
          <span className="flex-1 h-px bg-lime/30 relative">
            <span className="absolute -left-1 -top-1 w-2 h-2 rounded-full border border-lime/60 bg-ink" />
            <span className="absolute -right-1 -top-1 w-2 h-2 rounded-full border border-lime/60 bg-ink" />
          </span>
          <span className="text-sm font-medium">{opp.to}</span>
        </div>
      )}
      {opp.routeLabel && !opp.from && (
        <div className="text-sm text-foreground/80 mt-4 leading-relaxed">{opp.routeLabel}</div>
      )}

      {opp.meta?.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
          {opp.meta.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5"><m.icon className="w-3.5 h-3.5" /> {m.text}</span>
          ))}
        </div>
      )}

      {opp.fee != null && (
        <div className="flex items-baseline justify-between border-t border-white/10 pt-4 mt-5">
          <span className="text-xs text-muted-foreground">{opp.eyebrow === "Auf Tour" ? "Vergütung" : "Vergütung"}</span>
          <span className="text-2xl lg:text-3xl font-medium tracking-tight tabular-nums">{formatEuro(opp.fee)}</span>
        </div>
      )}

      <button
        onClick={onAction}
        disabled={busyId === opp.actionAccept}
        className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 mt-5 font-semibold text-sm transition active:scale-[0.98] disabled:opacity-50 ${tone === "coral" ? "bg-coral text-ink hover:brightness-110" : "bg-lime text-ink hover:brightness-110"}`}
      >
        {busyId === opp.actionAccept ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Annehmen…</> : <>{opp.actionLabel} <ArrowRight className="w-4 h-4" /></>}
      </button>
      {opp.footnote && <div className="text-[10px] text-muted-foreground/70 text-center mt-3 leading-relaxed">{opp.footnote}</div>}
    </motion.div>
  );
}

function GameStrip({ state }) {
  const navigate = useNavigate();
  const vehicles = state.vehicles.slice(0, 4);
  const milestone = state.milestones.find(m => !m.achieved);
  const invite = state.appointments.find(a => a.status === "pending" && a.appearMin <= state.gameTime);

  let prog = 0, target = 1, label = "";
  if (milestone) {
    if (milestone.id === "m1") { prog = state.stats.totalDeliveries; target = 1; label = "Lieferungen"; }
    else if (milestone.id === "m2") { prog = state.stats.timelyDeliveries; target = 10; label = "rechtzeitige Lieferungen"; }
    else if (milestone.id === "m3") { prog = state.vehicles.length; target = 4; label = "eigene Lkw"; }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-8 mt-8 lg:mt-10 pt-6 border-t border-white/10">
      {/* Fuhrpark */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Dein Fuhrpark</span>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {state.vehicles.filter(v => v.status === "free").length} frei · {state.vehicles.filter(v => v.status === "on_trip").length} unterwegs · {state.vehicles.filter(v => v.status === "maintenance").length} Wartung
          </span>
        </div>
        <div className="flex gap-2.5">
          {vehicles.map(v => (
            <div key={v.id} className="flex-1 min-w-0 border border-white/10 rounded-lg p-3 bg-surface/40 hover:border-lime/30 transition">
              <Truck className="w-6 h-5 text-foreground/60 mb-2.5" />
              <div className="text-[11px] font-medium">{vehicleDisplayName(v)}</div>
              <div className={`text-[9px] mt-1 flex items-center gap-1 ${v.status === "free" ? "text-lime" : v.status === "on_trip" ? "text-amber-300" : "text-sky-300"}`}>
                <span className="w-1 h-1 rounded-full bg-current" />
                {v.status === "free" ? "Bereit" : v.status === "on_trip" ? "Unterwegs" : "Wartung"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Wachstum */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Dein nächstes Ziel</span>
          {milestone && <TrendingUp className="w-4 h-4 text-lime/60" />}
        </div>
        {milestone ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl lg:text-3xl font-medium tracking-tight tabular-nums">{prog} / {target}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className="h-1 rounded-full bg-white/10 mt-3 mb-3 overflow-hidden">
              <motion.div className="h-full bg-lime rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (prog / target) * 100)}%` }} transition={{ duration: 0.6, ease: EASE }} />
            </div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{milestone.name}</div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-lime"><CheckCircle2 className="w-5 h-5" /> Alle Meilensteine erreicht!</div>
        )}
      </div>

      {/* Privatleben */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Dein Leben neben dem Job</span>
        </div>
        <button onClick={() => navigate("/zuhause")} className="flex items-start gap-3 text-left w-full group">
          <span className="w-10 h-10 rounded-full bg-coral/10 grid place-items-center text-coral shrink-0">
            <Heart className="w-5 h-5" />
          </span>
          <span>
            <div className="text-sm font-medium group-hover:text-coral transition">{invite ? "Einladung wartet" : "Ein Abend für euch"}</div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{invite ? "Antworte, bevor die Frist abläuft." : "Manche Termine stehen in keiner Auftragsliste."}</div>
          </span>
        </button>
      </div>
    </div>
  );
}