// Test-Skript für das Störungsmanagement.
// Führt die vier geforderten Szenarien aus und misst die Laufzeit.
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

require.extensions[".ts"] = function (module, filename) {
  let src = Fs.readFileSync(filename, "utf8");
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
const { createInitialState, applyCommand } = simMod;
const { migrateDisruptions } = require(Path.join(simDir, "disruptionEngine.ts"));

function makeState() {
  return createInitialState({
    companyName: "Testspedition", playerName: "Tester", partnerName: "Mara",
  }).state;
}

function makeScaledState() {
  const s = makeState();
  s.company.accountCents = 50000000; // 500.000 €
  // 5 Lkw kaufen
  for (let i = 0; i < 5; i++) {
    try { applyCommand(s, "buyVehicle", {}); } catch (e) {}
  }
  // Fahrer einstellen
  let hired = 0;
  for (let pass = 0; pass < 3 && hired < 5; pass++) {
    const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
    for (let i = hired; i < 5 && i < driverApps.length; i++) {
      try { applyCommand(s, "hireEmployee", { applicantId: driverApps[i].id }); hired++; } catch (e) {}
    }
    if (hired < 5) applyCommand(s, "advanceTime", { minutes: 240 });
  }
  // 2 Disponenten einstellen
  let hiredDisp = 0;
  for (let pass = 0; pass < 3 && hiredDisp < 2; pass++) {
    const dispApps = (s.availableApplicants || []).filter(a => a.role === "dispatcher");
    for (let i = hiredDisp; i < 2 && i < dispApps.length; i++) {
      try { applyCommand(s, "hireEmployee", { applicantId: dispApps[i].id }); hiredDisp++; } catch (e) {}
    }
    if (hiredDisp < 2) applyCommand(s, "advanceTime", { minutes: 240 });
  }
  // 3 Tage vorlaufen für Auftragsbuch
  applyCommand(s, "advanceTime", { minutes: 3 * 1440 });
  return s;
}

function countDisruptions(s) {
  return (s.disruptions?.items || []).length;
}

function getActiveDisruptions(s) {
  return (s.disruptions?.items || []).filter(d => d.status !== "completed");
}

const results = {};

// --- Test 1: Konsistenz — Tagesvorlauf mit/ohne Störungen ---
console.log("\n=== Test 1: Konsistenz & Laufzeit ===");
{
  const s = makeScaledState();
  const t0 = Date.now();
  applyCommand(s, "advanceTime", { minutes: 1440 });
  const ms = Date.now() - t0;
  results.consistency = { dayAdvanceMs: ms, disruptions: countDisruptions(s) };
  console.log(`  Tagesvorlauf: ${ms}ms, Störungen gesamt: ${countDisruptions(s)}`);
}

// --- Test 2: Technischer Defekt — manuelle Tour ---
console.log("\n=== Test 2: Technischer Defekt (manuelle Tour) ===");
{
  // Frischer Spielstand: 1 Lkw, 1 Fahrer, kein Vorlauf (Fahrzeug ist frei)
  const s = makeState();
  s.company.accountCents = 50000000;
  applyCommand(s, "buyVehicle", {});
  const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
  if (driverApps[0]) applyCommand(s, "hireEmployee", { applicantId: driverApps[0].id });
  const v = s.vehicles[0];
  const d = s.drivers[0];
  // Zustand auf 25 (über Schwelle 20, aber hohes Defektrisiko)
  v.condition = 25;
  let defectTriggered = false;
  let attempts = 0;
  // Mehrere Versuche mit verschiedenen Aufträgen
  for (let attempt = 0; attempt < 50 && !defectTriggered; attempt++) {
    const offered = s.orders.find(o => o.status === "offered" && o.tons <= v.capacityTons);
    if (!offered) { applyCommand(s, "advanceTime", { minutes: 60 }); continue; }
    try {
      applyCommand(s, "acceptOrder", { orderId: offered.id });
    } catch (e) { continue; }
    try {
      applyCommand(s, "startTransport", { orderId: offered.id, vehicleId: v.id, driverId: d.id });
    } catch (e) {
      // Defekt wirft Fehler
    }
    attempts++;
    const defects = getActiveDisruptions(s).filter(d => d.type === "technical_defect");
    if (defects.length > 0) { defectTriggered = true; break; }
    // Fahrzeug wieder freimachen (Tour abschließen oder Zeit vorlaufen)
    applyCommand(s, "advanceTime", { minutes: 1440 });
    // Fahrzeug nach Tour wieder frei?
    if (v.status !== "free") { v.status = "free"; v.condition = 25; }
  }
  const defects = getActiveDisruptions(s).filter(d => d.type === "technical_defect");
  results.technicalDefect = {
    triggered: defects.length > 0,
    attempts,
    count: defects.length,
    details: defects.map(d => ({ id: d.id, cause: d.cause, status: d.status, options: (d.options || []).map(o => o.id) })),
  };
  console.log(`  Defekt ausgelöst: ${defects.length > 0} nach ${attempts} Versuchen`);
  if (defects.length > 0) {
    console.log(`  Ursache: ${defects[0].cause}`);
    console.log(`  Optionen: ${(defects[0].options || []).map(o => o.id).join(", ")}`);
  }
}

// --- Test 3: Ladeverzögerung ---
console.log("\n=== Test 3: Ladeverzögerung ===");
{
  // Frischer Spielstand für saubere Bedingungen
  const s = makeState();
  s.company.accountCents = 50000000;
  applyCommand(s, "buyVehicle", {});
  const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
  if (driverApps[0]) applyCommand(s, "hireEmployee", { applicantId: driverApps[0].id });
  const v = s.vehicles[0];
  const d = s.drivers[0];
  v.condition = 100; // Kein Defekt, nur Ladeverzögerung
  let delayTriggered = false;
  let attempts = 0;
  for (let attempt = 0; attempt < 50 && !delayTriggered; attempt++) {
    const offered = s.orders.find(o => o.status === "offered" && o.tons <= v.capacityTons);
    if (!offered) { applyCommand(s, "advanceTime", { minutes: 60 }); continue; }
    try { applyCommand(s, "acceptOrder", { orderId: offered.id }); } catch (e) { continue; }
    try { applyCommand(s, "startTransport", { orderId: offered.id, vehicleId: v.id, driverId: d.id }); } catch (e) {}
    attempts++;
    const delays = getActiveDisruptions(s).filter(d => d.type === "loading_delay");
    if (delays.length > 0) { delayTriggered = true; break; }
    // Tour abschließen und weiter versuchen
    applyCommand(s, "advanceTime", { minutes: 1440 });
    if (v.status !== "free") { v.status = "free"; v.tripId = null; }
  }
  const delays = getActiveDisruptions(s).filter(d => d.type === "loading_delay");
  results.loadingDelay = {
    triggered: delays.length > 0,
    attempts,
    count: delays.length,
    details: delays.map(d => ({ id: d.id, cause: d.cause, delayMin: d.delayMin, status: d.status })),
  };
  console.log(`  Verzögerung ausgelöst: ${delays.length > 0} nach ${attempts} Versuchen`);
  if (delays.length > 0) {
    console.log(`  Verzögerung: ${delays[0].delayMin} Min, Ursache: ${delays[0].cause}`);
  }
}

// --- Test 4: Personalausfall (Krankmeldung) ---
console.log("\n=== Test 4: Personalausfall ===");
{
  const s = makeScaledState();
  // Fahrer suchen, der auf Tour ist
  const driverOnTour = s.drivers.find(d => d.status === "on_trip");
  if (driverOnTour) {
    const before = countDisruptions(s);
    applyCommand(s, "reportSickness", { personId: driverOnTour.id, expectedDurationDays: 3 });
    const after = countDisruptions(s);
    const absences = getActiveDisruptions(s).filter(d => d.type === "personnel_absence");
    results.personnelAbsence = {
      triggered: absences.length > 0,
      count: absences.length,
      details: absences.map(d => ({ id: d.id, cause: d.cause, status: d.status, personId: d.personId })),
    };
    console.log(`  Störung ausgelöst: ${absences.length > 0}, Anzahl: ${absences.length}`);
    if (absences.length > 0) {
      console.log(`  Ursache: ${absences[0].cause}`);
      console.log(`  Optionen: ${(absences[0].options || []).map(o => o.id).join(", ")}`);
    }
  } else {
    // Falls kein Fahrer auf Tour, krankmelden eines freien Fahrers testen
    const freeDriver = s.drivers[0];
    if (freeDriver) {
      applyCommand(s, "reportSickness", { personId: freeDriver.id, expectedDurationDays: 3 });
      const absences = getActiveDisruptions(s).filter(d => d.type === "personnel_absence");
      results.personnelAbsence = {
        triggered: absences.length > 0,
        count: absences.length,
        note: "Freier Fahrer (keine Tour betroffen)",
      };
      console.log(`  Freier Fahrer krankgemeldet — Störung: ${absences.length > 0} (erwartet: false, keine Tour)`);
    } else {
      results.personnelAbsence = { skipped: true };
      console.log("  Übersprungen");
    }
  }
}

// --- Test 5: Störung ohne Ersatzlösung ---
console.log("\n=== Test 5: Störung ohne Ersatzlösung ===");
{
  // Frischer Spielstand: 1 Lkw, 1 Fahrer — keine Reserven
  const s = makeState();
  s.company.accountCents = 50000000;
  applyCommand(s, "buyVehicle", {});
  const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
  if (driverApps[0]) applyCommand(s, "hireEmployee", { applicantId: driverApps[0].id });
  const v = s.vehicles[0];
  const d = s.drivers[0];
  v.condition = 25; // Über Schwelle, hohes Defektrisiko
  let defectFound = false;
  for (let attempt = 0; attempt < 50 && !defectFound; attempt++) {
    const offered = s.orders.find(o => o.status === "offered" && o.tons <= v.capacityTons);
    if (!offered) { applyCommand(s, "advanceTime", { minutes: 60 }); continue; }
    try { applyCommand(s, "acceptOrder", { orderId: offered.id }); } catch (e) { continue; }
    try { applyCommand(s, "startTransport", { orderId: offered.id, vehicleId: v.id, driverId: d.id }); } catch (e) {}
    const defects = getActiveDisruptions(s).filter(d => d.type === "technical_defect");
    if (defects.length > 0) { defectFound = true; break; }
    applyCommand(s, "advanceTime", { minutes: 1440 });
    if (v.status !== "free") { v.status = "free"; v.tripId = null; v.condition = 25; }
  }
  const defects = getActiveDisruptions(s).filter(d => d.type === "technical_defect");
  const noReplace = defects.filter(d => !(d.options || []).some(o => o.id === "replace_vehicle" && o.available));
  results.noReplacement = {
    defectCount: defects.length,
    noReplaceAvailable: noReplace.length,
    details: defects.map(d => ({
      id: d.id,
      options: (d.options || []).map(o => ({ id: o.id, available: o.available, reason: o.unavailableReason })),
    })),
  };
  console.log(`  Defekte: ${defects.length}, ohne Ersatzfahrzeug-Option: ${noReplace.length}`);
  if (defects.length > 0) {
    console.log(`  Optionen:`, (defects[0].options || []).map(o => `${o.id}(${o.available ? "ja" : "nein"})`).join(", "));
  }
}

// --- Test 6: Laufzeitvergleich mit/ohne Störungen ---
console.log("\n=== Test 6: Laufzeitvergleich ===");
{
  // Beide mit identischem Spielstand, nur Condition unterschiedlich
  const base = makeScaledState();
  // Ohne Störungen (guter Zustand)
  const s1 = JSON.parse(JSON.stringify(base));
  for (const v of s1.vehicles) v.condition = 100;
  const t0 = Date.now();
  applyCommand(s1, "advanceTime", { minutes: 1440 });
  const msClean = Date.now() - t0;

  // Mit Störungen (mittlerer Zustand — über Schwelle 20, aber risikoreich)
  const s2 = JSON.parse(JSON.stringify(base));
  for (const v of s2.vehicles) v.condition = 25;
  const t1 = Date.now();
  applyCommand(s2, "advanceTime", { minutes: 1440 });
  const msDisrupted = Date.now() - t1;

  results.runtime = {
    cleanMs: msClean,
    disruptedMs: msDisrupted,
    overhead: msDisrupted - msClean,
    overheadPct: msClean > 0 ? Math.round(((msDisrupted - msClean) / msClean) * 100) : 0,
    disruptionsInDisrupted: countDisruptions(s2),
  };
  console.log(`  Sauber: ${msClean}ms, Mit Störungen: ${msDisrupted}ms, Overhead: ${msDisrupted - msClean}ms (${results.runtime.overheadPct}%)`);
}

// --- Test 7: getDisruptions / getDisruptionDetail / resolveDisruption Befehle ---
console.log("\n=== Test 7: Befehls-Handler ===");
{
  // Spielstand mit Störung erzeugen (wie Test 2)
  const s = makeState();
  s.company.accountCents = 50000000;
  applyCommand(s, "buyVehicle", {});
  const driverApps = (s.availableApplicants || []).filter(a => a.role === "driver");
  if (driverApps[0]) applyCommand(s, "hireEmployee", { applicantId: driverApps[0].id });
  const v = s.vehicles[0];
  const d = s.drivers[0];
  v.condition = 25;
  for (let attempt = 0; attempt < 50; attempt++) {
    const offered = s.orders.find(o => o.status === "offered" && o.tons <= v.capacityTons);
    if (!offered) { applyCommand(s, "advanceTime", { minutes: 60 }); continue; }
    try { applyCommand(s, "acceptOrder", { orderId: offered.id }); } catch (e) { continue; }
    try { applyCommand(s, "startTransport", { orderId: offered.id, vehicleId: v.id, driverId: d.id }); } catch (e) {}
    const defects = getActiveDisruptions(s).filter(d => d.type === "technical_defect");
    if (defects.length > 0) break;
    applyCommand(s, "advanceTime", { minutes: 1440 });
    if (v.status !== "free") { v.status = "free"; v.tripId = null; v.condition = 25; }
  }

  const r1 = applyCommand(s, "getDisruptions", {});
  results.commands = {
    getDisruptions: { ok: r1.result?.ok, count: r1.result?.disruptions?.length || 0 },
  };
  console.log(`  getDisruptions: ok=${r1.result?.ok}, count=${r1.result?.disruptions?.length || 0}`);

  if (r1.result?.disruptions?.length > 0) {
    const id = r1.result.disruptions[0].id;
    const r2 = applyCommand(s, "getDisruptionDetail", { disruptionId: id });
    results.commands.getDisruptionDetail = { ok: r2.result?.ok, hasDetail: !!r2.result?.detail, optionCount: r2.result?.detail?.options?.length || 0 };
    console.log(`  getDisruptionDetail: ok=${r2.result?.ok}, hasDetail=${!!r2.result?.detail}, optionen=${r2.result?.detail?.options?.length || 0}`);

    if (r2.result?.detail?.options?.length > 0) {
      const opt = r2.result.detail.options.find(o => o.available);
      if (opt) {
        const r3 = applyCommand(s, "resolveDisruption", { disruptionId: id, optionId: opt.id });
        results.commands.resolveDisruption = { ok: r3.result?.ok, informationOnly: r3.result?.informationOnly, optionId: opt.id };
        console.log(`  resolveDisruption (${opt.id}): ok=${r3.result?.ok}, informationOnly=${r3.result?.informationOnly}`);

        // Danach Status prüfen
        const r4 = applyCommand(s, "getDisruptionDetail", { disruptionId: id });
        results.commands.afterResolve = { status: r4.result?.detail?.status, measureRunning: r4.result?.detail?.status === "measure_running" };
        console.log(`  Status nach resolve: ${r4.result?.detail?.status}`);
      }
    }
  }
}

console.log("\n=== Ergebnisse ===");
console.log(JSON.stringify(results, null, 2));