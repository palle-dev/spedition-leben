import React, { useState } from "react";
import { ACHIEVEMENTS } from "@/lib/achievementCatalog";
import { REWARDS, REWARD_SLOTS, SLOT_LABELS, getRewardById } from "@/lib/rewardData";
import {
  Award, Ticket, Palette, BookHeart, DoorOpen, Car, Frame, Lock, Gift, X,
} from "lucide-react";

const TYPE_ICONS = {
  cosmetic_title: Award,
  cosmetic_border: Frame,
  cosmetic_decoration: Palette,
  cosmetic_album: BookHeart,
  cosmetic_entrance: DoorOpen,
  cosmetic_garage: Car,
  voucher: Ticket,
};

export default function RewardsSection({ state, send, showToast }) {
  const [selectedReward, setSelectedReward] = useState(null);
  const [showEquipped, setShowEquipped] = useState(false);
  const claims = state.private?.rewards?.claims || {};
  const cosmetics = state.private?.rewards?.cosmetics || {};
  const vouchers = state.private?.rewards?.vouchers || [];

  const available = REWARDS.filter(r => claims[r.id]?.status === "available");
  const claimed = REWARDS.filter(r => claims[r.id]?.status === "claimed");
  const locked = REWARDS.filter(r => !claims[r.id]);

  async function handleClaim(rewardId) {
    try {
      const r = await send("claimReward", { rewardId });
      const reward = getRewardById(rewardId);
      showToast(`${reward.title} abgeholt.`, "success");
      setSelectedReward(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleClaimAll() {
    try {
      const r = await send("claimAllRewards", {});
      showToast(`${r.claimed.length} Belohnung(en) abgeholt.`, "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleEquip(rewardId) {
    try {
      await send("equipCosmetic", { rewardId });
      showToast("Ausgerüstet.", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleUnequip(slot) {
    try {
      await send("unequipCosmetic", { slot });
      showToast("Abgelegt.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="space-y-5">
      {/* Verfuegbare Belohnungen */}
      {available.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-lime" /> Bereit zum Abholen
            </h2>
            <button onClick={handleClaimAll} className="text-xs px-3 py-1.5 rounded-lg bg-lime/15 border border-lime/30 text-lime font-medium hover:bg-lime/25 transition">
              Alle abholen
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {available.map(r => {
              const Icon = TYPE_ICONS[r.type] || Award;
              return (
                <div key={r.id} className="glass border border-lime/20 rounded-xl p-3 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-lime/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-lime" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{r.desc}</div>
                  </div>
                  <button onClick={() => handleClaim(r.id)} className="shrink-0 px-3 py-1.5 rounded-lg bg-lime text-ink text-xs font-semibold hover:brightness-110 transition">
                    Abholen
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Meine Belohnungen (abgeholt) */}
      {claimed.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" /> Meine Belohnungen
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {claimed.map(r => {
              const Icon = TYPE_ICONS[r.type] || Award;
              const isEquipped = r.slot && cosmetics[r.slot] === r.id;
              const hasVoucher = r.type === "voucher" && vouchers.some(v => v.rewardId === r.id);
              return (
                <div key={r.id} className={`glass border rounded-xl p-3 flex items-start gap-3 ${isEquipped ? "border-lime/30" : "border-white/10"}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isEquipped ? "bg-lime/15" : "bg-surface-2"}`}>
                    <Icon className={`w-4 h-4 ${isEquipped ? "text-lime" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {r.type === "voucher" ? "Gutschein" : SLOT_LABELS[r.slot] || "Kosmetik"}
                      {isEquipped && <span className="text-lime ml-1">· ausgerüstet</span>}
                      {r.type === "voucher" && hasVoucher && <span className="text-amber-300 ml-1">· verfügbar</span>}
                    </div>
                  </div>
                  {r.slot && (
                    <button
                      onClick={() => isEquipped ? handleUnequip(r.slot) : handleEquip(r.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        isEquipped
                          ? "border border-white/10 text-muted-foreground hover:text-foreground"
                          : "bg-lime/15 border border-lime/30 text-lime hover:bg-lime/25"
                      }`}
                    >
                      {isEquipped ? "Ablegen" : "Anlegen"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ausgeruestete Gestaltung */}
      {Object.values(cosmetics).some(v => v !== null) && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Aktive Gestaltung</h2>
          <div className="flex flex-wrap gap-2">
            {REWARD_SLOTS.filter(s => cosmetics[s]).map(slot => {
              const reward = getRewardById(cosmetics[slot]);
              const Icon = TYPE_ICONS[reward?.type] || Award;
              return (
                <div key={slot} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2/50 border border-white/10 text-xs">
                  <Icon className="w-3.5 h-3.5 text-lime" />
                  <span className="text-muted-foreground">{SLOT_LABELS[slot]}:</span>
                  <span className="font-medium">{reward?.title}</span>
                  <button onClick={() => handleUnequip(slot)} className="ml-1 text-muted-foreground/50 hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gesperrte Belohnungen mit Fortschritt */}
      {locked.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Noch gesperrt
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {locked.map(r => {
              const Icon = TYPE_ICONS[r.type] || Award;
              const ach = ACHIEVEMENTS.find(a => a.id === r.achievementId);
              return (
                <div key={r.id} className="glass border border-white/5 rounded-xl p-3 opacity-60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium truncate">{r.title}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2">{r.desc}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1.5">
                    Bedingung: {ach?.title || r.achievementId}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {available.length === 0 && claimed.length === 0 && locked.length === 0 && (
        <div className="text-center py-8">
          <Gift className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Noch keine Belohnungen verfügbar.</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">Erfülle Erfolge im Privatleben, um Belohnungen freizuschalten.</div>
        </div>
      )}
    </div>
  );
}