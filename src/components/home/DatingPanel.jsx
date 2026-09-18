import React, { useState, useEffect } from "react";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Heart, X, Coffee, Users, Sparkles, Loader2, Star, Frown, TrendingUp } from "lucide-react";
import Portrait from "@/components/ui/Portrait";

export default function DatingPanel({ state, send, showToast }) {
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null);
  const [subView, setSubView] = useState("profiles"); // profiles | matches
  const p = state.private;

  // Dating-Status laden
  useEffect(() => {
    send("getDatingStatus", {}).then(r => setStatus(r)).catch(() => {});
  }, [state.gameTime, state.private?.relationshipStatus]);

  async function action(key, label, params) {
    setBusy(key + (params?.profileId || params?.matchId || ""));
    try {
      const r = await send(key, params || {});
      if (key === "likeProfile" && r.matched) {
        showToast("Neues Match mit " + r.profile.name + "!", "success");
      } else if (key === "likeProfile" && !r.matched) {
        showToast("Kein Match – vielleicht beim nächsten Profil.", "info");
      } else if (key === "goOnDate") {
        showToast("Date mit " + r.matchName + " gestartet – 3 Spielstunden.", "success");
      } else if (key === "becomePartners") {
        showToast("Ihr seid nun ein Paar! " + r.partnerName + " und du.", "success");
      } else if (key === "breakUp") {
        showToast("Trennung vollzogen.", "info");
      } else {
        showToast(label, "success");
      }
      // Status neu laden
      const fresh = await send("getDatingStatus", {});
      setStatus(fresh);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!status) {
    return <div className="text-sm text-muted-foreground text-center py-8">Dating-App wird geladen…</div>;
  }

  // Nicht single: Hinweis oder Trennung
  if (!status.isSingle) {
    const canBreak = p.relationshipStatus === "dating";
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface-2/50 border border-white/10 p-6 text-center">
          <Users className="w-8 h-8 text-coral/50 mx-auto mb-3" />
          <h3 className="text-sm font-medium mb-1">Du bist nicht single</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Die Dating-App ist nur verfügbar, wenn du single bist. Du bist derzeit mit {p.partnerName} zusammen
            ({p.relationshipStatus === "dating" ? "Partnerschaft" : p.relationshipStatus === "engaged" ? "verlobt" : "verheiratet"}).
          </p>
        </div>
        {canBreak && (
          <div className="rounded-xl bg-red-500/5 border border-red-400/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Frown className="w-4 h-4 text-red-300" />
              <span className="text-xs font-medium text-red-200">Beziehung beenden</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Eine Trennung senkt deine Zufriedenheit und erhöht deinen Stress. Danach kannst du die Dating-App nutzen.
            </p>
            <button
              onClick={() => {
                if (window.confirm("Möchtest du dich wirklich von " + p.partnerName + " trennen?")) {
                  action("breakUp", "Getrennt");
                }
              }}
              disabled={busy === "breakUp"}
              className="flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-200 px-4 py-2 text-xs font-medium hover:bg-red-500/25 disabled:opacity-40 transition"
            >
              {busy === "breakUp" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Von {p.partnerName} trennen
            </button>
          </div>
        )}
      </div>
    );
  }

  // Single: Dating-App
  const profiles = (status.profiles || []).filter(p2 => p2.status === "new");
  const matches = status.matches || [];

  return (
    <div className="space-y-5">
      {/* Profil-Score */}
      <div className="rounded-xl bg-gradient-to-r from-coral/10 to-transparent border border-coral/15 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-coral/15 grid place-items-center shrink-0">
          <TrendingUp className="w-5 h-5 text-coral" />
        </div>
        <div className="flex-1">
          <div className="text-xs font-medium">Dein Profil-Score</div>
          <div className="text-[10px] text-muted-foreground">Höhere Zufriedenheit, weniger Stress und mehr Kapital = bessere Matches</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums text-coral">{status.playerScore}</div>
          <div className="text-[9px] text-muted-foreground">/ 100</div>
        </div>
      </div>

      {/* Tab-Umschalter */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSubView("profiles")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            subView === "profiles" ? "bg-coral/15 text-coral border border-coral/30" : "border border-white/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="w-3.5 h-3.5" /> Profile ({profiles.length})
        </button>
        <button
          onClick={() => setSubView("matches")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            subView === "matches" ? "bg-coral/15 text-coral border border-coral/30" : "border border-white/10 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Matches ({matches.length})
        </button>
      </div>

      {/* Profile-Ansicht */}
      {subView === "profiles" && (
        <div className="space-y-3">
          {profiles.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Heart className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Keine neuen Profile. Neue Profile erscheinen in {status.nextRefreshMin ? formatGameTime(status.nextRefreshMin) : "Kürze"}.
            </div>
          ) : (
            profiles.map(profile => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onLike={() => action("likeProfile", "Geliked", { profileId: profile.id })}
                onPass={() => action("passProfile", "Übersprungen", { profileId: profile.id })}
                busy={busy === "likeProfile" + profile.id || busy === "passProfile" + profile.id}
              />
            ))
          )}
        </div>
      )}

      {/* Matches-Ansicht */}
      {subView === "matches" && (
        <div className="space-y-3">
          {matches.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-30" />
              Noch keine Matches. Likew Profile im "Profile"-Tab, um Matches zu bekommen.
            </div>
          ) : (
            matches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                partnerThreshold={status.partnerThreshold}
                dateCostCents={status.dateCostCents}
                activeAppt={state.appointments?.find(a => a.status === "active")}
                onDate={() => action("goOnDate", "Date gestartet", { matchId: match.id })}
                onPartner={() => {
                  if (window.confirm("Möchtest du mit " + match.name + " fest zusammen sein?")) {
                    action("becomePartners", "Paar geworden", { matchId: match.id });
                  }
                }}
                busyDate={busy === "goOnDate" + match.id}
                busyPartner={busy === "becomePartners" + match.id}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile, onLike, onPass, busy }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="rounded-2xl bg-surface-2/60 border border-white/10 overflow-hidden"
    >
      <div className="flex gap-4 p-4">
        <Portrait portraitId={profile.portraitId} name={profile.name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-medium">{profile.name}, {profile.age}</h4>
            <CompatBadge value={profile.compatibility} />
          </div>
          <div className="text-[11px] text-muted-foreground mb-1.5">{profile.occupation}</div>
          <p className="text-xs text-foreground/70 italic leading-relaxed mb-2">"{profile.bio}"</p>
          <div className="flex flex-wrap gap-1">
            {profile.interests.map((interest, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-muted-foreground">{interest}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-white/5">
        <button
          onClick={onPass}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 py-2.5 bg-surface-2 hover:bg-white/5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          Überspringen
        </button>
        <button
          onClick={onLike}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 py-2.5 bg-coral/10 hover:bg-coral/20 text-xs font-semibold text-coral disabled:opacity-40 transition"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
          Liken
        </button>
      </div>
    </motion.div>
  );
}

function MatchCard({ match, partnerThreshold, dateCostCents, activeAppt, onDate, onPartner, busyDate, busyPartner }) {
  const canBecomePartners = (match.relationshipProgress || 0) >= partnerThreshold;
  const isOnDate = activeAppt?.type === "date" && activeAppt?.matchId === match.id;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="rounded-2xl bg-surface-2/60 border border-coral/15 p-4"
    >
      <div className="flex gap-3 mb-3">
        <Portrait portraitId={match.portraitId} name={match.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-sm font-medium">{match.name}, {match.age}</h4>
            <CompatBadge value={match.compatibility} />
          </div>
          <div className="text-[11px] text-muted-foreground">{match.occupation}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{match.dateCount || 0} Date(s) bisher</div>
        </div>
      </div>

      {/* Beziehungsfortschritt */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Beziehungsfortschritt</span>
          <span className="tabular-nums">{match.relationshipProgress || 0}/{partnerThreshold} für Partnerschaft</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${canBecomePartners ? "bg-lime" : "bg-coral"}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, ((match.relationshipProgress || 0) / partnerThreshold) * 100)}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex gap-2">
        <button
          onClick={onDate}
          disabled={busyDate || isOnDate || !!activeAppt}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 disabled:opacity-40 transition py-2"
        >
          {busyDate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Coffee className="w-3.5 h-3.5" />}
          {isOnDate ? "Date läuft…" : "Date (" + formatEuro(dateCostCents) + ")"}
        </button>
        {canBecomePartners && (
          <button
            onClick={onPartner}
            disabled={busyPartner}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-coral text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-40 transition px-4 py-2"
          >
            {busyPartner ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
            Fest zusammen
          </button>
        )}
      </div>
      {activeAppt && !isOnDate && (
        <div className="text-[10px] text-muted-foreground/60 mt-1.5 text-center">Du bist beschäftigt – Date möglich nach {formatGameTime(activeAppt.endMin)}.</div>
      )}
    </motion.div>
  );
}

function CompatBadge({ value }) {
  const color = value >= 70 ? "text-lime" : value >= 45 ? "text-amber-300" : "text-red-300";
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Star className="w-2.5 h-2.5" />
      {value}%
    </span>
  );
}