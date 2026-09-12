import React from "react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { capacityLabel, profileLabel, applicantExpiryStatus, availabilityLabel } from "@/lib/personnelMarketData";
import Portrait from "@/components/ui/Portrait";
import { MapPin, Clock, Star, UserPlus, Info } from "lucide-react";

// Einzelne Bewerber-Karte für den Personalmarkt.
export default function ApplicantCard({ app, state, onHire, onWatch, onDetails, busy, disabled, watched }) {
  const roleDef = app.role;
  const hireFee = app.hireFeeCents || 0;
  const dailyWage = app.costPerDayCents || 0;
  const expiry = applicantExpiryStatus(app, state.gameTime);
  const avail = availabilityLabel(app, state.gameTime);
  const cap = capacityLabel(app.role, app.capacity);

  return (
    <div className="glass border border-white/10 rounded-xl p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <Portrait portraitId={app.portraitId} name={app.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{app.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
            {roleLabel(app.role)}
            <span className="text-foreground/30">·</span>
            <span className="text-foreground/60">{profileLabel(app.role)}</span>
          </div>
          {cap && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">{cap}</div>
          )}
        </div>
        <button
          onClick={onWatch}
          className={`shrink-0 p-1.5 rounded-lg transition ${watched ? "text-lime bg-lime/10" : "text-muted-foreground hover:text-foreground"}`}
          aria-label={watched ? "Von Merkliste entfernen" : "Merken"}
        >
          <Star className="w-3.5 h-3.5" fill={watched ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="w-3 h-3 text-foreground/40" /> {app.locationCity}
        </div>
        <div className={`flex items-center gap-1.5 ${avail.color}`}>
          <Clock className="w-3 h-3" /> {avail.label}
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Einstellung</div>
          <div className="font-medium tabular-nums">{formatEuro(hireFee)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Tageslohn</div>
          <div className="font-medium tabular-nums">{formatEuro(dailyWage)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px]">
        <span className="text-muted-foreground/70">Ablauf: {expiry.label}</span>
        <span className={expiry.color}>{expiry.label}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={onDetails}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition"
        >
          <Info className="w-3.5 h-3.5" /> Details
        </button>
        <button
          onClick={onHire}
          disabled={busy || disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-lime text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
        >
          {busy ? <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><UserPlus className="w-3.5 h-3.5" /> Einstellen</>}
        </button>
      </div>
    </div>
  );
}