import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Heart, Gem, Users, Baby, Cake, Sparkles, Loader2, Gift, Flower2 } from "lucide-react";

const STATUS_LABELS = {
  dating: "Partnerschaft",
  engaged: "Verlobt",
  married: "Verheiratet",
};

const STATUS_COLORS = {
  dating: "text-muted-foreground",
  engaged: "text-amber-300",
  married: "text-coral",
};

const GIFT_ICONS = {
  chocolate: Gift,
  flowers_small: Flower2,
  jewelry: Gem,
  surprise: Sparkles,
};

function ageLabel(ageDays) {
  if (ageDays < 365) return Math.floor(ageDays / 30) + " Monate";
  const years = Math.floor(ageDays / 365);
  return years + (years === 1 ? " Jahr" : " Jahre");
}

function formatEuro(cents) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export default function RelationshipPanel({ state, send, showToast }) {
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("gifts");
  const [gifts, setGifts] = useState([]);
  const p = state.private;
  const status = p.relationshipStatus || "dating";
  const children = p.children || [];
  const pregnancy = p.pregnancy;
  const relationship = p.relationship || 0;

  const canPropose = status === "dating" && relationship >= 70 && p.accountCents >= 500000;
  const canMarry = status === "engaged" && p.accountCents >= 1500000;
  const canPlanChild = status === "married" && relationship >= 75 && !pregnancy && children.length < 4;

  // Geschenk-Optionen laden
  useEffect(() => {
    if (tab === "gifts") {
      send("getGiftOptions", {}).then(r => setGifts(r.gifts || [])).catch(() => {});
    }
  }, [tab, state.gameTime, state.private?.relationship]);

  async function action(key, label, params) {
    setBusy(key);
    try {
      await send(key, params || {});
      showToast(label + " – alles erledigt.", "success");
      if (key === "giveGift") {
        const r = await send("getGiftOptions", {});
        setGifts(r.gifts || []);
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally { setBusy(null); }
  }

  const relColor = relationship >= 70 ? "bg-coral" : relationship >= 40 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="glass-coral border border-coral/20 rounded-2xl p-5 lg:p-6">
      {/* Kopf */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-coral" />
          <h3 className="text-sm font-medium tracking-tight">Beziehung & Familie</h3>
        </div>
        <span className={`text-xs font-semibold ${STATUS_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Partner */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-coral/15 border border-coral/20 grid place-items-center shrink-0">
          <Heart className="w-5 h-5 text-coral" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{p.partnerName}</div>
          <div className="text-[11px] text-muted-foreground">
            {status === "married" && p.marriageDate != null
              ? "Verheiratet seit " + formatGameTime(p.marriageDate)
              : status === "engaged" && p.engagementDate != null
                ? "Verlobt seit " + formatGameTime(p.engagementDate)
                : "In einer Partnerschaft"}
          </div>
        </div>
      </div>

      {/* Beziehungs-Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Beziehungsqualität</span>
          <span className="tabular-nums">{Math.round(relationship)}/100</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${relColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${relationship}%` }}
            transition={{ duration: 0.6, ease: EASE }}
          />
        </div>
      </div>

      {/* Schwangerschaft */}
      {pregnancy && (
        <div className="mb-4 rounded-lg bg-coral/10 border border-coral/20 px-3 py-2.5 flex items-center gap-2">
          <Baby className="w-4 h-4 text-coral shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-coral">Kind erwartet</div>
            <div className="text-[10px] text-muted-foreground">Geburt: {formatGameTime(pregnancy.dueMin)}</div>
          </div>
        </div>
      )}

      {/* Kinder */}
      {children.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3 h-3" /> Kinder ({children.length})
          </div>
          <div className="space-y-1.5">
            {children.map(c => {
              const ageDays = Math.floor((state.gameTime - c.birthMin) / 1440);
              return (
                <div key={c.id} className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full bg-coral/10 grid place-items-center shrink-0">
                    <Baby className="w-3.5 h-3.5 text-coral/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{ageLabel(ageDays)}</div>
                  </div>
                  {ageDays >= 365 && <Cake className="w-3 h-3 text-amber-300/60" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs: Geschenke / Meilensteine */}
      <div className="flex items-center gap-1 mb-3 pt-2 border-t border-white/10">
        <button
          onClick={() => setTab("gifts")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
            tab === "gifts" ? "bg-coral/15 text-coral" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Gift className="w-3 h-3" /> Geschenke
        </button>
        <button
          onClick={() => setTab("milestones")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
            tab === "milestones" ? "bg-coral/15 text-coral" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Heart className="w-3 h-3" /> Meilensteine
        </button>
      </div>

      {/* Geschenk-Tab */}
      {tab === "gifts" && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground/70 px-1">
            Kleine Aufmerksamkeiten stärken die Beziehung sofort – ohne Zeit-Aktivität.
          </p>
          {gifts.length === 0 ? (
            <div className="text-xs text-muted-foreground/50 text-center py-3">Lade Geschenke…</div>
          ) : (
            gifts.map(g => {
              const Icon = GIFT_ICONS[g.id] || Gift;
              const disabled = !g.available || busy === "giveGift:" + g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => action("giveGift", g.label + " verschenkt", { giftId: g.id })}
                  disabled={disabled}
                  className="w-full flex items-center gap-2.5 rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2 text-left hover:bg-white/[0.06] disabled:opacity-40 transition active:scale-[0.98]"
                >
                  <div className="w-8 h-8 rounded-full bg-coral/10 grid place-items-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-coral/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{g.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      +{g.contactDelta} Beziehung · {formatEuro(g.costCents)}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                    {g.remaining}/{g.maxPerDay}
                  </div>
                  {busy === "giveGift:" + g.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-coral shrink-0" />}
                </button>
              );
            })
          )}
          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70 px-1 pt-1">
            <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-coral/50" />
            <span>Weitere Aktivitäten wie „Romantischer Abend" oder „Kinoabend" findest du im Aktivitäten-Tab oben.</span>
          </div>
        </div>
      )}

      {/* Meilenstein-Tab */}
      {tab === "milestones" && (
        <div className="space-y-2">
          {status === "dating" && (
            <>
              <button
                onClick={() => action("proposeMarriage", "Antrag gestellt")}
                disabled={!canPropose || busy === "proposeMarriage"}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-coral/15 border border-coral/30 text-coral px-3 py-2.5 text-xs font-semibold hover:bg-coral/25 disabled:opacity-40 transition active:scale-[0.98]"
              >
                {busy === "proposeMarriage" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gem className="w-3.5 h-3.5" />}
                Heiratsantrag stellen (5.000 €)
              </button>
              {!canPropose && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {relationship < 70 ? "Beziehung muss mindestens 70/100 sein." : "Privatkonto reicht nicht (5.000 € nötig)."}
                </p>
              )}
            </>
          )}

          {status === "engaged" && (
            <>
              <button
                onClick={() => action("getMarried", "Hochzeit gefeiert")}
                disabled={!canMarry || busy === "getMarried"}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-coral text-ink px-3 py-2.5 text-xs font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
              >
                {busy === "getMarried" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Heart className="w-3.5 h-3.5" />}
                Hochzeit feiern (15.000 €)
              </button>
              {!canMarry && (
                <p className="text-[10px] text-muted-foreground text-center">Privatkonto reicht nicht (15.000 € nötig).</p>
              )}
            </>
          )}

          {status === "married" && !pregnancy && children.length < 4 && (
            <>
              <button
                onClick={() => action("planChild", "Kind geplant")}
                disabled={!canPlanChild || busy === "planChild"}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 border border-white/10 text-foreground px-3 py-2.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40 transition active:scale-[0.98]"
              >
                {busy === "planChild" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Baby className="w-3.5 h-3.5" />}
                Kind planen
              </button>
              {!canPlanChild && relationship < 75 && (
                <p className="text-[10px] text-muted-foreground text-center">Beziehung muss mindestens 75/100 sein.</p>
              )}
            </>
          )}
          {status === "married" && children.length >= 4 && (
            <p className="text-[10px] text-muted-foreground text-center">Maximale Kinderzahl erreicht.</p>
          )}

          {relationship < 75 && (
            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground/70 px-1 pt-1">
              <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-coral/50" />
              <span>Geschenke und gemeinsame Aktivitäten verbessern die Beziehung.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}