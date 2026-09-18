import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import fs from "node:fs";
let media:any;
class AudioMock{loop=false;volume=1;paused=true;preload="";onplaying:any;onerror:any;play=vi.fn(()=>{this.paused=false;return Promise.resolve();});pause=vi.fn(()=>{this.paused=true;});constructor(public src:string){media=this;}}
beforeEach(()=>{vi.resetModules();vi.stubGlobal("Audio",AudioMock);vi.stubGlobal("document",{hidden:false});vi.stubGlobal("localStorage",{getItem:()=>null,setItem:vi.fn()});});
afterEach(()=>vi.unstubAllGlobals());
describe("Büroklänge",()=>{
 it("startet eine Schleife, ohne sie bei jedem Klick neu anzulegen",async()=>{const a=await import("@/lib/officeAudio");expect(await a.startOfficeAudio()).toBe(true);const first=media;await a.startOfficeAudio();expect(media).toBe(first);expect(media.play).toHaveBeenCalledTimes(1);expect(media.loop).toBe(true);});
 it("senkt Hintergrund bei Telefonaten und stoppt auf Wunsch",async()=>{const a=await import("@/lib/officeAudio");await a.startOfficeAudio();a.setOfficeVolume(.8);const normal=media.volume;expect(normal).toBeGreaterThan(0);expect(normal).toBeLessThan(.1);a.setOfficeDucked(true);expect(media.volume).toBeCloseTo(normal/4);a.setOfficeDucked(false);expect(media.volume).toBeCloseTo(normal);a.stopOfficeAudio(true);expect(media.pause).toHaveBeenCalled();expect(a.wantsOfficeAudio()).toBe(false);});
 it("blockierte Medienwiedergabe verursacht keinen Spielfehler",async()=>{vi.stubGlobal("Audio",class extends AudioMock{play=vi.fn(()=>Promise.reject(Object.assign(new Error(),{name:"NotAllowedError"})));});const a=await import("@/lib/officeAudio");expect(await a.startOfficeAudio()).toBe(false);});
 it("Hintergrunddatei enthält 20 Sekunden nicht stummes PCM",()=>{const b=fs.readFileSync("src/assets/office-yard.wav");expect(b.toString("ascii",8,12)).toBe("WAVE");expect(b.length).toBe(882044);let energy=0;for(let i=44;i<b.length;i+=2)energy+=(b.readInt16LE(i)/32768)**2;expect(Math.sqrt(energy/441000)).toBeGreaterThan(.02);});
});
it("Büro bleibt auch bei maximalem Hintergrundregler unter dem Signalpegel und folgt der Gesamtlautstärke",async()=>{const a=await import("@/lib/officeAudio"),sound=await import("@/lib/experienceSound");sound.setSoundVolume(1);a.setOfficeVolume(1);await a.startOfficeAudio();const full=media.volume;expect(full).toBeLessThan(.22);sound.setSoundVolume(.1);a.refreshOfficeVolume();expect(media.volume).toBeCloseTo(full/10);});
