// Zufall ist Teil des gespeicherten Spielzustands, unabhängig von Browser und Uhr.
import { mulberry32 } from "./gameRules.ts";
export function nextRandom(state) {
  const value = mulberry32(state.rngSeed >>> 0)();
  state.rngSeed = Math.floor(value * 4294967296) >>> 0;
  return value;
}
