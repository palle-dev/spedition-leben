// Staking-Engine für Krypto-Investments.
// Auftrag 34 – I13 (Staking).

import { ALL_INSTRUMENT_DEFS, getDepot, uid } from "./investmentEngine.ts";
import { postJournal } from "./accountingEngine.ts";

// Staking: Krypto-Positionen können gestakt werden.
// Vergütung: stakingRate * stakeQty * (zeitAnteil / 360 Tagen)
// Staking-Menge ist nicht frei verkäuflich.
// Unstaking: 72 Spielstunden (3 Tage) bis Menge wieder frei.

const UNSTAKING_DURATION_MIN = 72 * 60; // 3 Spieltage

export function stakePosition(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const inst = state.investment.market.instruments[p.instrumentId];
  if (!inst) throw new Error("Instrument nicht gefunden.");
  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === p.instrumentId);
  if (!def) throw new Error("Instrument nicht gefunden.");
  if (def.type !== "crypto") throw new Error("Staking nur für Krypto verfügbar.");
  if (!def.stakingRate) throw new Error("Dieses Instrument unterstützt kein Staking.");

  const pos = depot.positions[p.instrumentId];
  if (!pos) throw new Error("Keine Position vorhanden.");
  const qty = p.qty;
  if (!qty || qty <= 0) throw new Error("Menge muss positiv sein.");
  if (qty > pos.availableQty) throw new Error(`Freie Menge reicht nicht aus (verfügbar: ${pos.availableQty}).`);

  // Staking starten
  pos.availableQty -= qty;
  pos.stakedQty = (pos.stakedQty || 0) + qty;
  pos.staking = pos.staking || [];
  pos.staking.push({
    id: uid(state, "st"),
    qty,
    startMin: state.gameTime,
    stakingRate: def.stakingRate,
    status: "active",
    unstakeMin: null,
    releaseMin: null,
    accumulatedRewardQty: 0,
  });

  return { ok: true, stakedQty: pos.stakedQty, availableQty: pos.availableQty };
}

export function unstakePosition(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const pos = depot.positions[p.instrumentId];
  if (!pos) throw new Error("Keine Position vorhanden.");
  if (!pos.staking || pos.staking.length === 0) throw new Error("Kein aktives Staking.");

  const qty = p.qty || pos.stakedQty;
  let remaining = qty;
  const releaseMin = state.gameTime + UNSTAKING_DURATION_MIN;

  for (const s of pos.staking) {
    if (s.status !== "active") continue;
    if (remaining <= 0) break;
    const unstakeQty = Math.min(remaining, s.qty);
    s.status = "unstaking";
    s.unstakeMin = state.gameTime;
    s.releaseMin = releaseMin;
    s.unstakeQty = unstakeQty;
    remaining -= unstakeQty;
  }

  pos.stakedQty = (pos.stakedQty || 0) - qty;
  return { ok: true, releaseMin };
}

// Staking-Vergütung bei jedem Tick verarbeiten
export function processStaking(state, min, log) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;

    for (const [instId, pos] of Object.entries(depot.positions)) {
      if (!pos.staking || pos.staking.length === 0) continue;
      const def = ALL_INSTRUMENT_DEFS.find(d => d.id === instId);
      if (!def || !def.stakingRate) continue;
      const inst = state.investment.market.instruments[instId];
      if (!inst) continue;

      for (const s of pos.staking) {
        if (s.status !== "active") continue;

        // Vergütung: stakingRate * qty * (tickInterval / (360 * 1440))
        // Bei stündlichem Tick: stakingRate * qty * (60 / (360 * 1440))
        const tickIntervalMin = 60;
        const annualMin = 360 * 1440;
        const rewardQty = s.qty * def.stakingRate * (tickIntervalMin / annualMin);

        if (rewardQty > 0) {
          s.accumulatedRewardQty = (s.accumulatedRewardQty || 0) + rewardQty;
          // Vergütung zur Position hinzufügen (nur wenn > Mindeststückelung)
          const precision = 0.00000001;
          const roundedReward = Math.floor(rewardQty / precision) * precision;
          if (roundedReward > 0) {
            pos.qty += roundedReward;
            pos.availableQty += roundedReward;
            // Lot für Staking-Reward
            pos.lots.push({
              qty: roundedReward,
              costPerUnitCents: inst.currentQuote.mid,
              feeCents: 0,
              acquiredAtMin: min,
              totalCostCents: 0, // Keine Kostenbasis für Rewards
            });
            log.push({ type: "investment_staking_reward", depotId, instrumentId: instId, rewardQty: roundedReward, min });
          }
        }

        // Unstaking-Freigabe prüfen
        if (s.status === "unstaking" && s.releaseMin && s.releaseMin <= min) {
          pos.availableQty += s.unstakeQty;
          s.status = "released";
          s.releasedAtMin = min;
          log.push({ type: "investment_unstaking_released", depotId, instrumentId: instId, qty: s.unstakeQty, min });
        }
      }

      // Abgeschlossene Staking-Einträge aufräumen
      pos.staking = pos.staking.filter(s => s.status !== "released" || s.accumulatedRewardQty > 0);
    }
  }
}

export function getStakingStatus(state, depotId, instrumentId) {
  const depot = getDepot(state, depotId);
  if (!depot) return null;
  const pos = depot.positions[instrumentId];
  if (!pos) return null;
  return {
    stakedQty: pos.stakedQty || 0,
    availableQty: pos.availableQty,
    stakingEntries: (pos.staking || []).map(s => ({
      id: s.id,
      qty: s.qty,
      startMin: s.startMin,
      status: s.status,
      unstakeMin: s.unstakeMin,
      releaseMin: s.releaseMin,
      accumulatedRewardQty: s.accumulatedRewardQty || 0,
      stakingRate: s.stakingRate,
    })),
  };
}