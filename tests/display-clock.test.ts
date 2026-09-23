import {describe,it,expect} from "vitest";
import {displayedGameMinute} from "@/lib/displayClock";
const tc={enabled:true,anchorRealMs:1000,anchorGameNumerator:48000};
describe("laufende Minutenanzeige",()=>{
 it("zeigt jede Minute bei unverändertem Engine-Zustand",()=>{
  const minutes=Array.from({length:16},(_,i)=>displayedGameMinute(480,tc,1000+Math.ceil(i*2500/15),true));
  expect(minutes).toEqual(Array.from({length:16},(_,i)=>480+i));
 });
 it("bleibt über den 15-Minuten-Commit hinweg kontinuierlich",()=>{
  expect(displayedGameMinute(480,tc,3400,true)).toBe(494);
  expect(displayedGameMinute(495,tc,3500,true)).toBe(495);
  expect(displayedGameMinute(495,tc,3670,true)).toBe(496);
 });
 it("läuft bei einem blockierten Worker höchstens einen Takt voraus",()=>{
  expect(displayedGameMinute(480,tc,301000,true)).toBe(495);
 });
 it("zeigt beim Pausieren, Laden und Tagesvorlauf den tatsächlichen Stand",()=>{
  expect(displayedGameMinute(480,tc,4000,false)).toBe(480);
  expect(displayedGameMinute(1920,{...tc,anchorGameNumerator:192000,anchorRealMs:7000},7000,true)).toBe(1920);
  expect(displayedGameMinute(480,{...tc,enabled:false},4000,true)).toBe(480);
 });
});
