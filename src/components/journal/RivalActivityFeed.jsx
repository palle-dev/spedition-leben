import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import {
  Swords, TrendingDown, UserMinus, Handshake, AlertTriangle,
  Clock, ArrowDownRight, ArrowUpRight, Users, Building2
} from "lucide-react";

// Konkurrenten-Aktivitätsfeed — zeigt Rivalen-Ereignisse aus dem Eventlog
// (Preisanpassungen, Abwerbungsversuche, Kooperationsangebote) chronologisch.
const RIVAL_EVENT_TYPES = [
  "rival_price_adaptation",
  "rival_poaching_attempt",
  "driver_poached",
  "rival_cooperation_offer",
  "cooperation_accepted",
];

export default function RivalActivityFeed({ state }) {
  const navigate = useNavigate();

  // Ereignisse aus dem Eventlog filtern
  const rivalEvents = useMemo(() => {
    const all = (state.events || []).filter(e => RIVAL_EVENT_TYPES.includes(e.type));
    return all.slice().reverse(); // neueste zuerst
  }, [state.events]);

  // Übersicht direkt aus dem State (vermeidet Engine-Import im Frontend)
  const overview = useMemo(() => {
    const rb = state.rivalBehavior || {};
    return {
      pendingPoachingAttempts: (rb.pendingPoachingAttempts || []).filter(a => a.status === "pending"),
      pendingCooperationOffers: (rb.pendingCooperationOffers || []).filter(o => o.status === "pending"),
      rivalStats: (state.world?.rivals || []).map(r => ({
        id: r.id, name: r.name,
        pricePercent: r.pricePercent, relationship: r.relationship,
        losses: rb.lossesByRival?.[r.id] || 0,
        wins: rb.winsByRival?.[r.id] || 0,
      })),
    };
  }, [state]);

  const pendingPoaching = overview?.pendingPoachingAttempts || [];
  const pendingCooperation = overview?.pendingCooperationOffers || [];
  const rivalStats = overview?.rivalStats || [];

  return (
    <div className="space-y-5">
      {/* Aktive Warnungen — offene Abwerbungen und Kooperationen */}
      {(pendingPoaching.length > 0 || pendingCooperation.length > 0) && (
        <div className="space-y-2">
          {pendingPoaching.map(a => (
            <div key={a.id} className="glass-coral border border-red-400/25 rounded-xl p-3.5 flex items-start gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-red-400/15 shrink-0">
                <UserMinus className="w-4 h-4 text-red-300" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Abwerbung: {a.driverName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {a.rivalName} bietet {formatEuro(a.offerDailyWageCents)}/Tag ·
                  Frist {formatGameTime(a.deadlineMin)}
                </div>
              </div>
              <button
                onClick={() => navigate("/personal")}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-400/30 text-red-200 hover:bg-red-500/25 transition shrink-0"
              >
                Reagieren
              </button>
            </div>
          ))}
          {pendingCooperation.map(o => (
            <div key={o.id} className="glass border border-lime/25 rounded-xl p-3.5 flex items-start gap-3">
              <span className="grid place-items-center w-8 h-8 rounded-lg bg-lime/15 shrink-0">
                <Handshake className="w-4 h-4 text-lime" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  Kooperation: {o.rivalName} · {o.cooperationLabel}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Frist {formatGameTime(o.deadlineMin)}
                </div>
              </div>
              <button
                onClick={() => navigate("/postfach")}
                className="text-xs px-3 py-1.5 rounded-lg bg-lime/15 border border-lime/30 text-lime hover:bg-lime/25 transition shrink-0"
              >
                Prüfen
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Rivalen-Übersicht — aktuelle Preis- und Beziehungsdaten */}
      {rivalStats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {rivalStats.map(r => (
            <RivalStatCard key={r.id} rival={r} />
          ))}
        </div>
      )}

      {/* Chronologisches Ereignis-Feed */}
      {rivalEvents.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-10 text-center">
          <div className="grid place-items-center w-12 h-12 rounded-2xl bg-white/5 mx-auto mb-3">
            <Swords className="w-6 h-6 text-muted-foreground/30" />
          </div>
          <p className="text-sm text-muted-foreground">Noch keine Konkurrenten-Aktivität.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Sobald Rivalen Preise anpassen, Fahrer abwerben oder Kooperationen anbieten, erscheint es hier.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rivalEvents.map((ev, i) => (
            <RivalEventRow key={ev.id || i} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function RivalStatCard({ rival }) {
  const priceTone = rival.pricePercent < 100 ? "text-red-300" : rival.pricePercent > 100 ? "text-lime" : "text-muted-foreground";
  const relTone = rival.relationship >= 60 ? "text-lime" : rival.relationship >= 30 ? "text-amber-300" : "text-red-300";

  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground truncate">{rival.name}</span>
        <Building2 className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Preis</div>
          <div className={`tabular-nums font-medium ${priceTone}`}>{rival.pricePercent}%</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Beziehung</div>
          <div className={`tabular-nums font-medium ${relTone}`}>{rival.relationship}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Gew./Verl.</div>
          <div className="tabular-nums font-medium text-foreground/80">{rival.wins}/{rival.losses}</div>
        </div>
      </div>
    </div>
  );
}

function RivalEventRow({ event }) {
  const cfg = eventConfig(event);
  const { Icon, iconCls, borderCls, title, body } = cfg;

  return (
    <div className={`glass border ${borderCls} rounded-lg px-3.5 py-3 flex items-start gap-3`}>
      <span className={`grid place-items-center w-7 h-7 rounded-md shrink-0 ${iconCls}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground/90 font-medium">{title}</div>
        {body && <div className="text-xs text-muted-foreground mt-0.5">{body}</div>}
      </div>
      <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
        {formatGameTime(event.gameTime).replace("Tag ", "T")}
      </span>
    </div>
  );
}

function eventConfig(event) {
  const d = event.details || {};

  switch (event.type) {
    case "rival_price_adaptation": {
      const lowered = d.newPercent < d.oldPercent;
      return {
        Icon: lowered ? TrendingDown : ArrowUpRight,
        iconCls: lowered ? "bg-red-400/15 text-red-300" : "bg-amber-300/15 text-amber-300",
        borderCls: "border-white/10",
        title: `${d.rivalName} passt Preise an`,
        body: `${d.oldPercent}% → ${d.newPercent}% ${lowered ? "− unterbietet Sie" : "− Preiserhöhung"}`,
      };
    }
    case "rival_poaching_attempt": {
      return {
        Icon: UserMinus,
        iconCls: "bg-red-400/15 text-red-300",
        borderCls: "border-red-400/20",
        title: `${d.rivalName} wirbt Fahrer ab`,
        body: `${d.driverName} · Angebot ${formatEuro(d.offerDailyWageCents)}/Tag · Frist ${formatGameTime(d.deadlineMin)}`,
      };
    }
    case "driver_poached": {
      return {
        Icon: AlertTriangle,
        iconCls: "bg-red-500/20 text-red-300",
        borderCls: "border-red-400/30",
        title: `Fahrer verloren: ${d.driverName}`,
        body: `Wechselt zu ${d.rivalName}`,
      };
    }
    case "rival_cooperation_offer": {
      return {
        Icon: Handshake,
        iconCls: "bg-lime/15 text-lime",
        borderCls: "border-lime/20",
        title: `${d.rivalName} bietet Kooperation an`,
        body: `Frist ${formatGameTime(d.deadlineMin)}`,
      };
    }
    case "cooperation_accepted": {
      return {
        Icon: Handshake,
        iconCls: "bg-lime/15 text-lime",
        borderCls: "border-lime/25",
        title: `Kooperation angenommen`,
        body: `Mit ${d.rivalName || "Konkurrent"}`,
      };
    }
    default:
      return {
        Icon: Swords,
        iconCls: "bg-white/5 text-muted-foreground",
        borderCls: "border-white/10",
        title: event.type,
        body: null,
      };
  }
}