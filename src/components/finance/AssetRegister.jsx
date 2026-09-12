import React from "react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { periodOf } from "@/lib/accountingData";
import { Package, TrendingDown } from "lucide-react";

export default function AssetRegister({ state }) {
  const assets = state.accounting?.assets || [];
  const currentPeriod = periodOf(state.gameTime);

  if (assets.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-8 text-center">
        <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-medium">Keine Anlagen registriert</h3>
        <p className="text-sm text-muted-foreground mt-1">Beim Kauf von Fahrzeugen werden diese automatisch im Anlagenregister erfasst.</p>
      </div>
    );
  }

  const totalAcquisition = assets.reduce((s, a) => s + a.acquisitionCostCents, 0);
  const totalDepreciation = assets.reduce((s, a) => s + a.accumulatedDepreciationCents, 0);
  const totalBookValue = assets.reduce((s, a) => s + a.bookValueCents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="glass border border-white/10 rounded-xl p-3">
          <div className="text-xs text-muted-foreground">Anschaffungskosten</div>
          <div className="text-base font-medium tabular-nums mt-1">{formatEuro(totalAcquisition)}</div>
        </div>
        <div className="glass border border-white/10 rounded-xl p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Abschreibung kum.</div>
          <div className="text-base font-medium tabular-nums text-red-300 mt-1">−{formatEuro(totalDepreciation)}</div>
        </div>
        <div className="glass border border-white/10 rounded-xl p-3">
          <div className="text-xs text-muted-foreground">Buchwert gesamt</div>
          <div className="text-base font-medium tabular-nums text-lime mt-1">{formatEuro(totalBookValue)}</div>
        </div>
      </div>

      <div className="space-y-2">
        {assets.map(asset => {
          const vehicle = state.vehicles?.find(v => v.id === asset.vehicleId);
          const isDisposed = asset.disposedAtMin !== null;
          const depRate = asset.monthlyDepreciationCents || 0;
          return (
            <div key={asset.id} className={`glass border rounded-xl p-4 ${isDisposed ? "border-white/5 opacity-50" : "border-white/10"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground/50 tabular-nums">{asset.id}</span>
                    {isDisposed && <span className="rounded-full bg-white/5 text-muted-foreground text-xs px-2 py-0.5">Veräußert</span>}
                  </div>
                  <div className="text-sm font-medium mt-1">{asset.name}</div>
                  <div className="text-xs text-muted-foreground/60 mt-0.5">
                    {accountName(asset.account)} · Anschaffung {formatGameTime(asset.acquiredAtMin)} (Periode {asset.acquiredPeriod})
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-medium tabular-nums text-lime">{formatEuro(asset.bookValueCents)}</div>
                  <div className="text-xs text-muted-foreground/50 tabular-nums">von {formatEuro(asset.acquisitionCostCents)}</div>
                </div>
              </div>
              {!isDisposed && depRate > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground/50">Monats-AfA</div>
                    <div className="tabular-nums text-red-300/80 mt-0.5">−{formatEuro(depRate)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/50">Kum. AfA</div>
                    <div className="tabular-nums text-red-300/80 mt-0.5">−{formatEuro(asset.accumulatedDepreciationCents)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/50">AfA ab</div>
                    <div className="tabular-nums text-muted-foreground mt-0.5">Periode {asset.depreciationStartMonth}</div>
                  </div>
                </div>
              )}
              {isDisposed && asset.disposalPriceCents != null && (
                <div className="mt-2 text-xs text-muted-foreground/60">
                  Veräußert für {formatEuro(asset.disposalPriceCents)} am {formatGameTime(asset.disposedAtMin)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function accountName(no) {
  const names = {
    "1200": "Eigene Lkw",
    "1210": "Werkstattausstattung",
    "1220": "Weitere Betriebsanlagen",
  };
  return names[no] || no;
}