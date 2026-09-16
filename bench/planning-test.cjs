// Test für FERNWERK Planungs-Befehle.
// Nutzt dieselbe TS-Transpilation wie bench/harness.cjs.
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
    const jsPath = resolved + ".js";
    if (Fs.existsSync(jsPath)) resolved = jsPath;
  }
  return origResolve.call(this, resolved, parent, ...rest);
};

require.extensions[".ts"] = require.extensions[".js"] = function (module, filename) {
  const src = Fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      allowJs: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

// Tests laden
const { createInitialState } = require("@/lib/simulation/initialStateEngine.ts");
const { collectPlanningData } = require("@/lib/planningData.js");
const { findResourcesForOrder, findMaintenanceWindows, previewDelayTourStart, delayTourStart } = require("@/lib/simulation/planningEngine.ts");
const { applyCommand } = require("@/lib/simulation/simulationEngine.ts");

const results = [];
function test(name, fn) {
  try {
    const r = fn();
    results.push({ name, ...r });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}

function makeState() {
  return createInitialState({
    companyName: "Testspedition", playerName: "Tester", partnerName: "Mara",
  }).state;
}

// --- Test 1: collectPlanningData ---
test("collectPlanningData", () => {
  const state = makeState();
  state.gameTime = 720;
  const data = collectPlanningData(state, { horizonDays: 7 });
  return {
    ok: data.horizonDays === 7 && data.vehicles.length > 0,
    vehicles: data.vehicles.length,
    personnel: data.personnel.length,
    workshop: data.workshop.length,
    unplanned: data.unplanned.length,
    expectedDemand: data.expectedDemand.length,
    conflicts: data.conflicts.length,
    privateAppts: data.privateAppointments.length,
  };
});

// --- Test 2: findResourcesForOrder ---
test("findResourcesForOrder", () => {
  const state = makeState();
  state.gameTime = 720;
  // Ersten Auftrag annehmen
  const order = state.orders[0];
  if (!order) return { ok: false, error: "Keine Aufträge im Initialzustand" };
  order.status = "angenommen";
  const result = findResourcesForOrder(state, order.id);
  return {
    ok: result.ok === true,
    candidateCount: result.candidates?.length || 0,
  };
});

// --- Test 3: findMaintenanceWindows ---
test("findMaintenanceWindows", () => {
  const state = makeState();
  state.gameTime = 720;
  const v = state.vehicles[0];
  const result = findMaintenanceWindows(state, v.id);
  return {
    ok: result.ok === true,
    windowCount: result.windows?.length || 0,
  };
});

// --- Test 4: previewDelayTourStart ---
test("previewDelayTourStart", () => {
  const state = makeState();
  state.gameTime = 720;
  // Eine Tour erstellen: Auftrag annehmen und bestätigen
  const order = state.orders[0];
  if (!order) return { ok: false, error: "Keine Aufträge" };
  order.status = "angenommen";
  order.acceptedAtMin = state.gameTime;
  order.deliveryDeadlineMin = state.gameTime + 4320; // +3 Tage — genug Puffer
  const v = state.vehicles[0];
  const d = state.drivers[0];
  // confirmTour mit minStartTime in der Zukunft, damit die Tour nicht sofort startet
  const futureStart = state.gameTime + 480; // +8h
  const { result } = applyCommand(state, "confirmTour", {
    vehicleId: v.id, driverId: d.id, orderIds: [order.id], minStartTime: futureStart,
  });
  if (!result?.ok) return { ok: false, error: "confirmTour fehlgeschlagen: " + JSON.stringify(result) };
  const tourId = result.tourId;
  // Vorschau: Start um 1 Tag verschieben
  const newStart = state.gameTime + 1440;
  const preview = previewDelayTourStart(state, { tourId, newStartMin: newStart });
  return {
    ok: preview.ok === true,
    canConfirm: preview.canConfirm,
    hasComparison: !!preview.comparison,
    obstacleHard: preview.obstacles?.hard?.length || 0,
    previewError: preview.error || null,
    tourStatus: (state.tours || []).find(t => t.id === tourId)?.status,
    firstDepStatus: (state.tours || []).find(t => t.id === tourId)?.deployments?.[0]?.status,
  };
});

// --- Test 4b: delayTourStart (Ausführung) ---
test("delayTourStart", () => {
  const state = makeState();
  state.gameTime = 720;
  const order = state.orders[0];
  if (!order) return { ok: false, error: "Keine Aufträge" };
  order.status = "angenommen";
  order.acceptedAtMin = state.gameTime;
  order.deliveryDeadlineMin = state.gameTime + 4320;
  const v = state.vehicles[0];
  const d = state.drivers[0];
  const futureStart = state.gameTime + 480;
  const { result } = applyCommand(state, "confirmTour", {
    vehicleId: v.id, driverId: d.id, orderIds: [order.id], minStartTime: futureStart,
  });
  if (!result?.ok) return { ok: false, error: "confirmTour fehlgeschlagen" };
  const oldTourId = result.tourId;
  const newStart = state.gameTime + 1440;
  const { result: delayResult } = applyCommand(state, "delayTourStart", { tourId: oldTourId, newStartMin: newStart });
  return {
    ok: delayResult?.ok === true,
    oldTourId,
    newTourId: delayResult?.newTourId,
    newStartMin: delayResult?.newStartMin,
    oldTourCancelled: (state.tours || []).find(t => t.id === oldTourId)?.status === "cancelled",
  };
});

// --- Test 4c: previewReassignTour ---
test("previewReassignTour", () => {
  const state = makeState();
  state.gameTime = 720;
  const order = state.orders[0];
  if (!order) return { ok: false, error: "Keine Aufträge" };
  order.status = "angenommen";
  order.acceptedAtMin = state.gameTime;
  order.deliveryDeadlineMin = state.gameTime + 4320;
  const v1 = state.vehicles[0];
  const d1 = state.drivers[0];
  const futureStart = state.gameTime + 480;
  const { result } = applyCommand(state, "confirmTour", {
    vehicleId: v1.id, driverId: d1.id, orderIds: [order.id], minStartTime: futureStart,
  });
  if (!result?.ok) return { ok: false, error: "confirmTour fehlgeschlagen" };
  const tourId = result.tourId;
  const v2 = state.vehicles[1] || state.vehicles[0];
  const d2 = state.drivers[1] || state.drivers[0];
  const preview = applyCommand(state, "previewReassignTour", { tourId, newVehicleId: v2.id, newDriverId: d2.id }).result;
  return {
    ok: preview?.ok === true,
    canConfirm: preview?.canConfirm,
    obstacleHard: preview?.obstacles?.hard?.length || 0,
    hasComparison: !!preview?.comparison,
  };
});

// --- Test 5: applyCommand mit Planungs-Befehlen ---
test("applyCommand planning routing", () => {
  const state = makeState();
  state.gameTime = 720;
  const v = state.vehicles[0];
  // findMaintenanceWindows über applyCommand
  const { result } = applyCommand(state, "findMaintenanceWindows", { vehicleId: v.id });
  return {
    ok: result?.ok === true,
    windowCount: result?.windows?.length || 0,
  };
});

// --- Test 6: Unbekannter Befehl wirft Fehler ---
test("unknown command throws", () => {
  const state = makeState();
  try {
    applyCommand(state, "nonExistentPlanningCommand", {});
    return { ok: false, error: "Sollte Fehler werfen" };
  } catch (e) {
    return { ok: e.message.includes("Unbekannter Befehl") };
  }
});

// Ergebnisse ausgeben
console.log("\n=== FERNWERK Planungs-Tests ===\n");
let pass = 0, fail = 0;
for (const r of results) {
  const status = r.ok ? "✓ PASS" : "✗ FAIL";
  if (r.ok) pass++; else fail++;
  const detail = Object.entries(r)
    .filter(([k]) => k !== "name" && k !== "ok" && k !== "error")
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  console.log(`${status} ${r.name}${detail ? " — " + detail : ""}${r.error ? " ERROR: " + r.error : ""}`);
}
console.log(`\n${pass}/${results.length} bestanden, ${fail} fehlgeschlagen\n`);
if (fail > 0) process.exit(1);