import { describe, it, expect } from 'vitest';
import { ALL_INSTRUMENT_DEFS } from '../base44/shared/investmentEngine';
import { stakePosition, unstakePosition, processStaking } from '../base44/shared/investmentStaking';

function fixture() {
  const def = ALL_INSTRUMENT_DEFS.find(d => d.type === 'crypto' && d.stakingRate)!;
  const position = { qty: 10, availableQty: 10, stakedQty: 0, totalCostCents: 10000, realizedPnlCents: 0, lots: [], staking: [] };
  const state = { gameTime: 480, idCounter: 100, investment: {
    market: { instruments: { [def.id]: { currentQuote: { mid: 1000 } } } },
    depots: { company: { positions: { [def.id]: position } } },
  } };
  const params = { depotId: 'company', instrumentId: def.id };
  return { state, position, params };
}

describe('staking quantity conservation and release', () => {
  it('releases a full unstake at its deadline exactly once', () => {
    const { state, position, params } = fixture();
    stakePosition(state, { ...params, qty: 10 });
    const { releaseMin } = unstakePosition(state, params);
    const log = [];
    processStaking(state, releaseMin - 1, log);
    expect(position.availableQty).toBe(0);
    processStaking(state, releaseMin, log);
    expect(position.availableQty).toBe(10);
    expect(position.stakedQty).toBe(0);
    processStaking(state, releaseMin + 60, log);
    expect(position.availableQty).toBe(10);
    expect(log.filter(e => e.type === 'investment_unstaking_released')).toHaveLength(1);
  });

  it('keeps a partial remainder active and reward eligible', () => {
    const { state, position, params } = fixture();
    stakePosition(state, { ...params, qty: 10 });
    unstakePosition(state, { ...params, qty: 3 });
    expect(position.stakedQty).toBe(7);
    expect(position.staking.find(s => s.status === 'active').qty).toBe(7);
    expect(position.staking.find(s => s.status === 'unstaking').qty).toBe(3);
    processStaking(state, 540, []);
    expect(position.qty).toBeGreaterThan(10);
    expect(position.availableQty).toBeCloseTo(position.qty - 10, 7);
    expect(position.lots).toHaveLength(1);
    const { releaseMin } = unstakePosition(state, params);
    const before = position.availableQty;
    processStaking(state, releaseMin, []);
    expect(position.availableQty).toBeCloseTo(before + 10, 7);
    expect(position.stakedQty).toBe(0);
  });

  it.each([NaN, Infinity, -1, 0, 11])('rejects invalid stake quantity %s without mutation', qty => {
    const { state, params } = fixture();
    const before = structuredClone(state);
    expect(() => stakePosition(state, { ...params, qty })).toThrow();
    expect(state).toEqual(before);
  });

  it.each([NaN, Infinity, -1, 0, 11])('rejects invalid unstake quantity %s without mutation', qty => {
    const { state, params } = fixture();
    stakePosition(state, { ...params, qty: 10 });
    const before = structuredClone(state);
    expect(() => unstakePosition(state, { ...params, qty })).toThrow();
    expect(state).toEqual(before);
  });

  it('recovers an old partial unstake without losing its active remainder', () => {
    const { state, position, params } = fixture();
    stakePosition(state, { ...params, qty: 10 });
    Object.assign(position.staking[0], { status: 'unstaking', unstakeQty: 3, releaseMin: 600 });
    position.stakedQty = 7;
    const log = [];
    processStaking(state, 600, log);
    expect(position.staking.find(s => s.status === 'active').qty).toBe(7);
    expect(position.availableQty).toBeGreaterThanOrEqual(3);
    expect(position.stakedQty).toBe(7);
    processStaking(state, 660, log);
    expect(log.filter(e => e.type === 'investment_unstaking_released')).toHaveLength(1);
  });
});
