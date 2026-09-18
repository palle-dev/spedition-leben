import React, { useState } from "react";
import { formatEuro } from "@/lib/gameData";
import { PURCHASE_CATALOG, CATEGORY_LABELS, getCatalogEntry } from "@/lib/purchaseData";
import Drawer from "@/components/ui/Drawer";
import {
  Sofa, Watch, Palette, Car, Ship, Home, Check, Tag,
  Sparkles, Wallet,
} from "lucide-react";

const CAT_ICONS = {
  furnishing: Sofa, watch: Watch, art: Palette, vehicle: Car, boat: Ship, property: Home,
};

export default function PurchaseCatalog({ state, send, showToast }) {
  const [category, setCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [preview, setPreview] = useState(null);
  const items = state.private?.purchases?.items || [];

  const filtered = category === "all" ? PURCHASE_CATALOG : PURCHASE_CATALOG.filter(p => p.category === category);

  async function handleBuy(catalogId) {
    try {
      await send("buyPurchase", { catalogId });
      const entry = getCatalogEntry(catalogId);
      showToast(`${entry.name} gekauft.`, "success");
      setPreview(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handlePreview(catalogId) {
    try {
      const r = await send("previewPurchase", { catalogId });
      setPreview({ ...r, entry: getCatalogEntry(catalogId) });
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleSell(itemId) {
    try {
      const r = await send("sellPurchase", { itemId });
      showToast(`Verkauft für ${formatEuro(r.salePriceCents)}.`, "success");
      setSelectedItem(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  const categories = ["all", ...Object.keys(CATEGORY_LABELS)];

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              category === c ? "bg-coral/15 border-coral/30 text-coral" : "border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {c === "all" ? "Alle" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Katalog */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(entry => {
          const Icon = CAT_ICONS[entry.category] || Tag;
          const owned = items.some(i => i.catalogId === entry.id && i.status === "active");
          const sold = items.some(i => i.catalogId === entry.id && i.status === "sold");
          return (
            <div key={entry.id} className={`glass border rounded-xl p-4 ${owned ? "border-lime/20" : "border-white/10"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                {owned && <span className="text-[10px] px-2 py-0.5 rounded-full bg-lime/15 text-lime">Im Besitz</span>}
                {sold && !owned && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">Verkauft</span>}
              </div>
              <div className="text-sm font-medium">{entry.name}</div>
              <div className="text-lg font-medium tabular-nums mt-1">{formatEuro(entry.priceCents)}</div>
              {entry.maintenancePerDayCents > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Wallet className="w-2.5 h-2.5" /> Unterhalt: {formatEuro(entry.maintenancePerDayCents)}/Tag
                </div>
              )}
              {entry.activity && (
                <div className="text-[10px] text-coral/80 mt-1 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> {entry.activity.label}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground/70 mt-1">
                Verkauf: {Math.round(entry.resaleFactor * 100)} % des Kaufpreises
              </div>
              {!owned && !sold && (
                <button
                  onClick={() => handlePreview(entry.id)}
                  className="w-full mt-3 py-2 rounded-lg bg-coral/10 border border-coral/20 text-coral text-xs font-medium hover:bg-coral/20 transition"
                >
                  Kaufdetails
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Kaufvorschau Drawer */}
      <Drawer open={!!preview} onClose={() => setPreview(null)} title="Kaufdetails" maxWidth="max-w-md">
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center">
                {React.createElement(CAT_ICONS[preview.entry.category] || Tag, { className: "w-5 h-5 text-coral" })}
              </div>
              <div>
                <div className="text-base font-medium">{preview.entry.name}</div>
                <div className="text-xs text-muted-foreground">{CATEGORY_LABELS[preview.entry.category]}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-2/50 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Kaufpreis</div>
                <div className="text-sm font-medium tabular-nums">{formatEuro(preview.entry.priceCents)}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/50 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Unterhalt/Tag</div>
                <div className="text-sm font-medium tabular-nums">{preview.entry.maintenancePerDayCents > 0 ? formatEuro(preview.entry.maintenancePerDayCents) : "—"}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/50 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Verkaufswert</div>
                <div className="text-sm font-medium tabular-nums">{formatEuro(Math.round(preview.entry.priceCents * preview.entry.resaleFactor))}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface-2/50 border border-white/5">
                <div className="text-[10px] text-muted-foreground">Privatkonto</div>
                <div className="text-sm font-medium tabular-nums">{formatEuro(state.private?.accountCents || 0)}</div>
              </div>
            </div>
            {preview.entry.activity && (
              <div className="p-3 rounded-lg bg-coral/5 border border-coral/15 text-xs">
                <div className="flex items-center gap-1.5 text-coral font-medium mb-1">
                  <Sparkles className="w-3 h-3" /> Aktivität: {preview.entry.activity.label}
                </div>
                <div className="text-muted-foreground">
                  {preview.entry.activity.durationMin / 60} Std. · {preview.entry.activity.costCents > 0 ? formatEuro(preview.entry.activity.costCents) : "kostenlos"} ·
                  Belastung {preview.entry.activity.stressDelta} / Zufriedenheit +{preview.entry.activity.happinessDelta}
                </div>
              </div>
            )}
            {preview.canBuy ? (
              <button onClick={() => handleBuy(preview.entry.id)} className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 transition">
                <Check className="w-4 h-4" /> Für {formatEuro(preview.entry.priceCents)} kaufen
              </button>
            ) : (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20 text-xs text-red-200">
                {preview.reason}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}