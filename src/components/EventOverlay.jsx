import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Trophy, Truck, Heart, MapPin, ArrowRight, Fuel, CreditCard, Clock, Star, Sparkles, TrendingUp, TrendingDown, Mail as MailIcon, Package } from "lucide-react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { EASE } from "@/lib/motion";

// Event-Overlay: zeigt bedeutsame Ereignisse nach bestätigtem Zustandswechsel.
// Nur aus send() gesetzt – kein Effekt bei Neuladen oder Idempotenz-Replay.
export default function EventOverlay({ overlay, onDismiss }) {
  useEffect(() => {
    if (!overlay) return;
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [overlay, onDismiss]);

  return (
    <AnimatePresence>
      {overlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={onDismiss}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 24 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="glass border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onDismiss} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 grid place-items-center text-muted-foreground hover:text-foreground transition" aria-label="Schließen">
              <X className="w-4 h-4" />
            </button>
            {overlay.type === "delivery" && <DeliveryContent data={overlay.data} />}
            {overlay.type === "milestone" && <MilestoneContent data={overlay.data} />}
            {overlay.type === "transportStart" && <TransportStartContent data={overlay.data} />}
            {overlay.type === "invitation" && <InvitationContent data={overlay.data} />}
            {overlay.type === "achievement" && <AchievementContent data={overlay.data} />}
            {overlay.type === "welcomeBack" && <WelcomeBackContent data={overlay.data} />}
            <button onClick={onDismiss} className="mt-5 w-full rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm text-foreground hover:bg-white/10 transition">
              Weiter
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeliveryContent({ data }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime/10 border border-lime/30 mb-4">
        <CheckCircle2 className="w-7 h-7 text-lime" />
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">Lieferung abgeschlossen</h3>
      <div className="text-sm text-muted-foreground mt-2">{data.customer}</div>
      <div className="flex items-center justify-center gap-2 mt-3 text-sm text-foreground/80">
        <MapPin className="w-4 h-4 text-muted-foreground" />
        <span>{data.fromCity}</span>
        <ArrowRight className="w-4 h-4 text-lime" />
        <span>{data.toCity}</span>
      </div>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/10">
        <span className="text-sm text-muted-foreground">{data.onTime ? "Pünktlich geliefert" : "Verspätet (90 %)"}</span>
        <span className="text-lg font-medium text-lime tabular-nums">{formatEuro(data.paymentCents)}</span>
      </div>
      {data.contributionCents != null && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">Beitrag vor Fixkosten</span>
          <span className="text-sm font-medium text-foreground tabular-nums">{formatEuro(data.contributionCents)}</span>
        </div>
      )}
    </div>
  );
}

function AchievementContent({ data }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime/10 border border-lime/30 mb-4 animate-pop">
        <Trophy className="w-7 h-7 text-lime" />
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[10px] tracking-[0.16em] uppercase text-lime/80 mb-2">
        <Sparkles className="w-3 h-3" /> Erfolg freigeschaltet
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">{data.title}</h3>
      {data.desc && <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto leading-relaxed">{data.desc}</p>}
      <div className="flex items-center justify-center gap-1.5 mt-4 text-lime">
        <Star className="w-4 h-4 fill-lime" />
        <span className="text-lg font-medium tabular-nums">+{data.xp} XP</span>
      </div>
    </div>
  );
}

function MilestoneContent({ data }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime/10 border border-lime/30 mb-4">
        <Trophy className="w-7 h-7 text-lime" />
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">Meilenstein erreicht</h3>
      <div className="text-sm text-muted-foreground mt-2">{data.name}</div>
      <div className="text-xs text-muted-foreground/60 mt-4">Ein nächstes Ziel wartet – weiter so.</div>
    </div>
  );
}

function TransportStartContent({ data }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime/10 border border-lime/30 mb-4">
        <Truck className="w-7 h-7 text-lime" />
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">Transport gestartet</h3>
      <div className="flex items-center justify-center gap-4 mt-5 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Fuel className="w-4 h-4" /> {formatEuro(data.fuelCents)}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="w-4 h-4" /> {formatEuro(data.tollCents)}</span>
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" /> Ankunft: {formatGameTime(data.endMin)}
      </div>
    </div>
  );
}

function InvitationContent({ data }) {
  const choiceLabel = data.choice === "accept" ? "Zugesagt" : data.choice === "reschedule" ? "Verschoben" : "Abgesagt";
  const choiceColor = data.choice === "accept" ? "text-lime" : data.choice === "reschedule" ? "text-amber-300" : "text-red-300";
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-coral/10 border border-coral/30 mb-4">
        <Heart className="w-7 h-7 text-coral" />
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">{choiceLabel}</h3>
      <div className="flex items-center justify-center gap-5 mt-5 text-sm">
        <Vital label="Beziehung" value={data.relationship} />
        <Vital label="Zufrieden" value={data.happiness} />
        <Vital label="Belastung" value={data.stress} invert />
      </div>
    </div>
  );
}

function Vital({ label, value, invert }) {
  const color = invert ? (value >= 80 ? "text-red-300" : value >= 50 ? "text-amber-300" : "text-lime") : (value >= 60 ? "text-lime" : value >= 30 ? "text-amber-300" : "text-red-300");
  return (
    <div className="text-center">
      <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function WelcomeBackContent({ data }) {
  const days = data.daysAway || 0;
  const hours = data.hoursAway || 0;
  const companyDelta = data.companyDelta || 0;
  const deliveriesDelta = data.deliveriesDelta || 0;
  const unreadMail = data.unreadMail || 0;
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime/10 border border-lime/30 mb-4">
        <Clock className="w-7 h-7 text-lime" />
      </div>
      <h3 className="text-xl font-medium tracking-tight text-foreground">Willkommen zurück!</h3>
      <p className="text-sm text-muted-foreground mt-2">
        {days > 0 && `${days} Tag${days > 1 ? "e" : ""} `}
        {hours > 0 && `${hours} Std. `}
        {days === 0 && hours === 0 && "Kurze Abwesenheit"}
        {"in der Spielwelt vergangen."}
      </p>
      <div className="mt-5 space-y-2 text-left">
        <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {companyDelta >= 0 ? <TrendingUp className="w-4 h-4 text-lime" /> : <TrendingDown className="w-4 h-4 text-red-300" />}
            Firmenkonto
          </span>
          <span className={`text-sm font-medium tabular-nums ${companyDelta >= 0 ? "text-lime" : "text-red-300"}`}>
            {companyDelta >= 0 ? "+" : ""}{formatEuro(companyDelta)}
          </span>
        </div>
        {deliveriesDelta > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="w-4 h-4 text-lime" /> Lieferungen
            </span>
            <span className="text-sm font-medium tabular-nums text-foreground">+{deliveriesDelta}</span>
          </div>
        )}
        {unreadMail > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <MailIcon className="w-4 h-4 text-coral" /> Neue Nachrichten
            </span>
            <span className="text-sm font-medium tabular-nums text-coral">{unreadMail} ungelesen</span>
          </div>
        )}
      </div>
    </div>
  );
}