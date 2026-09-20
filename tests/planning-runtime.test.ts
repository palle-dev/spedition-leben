import { describe, it, expect, vi } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { suggestTours, futureDriverLocation, withTourValidation, earliestAvailable } from '@/lib/simulation/tourEngine';
import { generateMarketWave } from '@/lib/simulation/marketEngine';
const fresh=()=>{const s=createInitialState({companyName:'Test',playerName:'Test',partnerName:'Test'}).state;applyCommand(s,'advanceTime',{minutes:0});return s;};
describe('Begrenzte Planungsindizes',()=>{
 it('durchsucht bei einem bekannten fehlenden Fahrer-Trip nicht erneut die Historie',()=>{
  const s=fresh();s.drivers[0].status='on_trip';s.trips=[];
  const find=vi.spyOn(s.trips,'find');
  withTourValidation(s,()=>{
    expect(futureDriverLocation(s,s.drivers[0])).toBe(s.drivers[0].locationCity);
    expect(earliestAvailable(s,{},s.drivers[0])).toBe(s.gameTime);
  });
  expect(find).not.toHaveBeenCalled();find.mockRestore();
 });
 it('räumt den Index bei Fehlern auf und sieht anschließend neu angelegte Fahrten',()=>{
  const s=fresh();const d=s.drivers[0];d.status='on_trip';
  expect(()=>withTourValidation(s,()=>{throw Error('Abbruch');})).toThrow('Abbruch');
  s.trips.push({id:'later',driverId:d.id,status:'in_progress',endMin:12345,phases:[{type:'loaded_drive',toCity:'Berlin'}]});
  expect(futureDriverLocation(s,d)).toBe('Berlin');expect(earliestAvailable(s,{},d)).toBe(12345);
 });
 it('verschachtelte Suchkontexte stellen die äußere Sicht wieder her',()=>{
  const s=fresh();const d=s.drivers[0];d.status='on_trip';
  s.trips=[{id:'trip',driverId:d.id,status:'in_progress',endMin:1000,phases:[{type:'loaded_drive',toCity:'Berlin'}]}];
  withTourValidation(s,()=>{
    const other=fresh();other.drivers[0].status='on_trip';
    withTourValidation(other,()=>expect(futureDriverLocation(other,other.drivers[0])).toBe(other.drivers[0].locationCity));
    expect(futureDriverLocation(s,d)).toBe('Berlin');
  });
 });
 it('Tourenvorschläge verändern keine Spiel- oder Zufallsdaten und behalten keine Planungsobjekte',()=>{
  const s=fresh(),before=structuredClone(s);
  suggestTours(s,{acceptNew:true,horizonMin:2880,mode:'balanced'});
  for (const key of ['_vehicleMap','_driverMap','_orderMap']) { expect(s[key]).toBeNull(); delete s[key]; }
  expect(s).toEqual(before);
 });
 it('jede Marktwelle berücksichtigt geänderte Standorte und Verfügbarkeiten neu',()=>{
  const a=fresh();generateMarketWave(a,480,[]);
  a.gameTime=1440;a.orders=[];a.vehicles[0].locationCity='Berlin';a.drivers[0].locationCity='Berlin';a.drivers[0].status='resting';a.drivers[0].restUntil=1600;
  const b=structuredClone(a);
  generateMarketWave(a,1440,[]);generateMarketWave(b,1440,[]);
  expect(a).toEqual(b);
 });
});
