import {describe,it,expect,vi,afterEach,beforeEach} from "vitest";
import fs from "node:fs";
let players:any[]=[];
class Media {
 volume=1; preload=""; onended:any; onerror:any;
 play=vi.fn(()=>Promise.resolve()); pause=vi.fn();
 constructor(public src:string){players.push(this);}
}
beforeEach(()=>{vi.resetModules();players=[];vi.stubGlobal("Audio",Media);vi.stubGlobal("localStorage",{getItem:()=>null,setItem:vi.fn()});vi.stubGlobal("document",{hidden:false});});
afterEach(()=>vi.unstubAllGlobals());
describe("Telefon: echte Audiodatei",()=>{
 it("ruft media.play direkt im Klickpfad auf, ohne AudioContext oder vorheriges await",async()=>{
 const a=await import("@/lib/experienceSound");
 void a.setSoundEnabled(true,{preview:false});
 const result=a.playPhoneSound("test");
 expect(players).toHaveLength(1);expect(players[0].play).toHaveBeenCalledTimes(1);
 expect(players[0].src).toContain("phone-ring.wav");
 expect(await result).toBe(true);
 });
 it("meldet eine blockierte Wiedergabe als fehlgeschlagen",async()=>{
 vi.stubGlobal("Audio",class extends Media{play=vi.fn(()=>Promise.reject(Object.assign(new Error("blocked"),{name:"NotAllowedError"})));});
 const a=await import("@/lib/experienceSound");await a.setSoundEnabled(true,{preview:false});
 expect(await a.playPhoneSound("test")).toBe(false);
 });
 it("abgebrochene alte Klingelwiedergabe beendet keinen Testanruf",async()=>{
 const a=await import("@/lib/experienceSound");await a.setSoundEnabled(true,{preview:false});
 await a.playPhoneSound("ring");await a.playPhoneSound("test");a.stopPhoneSound("ring");
 expect(players[0].pause).toHaveBeenCalled();expect(players[1].pause).not.toHaveBeenCalled();
 await a.setSoundEnabled(false);expect(players[1].pause).toHaveBeenCalled();
 });
 it("WAV enthält zwei Sekunden gültiges, nicht stummes PCM",()=>{
 const b=fs.readFileSync("src/assets/phone-ring.wav");expect(b.toString("ascii",0,4)).toBe("RIFF");
 expect(b.toString("ascii",8,12)).toBe("WAVE");expect(b.readUInt32LE(24)).toBe(22050);
 expect(b.readUInt32LE(40)).toBe(88200);let energy=0,peak=0;
 for(let i=44;i<b.length;i+=2){const value=b.readInt16LE(i)/32768;energy+=value*value;peak=Math.max(peak,Math.abs(value));}
 expect(Math.sqrt(energy/44100)).toBeGreaterThan(.15);expect(peak).toBeLessThan(1);
 });
});