// Mess-Harness für die FERNWERK-Simulations-Engine.
// Transpiliert die TS-Engine on-the-fly und führt advanceTime(1440) aus
// mit Instrumentierung von processDispatcher, suggestTours, buildTourPlan.
// KEINE produktiven Spielstände — erzeugt frische deterministische Spielstände.

const Module = require("module");
const Path = require("path");
const Fs = require("fs");
const ts = require("typescript");

const SRC = Path.resolve(process.cwd(), "src");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  let resolved = request;
  if (resolved.startsWith("@/")) resolved = Path.join(SRC, resolved.slice(2));
  if (!Path.extname(resolved)) {
    const tsPath = resolved + ".ts";
    if (Fs.existsSync(tsPath)) resolved = tsPath;
  }
  return origResolve.call(this, resolved, parent, ...rest);
};

// Globale Zähler für Injektion in transpilierte Funktionen
global.__BENCH = { pd: 0, pdSkipped: 0, btp: 0, st: 0, psv: 0 };

require.extensions[".ts"] = function (module, filename) {
  let src = Fs.readFileSync(filename, "utf8");
  // Leichte Instrumentierung: Zähler am Funktionsanfang injizieren
  if (filename.endsWith("dispatcherProcessor.ts")) {
    src = src.replace(
      "export function processDispatcher(state, emp, m, log) {",
      "export function processDispatcher(state, emp, m, log) { global.__BENCH.pd++;"
    );
    src = src.replace(
      "export function planSingleVehicle(state, vehicle, m, log) {",
      "export function planSingleVehicle(state, vehicle, m, log) { global.__BENCH.psv++;"
    );
  }
  if (filename.endsWith("tourEngine.ts")) {
    src = src.replace(
      "export function buildTourPlan(state, opts) {",
      "export function buildTourPlan(state, opts) { global.__BENCH.btp++;"
    );
    src = src.replace(
      "export function suggestTours(state, opts) {",
      "export function suggestTours(state, opts) { global.__BENCH.st++;"
    );
  }
  const result = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    fileName: filename,
  });
  return module._compile(result.outputText, filename);
};

const simDir = Path.join(SRC, "lib", "simulation");
const simMod = require(Path.join(simDir, "simulationEngine.ts"));
const createInitialState = simMod.createInitialState;
const applyCommand = simMod.applyCommand;

const stats = {
  processDispatcherCalls: 0, processDispatcherTimeMs: 0,
  suggestToursCalls: 0, suggestToursTimeMs: 0,
  buildTourPlanCalls: 0, buildTourPlanTimeMs: 0,
  planSingleVehicleCalls: 0, planSingleVehicleTimeMs: 0,
};

const dispatcherMod = require(Path.join(simDir, "dispatcherProcessor.ts"));
const tourMod = require(Path.join(simDir, "tourEngine.ts"));

const _origPD = dispatcherMod.processDispatcher;
dispatcherMod.processDispatcher = function (state, emp, m, log) {
  stats.processDispatcherCalls++;
  const t0 = Date.now();
  _origPD(state, emp, m, log);
  stats.processDispatcherTimeMs += Date.now() - t0;
};

const _origST = tourMod.suggestTours;
tourMod.suggestTours = function (state, opts) {
  stats.suggestToursCalls++;
  const t0 = Date.now();
  const r = _origST(state, opts);
  stats.suggestToursTimeMs += Date.now() - t0;
  return r;
};

const _origBTP = tourMod.buildTourPlan;
tourMod.buildTourPlan = function (state, opts) {
  stats.buildTourPlanCalls++;
  const t0 = Date.now();
  const r = _origBTP(state, opts);
  stats.buildTourPlanTimeMs += Date.now() - t0;
  return r;
};

const _origPSV = dispatcherMod.planSingleVehicle;
dispatcherMod.planSingleVehicle = function (state, vehicle, m, log) {
  stats.planSingleVehicleCalls++;
  const t0 = Date.now();
  _origPSV(state, vehicle, m, log);
  stats.planSingleVehicleTimeMs += Date.now() - t0;
};

function makeState() {
  return createInitialState({
    companyName: "Testspedition", playerName: "Tester", partnerName: "Mara",
  }).state;
}

// Skalierbarer Spielstand. scale: "small" (8 Lkw), "medium" (15 Lkw), "large" (25 Lkw)
function makeScaledState(scale) {
  const cfg = {
    small:  { vehicles: 5, drivers: 5, dispatchers: 2, advanceDays: 3 },
    medium: { vehicles: 12, drivers: 12, dispatchers: 3, advanceDays: 5 },
    large:  { vehicles: 22, drivers: 22, dispatchers: 4, advanceDays: 7 },
  }[scale];
  const s = makeState();
  // Ausreichend Kapital für Fahrzeugkäufe injizieren
  s.company.accountCents = 50000000; // 500.000 €
  // Lkw kaufen
  for (let i = 0; i < cfg.vehicles; i++) {
    try { applyCommand(s, "buyVehicle", {}); } catch (e) {}
  }
  // Fahrer einstellen — ggf. Markt-Wellen auslösen durch Zeitvorlauf
  let hired = 0;
  for (let pass = 0; pass < 3 && hired < cfg.drivers; pass++) {
    const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
    for (let i = hired; i < cfg.drivers && i < driverApps.length; i++) {
      try { applyCommand(s, "hireEmployee", { applicantId: driverApps[i].id }); hired++; } catch (e) {}
    }
    if (hired < cfg.drivers) applyCommand(s, "advanceTime", { minutes: 240 }); // Neue Welle
  }
  // Disponenten einstellen
  let hiredDisp = 0;
  for (let pass = 0; pass < 3 && hiredDisp < cfg.dispatchers; pass++) {
    const dispApps = (s.availableApplicants || []).filter(a => a.role === "dispatcher");
    for (let i = hiredDisp; i < cfg.dispatchers && i < dispApps.length; i++) {
      try { applyCommand(s, "hireEmployee", { applicantId: dispApps[i].id }); hiredDisp++; } catch (e) {}
    }
    if (hiredDisp < cfg.dispatchers) applyCommand(s, "advanceTime", { minutes: 240 });
  }
  // Tage vorlaufen, um Auftragsbuch aufzubauen
  applyCommand(s, "advanceTime", { minutes: cfg.advanceDays * 1440 });
  return s;
}

function makeRepresentativeState() { return makeScaledState("small"); }

function describeState(s) {
  return {
    gameTime: s.gameTime,
    vehicles: (s.vehicles || []).length,
    drivers: (s.drivers || []).length,
    employees: (s.employees || []).map(e => ({ role: e.role, workMode: e.workMode, attendance: e.attendance })),
    orders: (s.orders || []).length,
    trips: (s.trips || []).length,
    tours: (s.tours || []).length,
    stateSizeBytes: JSON.stringify(s).length,
    rngSeed: s.rngSeed,
  };
}

function resetStats() {
  for (const k of Object.keys(stats)) stats[k] = 0;
  global.__BENCH.pd = 0; global.__BENCH.pdSkipped = 0;
  global.__BENCH.btp = 0; global.__BENCH.st = 0; global.__BENCH.psv = 0;
}

function runBenchmarkAtScale(scale) {
  const desc = describeState(makeScaledState(scale));
  const dayResults = [];
  for (let i = 0; i < 3; i++) {
    const s = makeScaledState(scale);
    resetStats();
    const t0 = Date.now();
    applyCommand(s, "advanceTime", { minutes: 1440 });
    const totalMs = Date.now() - t0;
    dayResults.push({
      totalMs, ...stats,
      pdCalls: global.__BENCH.pd, btpCalls: global.__BENCH.btp,
      stCalls: global.__BENCH.st, psvCalls: global.__BENCH.psv,
    });
  }
  const median = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const pickMedian = (key) => median(dayResults.map(r => r[key]));
  return {
    scale, stateDescription: desc,
    median: { totalMs: pickMedian("totalMs") },
    medianInjected: {
      pdCalls: pickMedian("pdCalls"), btpCalls: pickMedian("btpCalls"),
      stCalls: pickMedian("stCalls"), psvCalls: pickMedian("psvCalls"),
    },
    runs: dayResults.map(r => ({ totalMs: r.totalMs, btp: r.btpCalls, st: r.stCalls, pd: r.pdCalls })),
  };
}

function runBenchmark() {
  // Konsistenztest (small scale)
  function snap(s) {
    return JSON.stringify({
      gt: s.gameTime, cc: s.company?.cash, pc: s.private?.cash,
      orders: (s.orders || []).map(o => o.id + ":" + o.status).sort(),
      trips: (s.trips || []).map(t => t.id + ":" + t.status).sort(),
      tours: (s.tours || []).map(t => t.id + ":" + t.status).sort(),
      rng: s.rngState,
    });
  }
  const s1 = makeScaledState("small"); applyCommand(s1, "advanceTime", { minutes: 1440 });
  const s2 = makeScaledState("small"); for (let i = 0; i < 24; i++) applyCommand(s2, "advanceTime", { minutes: 60 });
  const consistent12 = snap(s1) === snap(s2);

  return {
    small: runBenchmarkAtScale("small"),
    medium: runBenchmarkAtScale("medium"),
    large: runBenchmarkAtScale("large"),
    consistency: { "1x1440==24x60": consistent12 },
  };
}

module.exports = { runBenchmark, makeState, makeRepresentativeState, describeState, applyCommand, stats };