import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { BASIC_ACTIVITIES, getActivityOptions } from "@/lib/purchaseData";
import Drawer from "@/components/ui/Drawer";
import {
  Footprints, BookOpen, Heart, UtensilsCrossed, Music, Plane,
  Coffee, Bike, Dumbbell, Film, Car, Trees, Ship, Play, Ticket,
  Clock, Wallet, X, Sparkles,
} from "lucide-react";

const ACTIVITY_ICONS = {
  walk: Footprints, read: BookOpen, wellness: Heart, cooking: UtensilsCrossed,
  concert: Music, short_trip: Plane, coffee: Coffee, bike_ride: Bike,
  music: Music, fitness_home: Dumbbell, movie_night: Film, car_drive: Car,
  garden: Trees, boat_trip: Ship,
};

export default function ActivityPanel({ state, send, showToast }) {
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const activities = getActivityOptions(state);
  const active = (state.appointments || []).find(a => a.status === "active");
  const day = dayOf(state.gameTime);
  const dayActivities = (state.appointments || []).filter(a =>
    a.type === "leisure" && dayOf(a.startMin) === day && a.status !== "cancelled"
  ).length;
  const canStartMore = dayActivities < 2 && !active;

  async function handleStart(activityType, voucherId, itemId) {
    setSubmitting(true);
    try {
      await send("startPrivateActivity", { activityType, voucherId: voucherId || null, itemId: itemId || null });
      showToast("Aktivität gestartet.", "success");
      setSelectedActivity(null);
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      {active ? (
        <div className="glass border border-coral/20 rounded-xl p-4 text-center">
          <div className="text-sm text-coral font-medium">Aktivität läuft</div>
          <div className="text-xs text-muted-foreground mt-1">
            {active.label} · bis {formatGameTime(active.endMin)}
          </div>
        </div>
      ) : !canStartMore ? (
        <div className="text-center py-4 text-xs text-muted-foreground">
          Heute wurden bereits zwei Freizeitaktivitäten gestartet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {activities.map((act, i) => {
              const Icon = ACTIVITY_ICONS[act.type] || Play;
              const sameTypeToday = (state.appointments || []).some(a =>
                a.subtype === act.type && dayOf(a.startMin) === day && a.status !== "cancelled"
              );
              const matchingVouchers = (state.private?.rewards?.vouchers || []).filter(
                v => v.activityType === act.type && v.status === "available"
              );
              const hasVoucher = matchingVouchers.length > 0;
              const isBlocked = sameTypeToday || (act.maxPerWeek && (state.appointments || []).some(a =>
                a.subtype === act.type && a.startMin >= Math.floor(state.gameTime / 10080) * 10080 && a.status !== "cancelled"
              ));
              return (
                <button
                  key={act.type + (act.itemId || "") + i}
                  onClick={() => !isBlocked && setSelectedActivity(act)}
                  disabled={isBlocked}
                  className={`flex flex-col items-center gap-1.5 rounded-xl p-3 border transition text-center ${
                    isBlocked
                      ? "border-white/5 opacity-40 cursor-not-allowed"
                      : hasVoucher
                        ? "border-lime/30 bg-lime/5 hover:bg-lime/10 text-lime"
                        : "border-white/10 hover:border-coral/30 hover:bg-coral/5 text-foreground"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${hasVoucher ? "text-lime" : "text-muted-foreground"}`} />
                  <span className="text-[10px] font-medium">{act.label}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {act.durationMin / 60} Std.
                    {act.costCents > 0 ? ` · ${formatEuro(act.costCents)}` : " · kostenlos"}
                  </span>
                  {hasVoucher && <span className="text-[9px] text-lime flex items-center gap-0.5"><Ticket className="w-2.5 h-2.5" /> Gutschein</span>}
                  {act.source === "possession" && <span className="text-[9px] text-coral/70">{act.itemName}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Aktivitaets-Buchungs-Drawer */}
      <Drawer open={!!selectedActivity} onClose={() => setSelectedActivity(null)} title="Aktivität buchen" maxWidth="max-w-md">
        {selectedActivity && (
          <ActivityBookingForm
            activity={selectedActivity}
            state={state}
            onStart={handleStart}
            submitting={submitting}
            onClose={() => setSelectedActivity(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

function ActivityBookingForm({ activity, state, onStart, submitting, onClose }) {
  const [voucherId, setVoucherId] = useState("");
  const matchingVouchers = (state.private?.rewards?.vouchers || []).filter(
    v => v.activityType === activity.type && v.status === "available"
  );
  const effectiveCost = voucherId
    ? Math.max(0, activity.costCents - (matchingVouchers.find(v => v.id === voucherId)?.priceCentsCovered || 0))
    : activity.costCents;
  const Icon = ACTIVITY_ICONS[activity.type] || Play;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 rounded-lg bg-coral/5 border border-coral/15">
        <Icon className="w-5 h-5 text-coral" />
        <div>
          <div className="text-sm font-medium">{activity.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {activity.durationMin / 60} Std.
            {activity.source === "possession" && ` · ${activity.itemName}`}
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Dauer: {activity.durationMin / 60} Spielstunde(n)</div>
        <div className="flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Belastung {activity.stressDelta} / Zufriedenheit +{activity.happinessDelta}{activity.contactDelta ? ` / Kontakt +${activity.contactDelta}` : ""}</div>
      </div>
      {matchingVouchers.length > 0 && (
        <div>
          <label className="text-[11px] text-muted-foreground">Gutschein verwenden (optional)</label>
          <select value={voucherId} onChange={e => setVoucherId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-coral/50 outline-none">
            <option value="">Kein Gutschein</option>
            {matchingVouchers.map(v => (
              <option key={v.id} value={v.id}>Gutschein – übernimmt {formatEuro(v.priceCentsCovered)}</option>
            ))}
          </select>
        </div>
      )}
      <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Preis</span><span className="tabular-nums">{formatEuro(activity.costCents)}</span></div>
        {voucherId && <div className="flex justify-between text-lime"><span className="text-muted-foreground">Gutschein</span><span className="tabular-nums">−{formatEuro(matchingVouchers.find(v => v.id === voucherId)?.priceCentsCovered || 0)}</span></div>}
        <div className="flex justify-between border-t border-white/5 pt-1"><span className="text-muted-foreground">Zu zahlen</span><span className="tabular-nums font-medium">{formatEuro(effectiveCost)}</span></div>
      </div>
      <button
        onClick={() => onStart(activity.type, voucherId || null, activity.itemId || null)}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Play className="w-4 h-4" /> {effectiveCost > 0 ? `${formatEuro(effectiveCost)} bezahlen` : "Starten"}</>}
      </button>
    </div>
  );
}