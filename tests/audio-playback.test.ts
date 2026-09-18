import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
let instance:any;
class FakeAudio {
 state="suspended"; currentTime=0; destination={}; onstatechange:any;
 oscillators:any[]=[]; gains:any[]=[];
 constructor(){instance=this;}
 resume=vi.fn(async()=>{this.state="running";});
 createOscillator(){const o={frequency:{value:0},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};this.oscillators.push(o);return o;}
 createGain(){const g={connect:vi.fn(),disconnect:vi.fn(),gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()}};this.gains.push(g);return g;}
}
beforeEach(()=>{vi.resetModules();vi.stubGlobal("AudioContext",FakeAudio);vi.stubGlobal("localStorage",{getItem:()=>null,setItem:vi.fn()});vi.stubGlobal("document",{hidden:false});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe("Audioaktivierung",()=>{
 it("aktiviert beim Einschalten und erzeugt einen hörbaren Signalpfad",async()=>{
 const a=await import("@/lib/experienceSound");expect(await a.setSoundEnabled(true)).toBe(true);
 expect(instance.resume).toHaveBeenCalled();expect(instance.oscillators).toHaveLength(2);
 expect(instance.gains[0].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(.143);
 });
 it("Testton umgeht Ereignis-Cooldown, normale Signale bleiben begrenzt",async()=>{
 const a=await import("@/lib/experienceSound");await a.setSoundEnabled(true);
 expect(a.playExperienceSound("alert")).toBe(false);
 expect(await a.testExperienceSound()).toBe(true);expect(instance.oscillators).toHaveLength(4);
 });
 it("stellt geschlossenen Context wieder her",async()=>{
 const a=await import("@/lib/experienceSound");await a.setSoundEnabled(true);const old=instance;old.state="closed";
 expect(await a.testExperienceSound()).toBe(true);expect(instance).not.toBe(old);
 });
 it("Wiedergabe bleibt bei Browserblockade ohne Absturz ausgeschaltet",async()=>{
 vi.stubGlobal("AudioContext",class extends FakeAudio {resume=vi.fn(async()=>{});});
 const a=await import("@/lib/experienceSound");expect(await a.setSoundEnabled(true)).toBe(false);
 expect(instance.oscillators).toHaveLength(0);
 });
 it("hängende Browserfreigabe hält den Testknopf nicht dauerhaft fest",async()=>{
 vi.useFakeTimers();vi.stubGlobal("AudioContext",class extends FakeAudio {resume=vi.fn(()=>new Promise<void>(()=>{}));});
 const a=await import("@/lib/experienceSound");const pending=a.setSoundEnabled(true);await vi.advanceTimersByTimeAsync(1500);
 expect(await pending).toBe(false);
 });
 it("Ausschalten stoppt laufende Signale und verhindert weitere",async()=>{
 const a=await import("@/lib/experienceSound");await a.setSoundEnabled(true);await a.setSoundEnabled(false);
 expect(instance.oscillators[0].stop).toHaveBeenCalledTimes(2);
 expect(await a.testExperienceSound()).toBe(false);
 });
 it("Lautstärke wird gespeichert und bei Testton angewendet",async()=>{
 const a=await import("@/lib/experienceSound");a.setSoundVolume(.5);await a.setSoundEnabled(true);
 expect(localStorage.setItem).toHaveBeenCalledWith("frachtfieber.volume","0.5");
 expect(instance.gains[0].gain.linearRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(.11);
 });
});
