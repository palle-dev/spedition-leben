import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf } from "@/lib/gameData";
import { getCatalogEntry, getResalePrice, CATEGORY_LABELS } from "@/lib/purchaseData";
import Drawer from "@/components/ui/Drawer";
import {
  Sofa, Watch, Palette, Car, Ship, Home, Tag, Check, X,
  Sparkles, Wallet, TrendingDown, Clock, Play,
} from "lucide-react";

const CAT_ICONS = {
  furnishing: Sofa, watch: Watch, art: Palette, vehicle: Car, boat: Ship, property: Home,
};

export default function PossessionsSection({ state, send, showToast }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [activityItem, setActivityItem] = useState(null);
  const items = state.private?.purchases?.items || [];
  const active = items.filter(i => i.status === "active");
  const sold = items.filter(i => i.status === "sold");

  async function handleSell(itemId) {
    try {
      const r = await send("sellPurchase", { itemId });
      showToast(`Verkauft für ${formatEuro(r.salePriceCents)}.`, "success");
      setSelectedItem(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleStartActivity(activityType, itemId, voucherId) {
    try {
      const r = await send("startPrivateActivity", { activityType, itemId, voucherId: voucherId || null });
      showToast(`Aktivität gestartet: ${formatGameTime(state.gameTime)} bis ${formatGameTime(state.gameTime + (r.appointmentId ? 0 : 0))}.`, "success");
      setActivityItem(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  if (active.length === 0 && sold.length === 0) {
    return (
      <div className="text-center py-8">
        <Home className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <div className="text-sm text-muted-foreground">Noch kein privater Besitz.</div>
        <div className="text-[10px] text-muted-foreground/70 mt-1">Im Anschaffungskatalog kannst du Gegenstände kaufen.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Aktiver Besitz */}
      {active.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Mein Besitz</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {active.map(item => {
              const entry = getCatalogEntry(item.catalogId);
              const Icon = CAT_ICONS[entry?.category] || Tag;
              const isHome = state.private?.purchases?.activeHomeId === item.id;
              return (
                <div key={item.id} className="glass border border-white/10 rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {CATEGORY_LABELS[item.category]}
                        {isHome && <span className="text-lime ml-1">· Hauptwohnsitz</span>}
                      </div>
                      {item.maintenancePerDayCents > 0 && (
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                          <Wallet className="w-2.5 h-2.5" /> {formatEuro(item.maintenancePerDayCents)}/Tag
                        </div>
                      )}
                    </div>
                  </div>
                  {entry?.activity && (
                    <button
                      onClick={() => setActivityItem(item)}
                      className="w-full mt-2.5 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-coral/10 border border-coral/20 text-coral text-xs font-medium hover:bg-coral/20 transition"
                    >
                      <Play className="w-3 h-3" /> {entry.activity.label}
                    </button>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setSelectedItem(item)} className="flex-1 text-xs py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-foreground transition">
                      Details
                    </button>
                    <button onClick={() => handleSell(item.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-400/40 hover:text-red-300 text-xs text-foreground transition">
                      <TrendingDown className="w-3 h-3" /> {formatEuro(getResalePrice(item))}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Verkaufte Gegenstaende */}
      {sold.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Verkauft</h2>
          <div className="flex flex-wrap gap-2">
            {sold.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-2/30 border border-white/5 text-xs text-muted-foreground">
                {item.name} · {formatEuro(item.salePriceCents)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail-Drawer */}
      <Drawer open={!!selectedItem} onClose={() => setSelectedItem(null)} title="Besitzdetails" maxWidth="max-w-md">
        {selectedItem && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-2/50 border border-white/5">
              {React.createElement(CAT_ICONS[selectedItem.category] || Tag, { className: "w-5 h-5 text-muted-foreground" })}
              <div>
                <div className="text-sm font-medium">{selectedItem.name}</div>
                <div className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[selectedItem.category]}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Kaufpreis</div>
                <div className="text-sm font-medium tabular-nums">{formatEuro(selectedItem.purchasePriceCents)}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Verkaufswert</div>
                <div className="text-sm font-medium tabular-nums">{formatEuro(getResalePrice(selectedItem))}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Unterhalt/Tag</div>
                <div className="text-sm font-medium tabular-nums">{selectedItem.maintenancePerDayCents > 0 ? formatEuro(selectedItem.maintenancePerDayCents) : "—"}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/30 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Gekauft am</div>
                <div className="text-sm font-medium">Tag {dayOf(selectedItem.purchasedAtMin)}</div>
              </div>
            </div>
            <button onClick={() => handleSell(selectedItem.id)} className="w-full flex items-center justify-center gap-2 bg-red-500/15 border border-red-400/30 text-red-200 rounded-lg py-3 font-semibold text-sm hover:bg-red-500/25 transition">
              <TrendingDown className="w-4 h-4" /> Für {formatEuro(getResalePrice(selectedItem))} verkaufen
            </button>
          </div>
        )}
      </Drawer>

      {/* Aktivitaets-Drawer */}
      <Drawer open={!!activityItem} onClose={() => setActivityItem(null)} title="Aktivität starten" maxWidth="max-w-md">
        {activityItem && (
          <ActivityBookingForm
            item={activityItem}
            state={state}
            onStart={handleStartActivity}
            onClose={() => setActivityItem(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

function ActivityBookingForm({ item, state, onStart, onClose }) {
  const entry = getCatalogEntry(item.catalogId);
  const activity = entry?.activity;
  const [voucherId, setVoucherId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!activity) return null;

  const matchingVouchers = (state.private?.rewards?.vouchers || []).filter(
    v => v.activityType === activity.type && v.status === "available"
  );

  const effectiveCost = voucherId
    ? Math.max(0, activity.costCents - (matchingVouchers.find(v => v.id === voucherId)?.priceCentsCovered || 0))
    : activity.costCents;

  async function submit() {
    setSubmitting(true);
    try {
      await onStart(activity.type, item.id, voucherId || null);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-coral/5 border border-coral/15">
        <div className="text-sm font-medium text-coral">{activity.label}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {activity.durationMin / 60} Std. · Belastung {activity.stressDelta} · Zufriedenheit +{activity.happinessDelta}
          {activity.contactDelta ? ` · Kontakt +${activity.contactDelta}` : ""}
        </div>
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
        <div className="flex justify-between"><span className="text-muted-foreground">Originalpreis</span><span className="tabular-nums">{formatEuro(activity.costCents)}</span></div>
        {voucherId && <div className="flex justify-between text-lime"><span className="text-muted-foreground">Gutschein</span><span className="tabular-nums">−{formatEuro(matchingVouchers.find(v => v.id === voucherId)?.priceCentsCovered || 0)}</span></div>}
        <div className="flex justify-between border-t border-white/5 pt-1"><span className="text-muted-foreground">Zu zahlen</span><span className="tabular-nums font-medium">{formatEuro(effectiveCost)}</span></div>
      </div>
      <button onClick={submit} disabled={submitting} className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Play className="w-4 h-4" /> Starten</>}
      </button>
    </div>
  );
}