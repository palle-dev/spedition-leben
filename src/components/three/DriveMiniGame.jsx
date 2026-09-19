import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { buildTruck } from "@/lib/three/truckModel";
import { createBaseScene, buildStraightRoad, buildGate } from "@/lib/three/sceneKit";
import { useDrivingControls, updateVehicle, DEFAULT_VEHICLE_PARAMS } from "@/lib/three/useDrivingControls";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Gauge, Clock, Fuel, AlertTriangle, Flag, Trophy, RotateCw } from "lucide-react";
import { TouchControls } from "./VehicleShowroom";

// Fahr-Mini-Spiel: Spieler fährt eine Tour selbst von Start- zum Ziel-Tor.
// Ergebnis (Zeit, Schaden, Treibstoff) wird ausgewertet und an onComplete übergeben.
export default function DriveMiniGame({ vehicleType = "standard", bodyType = "planen", fromCity, toCity, paymentCents, onComplete, onClose }) {
  const mountRef = useRef(null);
  const { read, setTouch } = useDrivingControls(true);
  const [phase, setPhase] = useState("intro"); // "intro" | "driving" | "result"
  const [speedKmh, setSpeedKmh] = useState(0);
  const [distance, setDistance] = useState(0);
  const [damage, setDamage] = useState(0);
  const [result, setResult] = useState(null);
  const phaseRef = useRef("intro");
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const damageRef = useRef(0);
  const distRef = useRef(0);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const trackLength = 500;

  useEffect(() => {
    const canvas = mountRef.current;
    const { renderer, scene, camera, dispose } = createBaseScene(canvas);

    const road = buildStraightRoad(trackLength, 9);
    scene.add(road);

    // Start-Tor hinter dem Lkw, Ziel-Tor am Ende
    const startGate = buildGate(0x80a0c0);
    startGate.position.set(0, 0, 8);
    scene.add(startGate);
    const goalGate = buildGate(0x80c080);
    goalGate.position.set(0, 0, -trackLength + 10);
    scene.add(goalGate);

    const truck = buildTruck(vehicleType, bodyType);
    truck.position.set(0, 0, 0);
    scene.add(truck);

    const veh = { x: 0, z: 0, heading: 0, speed: 0 };

    camera.position.set(0, 6, 14);
    camera.lookAt(0, 1, 0);

    let raf;
    let last = performance.now();

    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (phaseRef.current === "driving") {
        elapsedRef.current += dt;
        const input = read();
        updateVehicle(veh, input, dt, DEFAULT_VEHICLE_PARAMS);

        // Schaden bei zu starker Kurve / Geschwindigkeit
        const offRoad = Math.abs(veh.x) > 5;
        if (offRoad) {
          damageRef.current += dt * 8;
          veh.speed *= 0.97;
        }

        truck.position.set(veh.x, 0, veh.z);
        truck.rotation.y = veh.heading;

        // Kamera
        const camX = veh.x - Math.sin(veh.heading) * 12;
        const camZ = veh.z - Math.cos(veh.heading) * 12;
        camera.position.lerp(new THREE.Vector3(camX, 6, camZ), 0.1);
        camera.lookAt(veh.x, 1.5, veh.z);

        setSpeedKmh(Math.round(Math.abs(veh.speed) * 3.6 * 2.5));
        distRef.current = Math.max(0, -veh.z);
        setDistance(Math.round((distRef.current / trackLength) * 100));
        setDamage(Math.round(damageRef.current));

        // Ziel erreicht?
        if (veh.z < -trackLength + 10) {
          finishDrive();
        }
      }

      renderer.render(scene, camera);
    }
    loop();

    function onResize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    onResize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      dispose();
    };
  }, [vehicleType, bodyType]);

  function startDrive() {
    startTimeRef.current = performance.now();
    elapsedRef.current = 0;
    damageRef.current = 0;
    distRef.current = 0;
    setDamage(0);
    setDistance(0);
    setPhase("driving");
  }

  function finishDrive() {
    if (phaseRef.current !== "driving") return;
    const time = elapsedRef.current;
    const dmg = Math.round(damageRef.current);
    // Bewertung: Basis-Vergütung + Zeitbonus − Schadenabzug
    const timeBonus = Math.max(0, Math.round((60 - time) * 200));
    const damagePenalty = Math.round(dmg * 150);
    const fuelUsed = Math.round((distRef.current / 100) * 28 * 1.7 * 100); // ~Cents
    const bonus = timeBonus - damagePenalty;
    const totalPayment = Math.max(0, (paymentCents || 0) + bonus);
    const rating = dmg < 5 ? "sehr gut" : dmg < 15 ? "gut" : dmg < 30 ? "befriedigend" : "kritisch";

    setResult({ time: Math.round(time), damage: dmg, fuelUsed, timeBonus, damagePenalty, totalPayment, rating });
    setPhase("result");
    phaseRef.current = "result";
  }

  function abort() {
    onClose();
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-ink/90 backdrop-blur-md flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-surface/60">
        <div className="flex items-center gap-2.5">
          <Flag className="w-5 h-5 text-lime" />
          <div>
            <div className="text-sm font-medium">Selbst fahren</div>
            <div className="text-xs text-muted-foreground">{fromCity} → {toCity}</div>
          </div>
        </div>
        {phase !== "result" && (
          <button onClick={abort} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Abbrechen
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        <canvas ref={mountRef} className="w-full h-full block" />

        {/* HUD während der Fahrt */}
        {phase === "driving" && (
          <>
            <div className="absolute top-4 left-4 flex items-center gap-4">
              <HudChip icon={Gauge} label="Tempo" value={`${speedKmh} km/h`} />
              <HudChip icon={Clock} label="Zeit" value={`${result?.time || Math.round(elapsedRef.current)}s`} />
              <HudChip icon={AlertTriangle} label="Schaden" value={`${damage}%`} tone={damage > 20 ? "bad" : "ok"} />
            </div>
            <div className="absolute top-4 right-4">
              <HudChip icon={Flag} label="Strecke" value={`${distance}%`} />
            </div>
            <TouchControls setTouch={setTouch} />
          </>
        )}

        {/* Intro-Overlay */}
        <AnimatePresence>
          {phase === "intro" && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-ink/60 backdrop-blur-sm"
            >
              <div className="glass-strong border border-white/15 rounded-2xl p-6 max-w-sm text-center">
                <Flag className="w-10 h-10 text-lime mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">Tour selbst übernehmen</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Fahre von {fromCity} nach {toCity}. Schnell und schadensfrei liefert einen Bonus auf die Vergütung.
                </p>
                <div className="text-xs text-muted-foreground/70 mb-4">
                  <span className="hidden sm:inline">Tastatur: </span>W/↑ Gas · S/↓ Bremse · A/← Links · D/→ Rechts
                </div>
                <button
                  onClick={startDrive}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-lime text-ink text-sm font-semibold hover:brightness-110 transition active:scale-95"
                >
                  <Trophy className="w-4 h-4" /> Losfahren
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ergebnis-Overlay */}
        <AnimatePresence>
          {phase === "result" && result && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-ink/70 backdrop-blur-sm p-4"
            >
              <div className="glass-strong border border-white/15 rounded-2xl p-6 max-w-md w-full">
                <div className="flex items-center gap-2.5 mb-4">
                  <Trophy className="w-6 h-6 text-lime" />
                  <h3 className="text-lg font-semibold">Fahrt abgeschlossen</h3>
                </div>
                <div className="space-y-2.5 mb-4">
                  <ResultRow icon={Clock} label="Zeit" value={`${result.time} s`} />
                  <ResultRow icon={AlertTriangle} label="Schaden" value={`${result.damage}%`} tone={result.damage > 20 ? "bad" : "ok"} />
                  <ResultRow icon={Fuel} label="Treibstoff" value={`${(result.fuelUsed / 100).toFixed(2)} €`} />
                  <ResultRow icon={Trophy} label="Zeitbonus" value={`+ ${(result.timeBonus / 100).toFixed(2)} €`} tone="good" />
                  <ResultRow icon={AlertTriangle} label="Schadensabzug" value={`− ${(result.damagePenalty / 100).toFixed(2)} €`} tone={result.damagePenalty > 0 ? "bad" : "neutral"} />
                </div>
                <div className="rounded-xl border border-lime/30 bg-lime/10 p-3.5 mb-4">
                  <div className="text-xs text-muted-foreground mb-1">Bewertung: {result.rating}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Auszahlung</span>
                    <span className="text-xl font-semibold text-lime tabular-nums">{(result.totalPayment / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setResult(null); setPhase("intro"); phaseRef.current = "intro"; }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-foreground hover:bg-white/10 transition active:scale-95"
                  >
                    <RotateCw className="w-4 h-4" /> Nochmal
                  </button>
                  <button
                    onClick={() => onComplete(result)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime text-ink text-sm font-semibold hover:brightness-110 transition active:scale-95"
                  >
                    Übernehmen
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body
  );
}

function HudChip({ icon: Icon, label, value, tone }) {
  const color = tone === "bad" ? "text-red-300" : tone === "ok" ? "text-lime" : "text-foreground";
  return (
    <div className="flex items-center gap-2 bg-surface/70 backdrop-blur px-3 py-2 rounded-xl border border-white/10">
      <Icon className={`w-4 h-4 ${color}`} />
      <div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
        <div className={`text-sm font-medium tabular-nums ${color}`}>{value}</div>
      </div>
    </div>
  );
}

function ResultRow({ icon: Icon, label, value, tone }) {
  const color = tone === "good" ? "text-lime" : tone === "bad" ? "text-red-300" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground flex items-center gap-2"><Icon className="w-4 h-4" /> {label}</span>
      <span className={`tabular-nums font-medium ${color}`}>{value}</span>
    </div>
  );
}