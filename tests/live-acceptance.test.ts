import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACHIEVEMENTS, GOAL_TEMPLATES } from '@/lib/achievementCatalog';
import { ACHIEVEMENTS as ENGINE_ACHIEVEMENTS, GOAL_TEMPLATES as ENGINE_GOALS } from '@/lib/simulation/achievementCatalog';
import { getAchievementSummary } from '@/lib/progressEngine';
import { getGrowthInfo } from '@/lib/officeData';
import { checkAchievements } from '@/lib/simulation/progressEngine';
import CloudSyncSection from '@/components/game/CloudSyncSection';
import Efficiency from '@/pages/Efficiency';

vi.mock('@/lib/gameContext', () => ({
  useGame: () => ({
    state: {},
    syncMeta: { status: 'synced' },
    cloudSaves: [{ id: 'test-cloud', save_label: 'Prüfkopie', game_time_min: 41135 }],
    cloudLoading: false,
  }),
}));
vi.mock('@/lib/efficiencyData', () => ({
  getVehicleEfficiency: () => [],
  getDriverEfficiency: () => [],
  getEfficiencyActionItems: () => [],
  getEfficiencyKPIs: () => ({
    tripCount: 279, emptyRatio: 0.1, productiveRatio: 0.36,
    handlingRatio: 0.21, totalKm: 64310, totalHours: 2694, revenuePerKm: 550,
  }),
}));

describe('Live-Abnahme: Erfolgsanzeige und Eigentumsregeln', () => {
  it('zeigt alle 35 Engine-Erfolge mit identischen Metadaten', () => {
    const metadata = list => list.map(({id, title, desc, category, xp}) => ({id, title, desc, category, xp}));
    expect(metadata(ACHIEVEMENTS)).toEqual(metadata(ENGINE_ACHIEVEMENTS));
    expect(ACHIEVEMENTS).toHaveLength(35);
  });

  it.each([0, 1, 9, 10])('zeigt Gefahrgut-Fortschritt bei %s Lieferungen konsistent', deliveries => {
    const s = { stats: { dgDeliveries: deliveries } };
    for (const id of ['dg_first', 'dg_ten']) {
      const ui = ACHIEVEMENTS.find(a => a.id === id)!;
      const engine = ENGINE_ACHIEVEMENTS.find(a => a.id === id)!;
      expect(ui.condition(s, {})).toBe(engine.condition(s, {}));
      expect(ui.progress(s, {})).toEqual(engine.progress(s, {}));
    }
  });

  it.each([['fleet_four', 4], ['fleet_ten', 10], ['fleet_twentyfive', 25]])(
    '%s zählt nur aktive eigene Fahrzeuge', (id, threshold) => {
      const n = Number(threshold);
      const vehicles = [
        ...Array.from({length: n - 1}, (_, i) => ({id: 'own-' + i, status: 'idle'})),
        {id: 'leased', ownership_type: 'leased', status: 'idle'},
        {id: 'rented', ownership_type: 'rented', status: 'idle'},
        {id: 'sold', ownership_type: 'owned', status: 'sold'},
        {id: 'archived', ownership_type: 'owned', status: 'archived'},
      ];
      for (const catalog of [ACHIEVEMENTS, ENGINE_ACHIEVEMENTS]) {
        const def = catalog.find(a => a.id === id)!;
        expect(def.condition({vehicles}, {})).toBe(false);
        expect(def.progress({vehicles}, {})).toEqual({current: n - 1, target: n});
        const owned = [...vehicles, {id: 'last', ownership_type: 'owned', status: 'maintenance'}];
        expect(def.condition({vehicles: owned}, {})).toBe(true);
        expect(def.progress({vehicles: owned}, {})).toEqual({current: n, target: n});
      }
    },
  );

  it('verlangt auch für die operative zweite Filiale einen eigenen Lkw', () => {
    const s = {
      gameTime: 14400,
      branches: ['b1', 'b2'].map(id => ({id, status: 'active', stats: {deliveries: 1}})),
      drivers: ['b1', 'b2'].map(branchId => ({branchId, employmentStatus: 'employed'})),
      vehicles: [{branchId: 'b1', ownership_type: 'owned', status: 'idle'},
        {branchId: 'b2', ownership_type: 'leased', status: 'idle'}],
    };
    for (const catalog of [GOAL_TEMPLATES, ENGINE_GOALS]) {
      const goal = catalog.find(g => g.id === 'g_branch_growth')!;
      expect(goal.evaluate(s)).toMatchObject({current: 1, completed: false});
      s.vehicles[1].ownership_type = 'owned';
      expect(goal.evaluate(s)).toMatchObject({current: 2, completed: true});
      s.vehicles[1].ownership_type = 'leased';
    }
  });

  it('zählt bekannte freigeschaltete IDs genau einmal, ohne den Spielstand zu verändern', () => {
    const s = {achievements: [
      {id: 'biz_first', unlocked: true}, {id: 'biz_first', unlocked: true},
      {id: 'old-unknown', unlocked: true}, {id: 'dg_first', unlocked: true},
      {id: 'life_first', unlocked: false},
    ]};
    const before = structuredClone(s);
    expect(getAchievementSummary(s)).toEqual({unlocked: 2, total: 35});
    expect(getAchievementSummary(s, 'unternehmen')).toEqual({unlocked: 2, total: 13});
    expect(getGrowthInfo(s)).toMatchObject({unlockedAchievements: 2, totalAchievements: 35});
    expect(s).toEqual(before);
    expect(getAchievementSummary({})).toEqual({unlocked: 0, total: 35});
  });

  it('behält bereits erworbene Flotten-Erfolge und XP unverändert bei', () => {
    const s = {gameTime: 0, vehicles: [], xp: 150,
      achievements: [{id: 'fleet_four', unlocked: true, unlockedAtMin: 12}]};
    checkAchievements(s, 20);
    expect(s.achievements[0]).toEqual({id: 'fleet_four', unlocked: true, unlockedAtMin: 12});
    expect(s.xp).toBe(150);
  });
});

describe('Live-Abnahme: verständliche UI-Beschriftungen', () => {
  it('benennt Cloud-Laden und Cloud-Löschen mit dem jeweiligen Spielstand', () => {
    const html = renderToStaticMarkup(React.createElement(CloudSyncSection));
    expect(html).toContain('aria-label="Cloud-Spielstand „Prüfkopie“ laden"');
    expect(html).toContain('aria-label="Cloud-Spielstand „Prüfkopie“ löschen"');
  });
  it('beschriftet lokale Speicheraktionen, Eingabe und Dialogschluss', () => {
    const slots = readFileSync('src/components/game/SaveSlotsDialog.jsx', 'utf8');
    expect(slots).toContain('aria-label="Name des neuen Spielstands"');
    expect(slots).toContain('aria-label={`Spielstand „${s.name}“ laden`}');
    expect(slots).toContain('aria-label={`Spielstand „${s.name}“ löschen`}');
    expect(slots).toContain('aria-label={`Automatische Sicherung ${i + 1} löschen`}');
    expect(readFileSync('src/components/ui/dialog.jsx', 'utf8')).toContain('className="sr-only">Schließen');
  });
  it('rendert Erlös, Kilometer und Stunden im deutschen Zahlenformat', () => {
    const html = renderToStaticMarkup(React.createElement(Efficiency));
    expect(html).toContain('5,50 €');
    expect(html).toContain('2.694,0 h');
    expect(html).toContain('64.310 km');
    expect(html).not.toContain('5.50 €');
  });
});
