import {describe,it,expect,vi,afterEach} from "vitest";
import {startPhoneRinging} from "@/lib/phoneRinging";
afterEach(()=>vi.useRealTimers());
describe("Telefonklingeln",()=>{
 it("klingelt dreimal und endet ohne Endlosschleife",()=>{
 vi.useFakeTimers();const play=vi.fn();startPhoneRinging(play);
 expect(play).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(20000);
 expect(play).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
 });
 it("Annehmen oder Auflegen stoppt weitere Klingeltöne",()=>{
 vi.useFakeTimers();const play=vi.fn();const stop=startPhoneRinging(play);stop();
 vi.advanceTimersByTime(20000);expect(play).toHaveBeenCalledTimes(1);
 });
 it("verbleibendes Klingelbudget verhindert Wiederholung bei UI-Neuberechnungen",()=>{
 vi.useFakeTimers();const play=vi.fn();startPhoneRinging(play,setInterval,clearInterval,1);
 vi.advanceTimersByTime(20000);startPhoneRinging(play,setInterval,clearInterval,0);
 expect(play).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
});