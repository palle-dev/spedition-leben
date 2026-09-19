import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { buildTruck, truckDimensions } from "@/lib/three/truckModel";
import { createBaseScene, buildOvalTrack } from "@/lib/three/sceneKit";
import { useDrivingControls, updateVehicle, DEFAULT_VEHICLE_PARAMS } from "@/lib/three/useDrivingControls";
import { motion } from "framer-motion";
import { Truck, RotateCw, Play, ArrowLeft, Gauge } from "lucide-react";

// Showroom nach Lkw-Kauf: drehbarer 3D-Lkw auf Podest + Probefahrt auf Ovalstrecke.
export default function VehicleShowroom({ vehicleType = "standard", bodyType = "planen", vehicleLabel, onClose }) {
  const [mode, setMode] = useState("showroom"); // "showroom" | "drive"
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-ink/90 backdrop-blur-md flex flex-col"
    >
      <ShowroomHeader mode={mode} vehicleLabel={vehicleLabel} onClose={onClose} />
      <div className="flex-1 min-h-0 relative">
        {mode === "showroom" ? (
          <ShowroomCanvas vehicleType={vehicleType} bodyType={bodyType} />
        ) : (
          <ProbefahrtCanvas vehicleType={vehicleType} bodyType={bodyType} />
        )}
      </div>
      <ShowroomFooter mode={mode} setMode={setMode} onClose={onClose} />
    </motion.div>,
    document.body
  );
}

function ShowroomHeader({ mode, vehicleLabel, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-surface/60">
      <div className="flex items-center gap-2.5">
        <Truck className="w-5 h-5 text-lime" />
        <div>
          <div className="text-sm font-medium">{mode === "showroom" ? "Lkw-Showroom" : "Probefahrt"}</div>
          <div className="text-xs text-muted-foreground">{vehicleLabel || "Neuer Lkw"}</div>
        </div>
      </div>
      <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition">
        <ArrowLeft className="w-3.5 h-3.5" /> Schließen
      </button>
    </div>
  );
}

function ShowroomFooter({ mode, setMode, onClose }) {
  return (
    <div className="flex items-center justify-center gap-3 px-5 py-4 border-t border-white/10 bg-surface/60">
      {mode === "showroom" ? (
        <button
          onClick={() => setMode("drive")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime text-ink text-sm font-semibold hover:brightness-110 transition active:scale-95"
        >
          <Play className="w-4 h-4" /> Probefahrt starten
        </button>
      ) : (
        <button
          onClick={() => setMode("showroom")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-foreground hover:bg-white/10 transition active:scale-95"
        >
          <RotateCw className="w-4 h-4" /> Zurück zum Showroom
        </button>
      )}
      <button
        onClick={onClose}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm text-muted-foreground hover:text-foreground hover:bg-white/10 transition active:scale-95"
      >
        Zum Fuhrpark
      </button>
    </div>
  );
}

// ---- Showroom: drehbarer Lkw auf Podest ----
function ShowroomCanvas({ vehicleType, bodyType }) {
  const mountRef = useRef(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const canvas = mountRef.current;
    const { renderer, scene, camera, dispose } = createBaseScene(canvas, { fogNear: 40, fogFar: 180 });
    scene.background = new THREE.Color(0x0e1416);

    // Podest
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(6, 6.5, 0.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x1a2226, roughness: 0.6, metalness: 0.3 })
    );
    podium.position.y = 0.2;
    podium.receiveShadow = true;
    scene.add(podium);

    // Ring um Podest
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 0.08, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x80c080, emissive: 0x80c080, emissiveIntensity: 0.4 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.42;
    scene.add(ring);

    const truck = buildTruck(vehicleType, bodyType);
    truck.position.y = 0.42;
    scene.add(truck);

    camera.position.set(7, 4.5, 9);
    camera.lookAt(0, 2, 0);

    let raf;
    let autoRotate = true;
    let dragRot = null;
    let userAngle = 0;

    function onDown(e) {
      dragRot = { x: e.clientX || e.touches?.[0]?.clientX, angle: userAngle };
      autoRotate = false;
      setHint(false);
    }
    function onMove(e) {
      if (!dragRot) return;
      const x = e.clientX || e.touches?.[0]?.clientX;
      userAngle = dragRot.angle + (x - dragRot.x) * 0.01;
      truck.rotation.y = userAngle;
    }
    function onUp() { dragRot = null; }
    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);

    function loop() {
      raf = requestAnimationFrame(loop);
      if (autoRotate) {
        userAngle += 0.004;
        truck.rotation.y = userAngle;
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
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("touchstart", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      dispose();
    };
  }, [vehicleType, bodyType]);

  return (
    <div className="absolute inset-0">
      <canvas ref={mountRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />
      {hint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-surface/70 px-3 py-1.5 rounded-full border border-white/10">
          Ziehen zum Drehen
        </div>
      )}
    </div>
  );
}

// ---- Probefahrt: Ovalstrecke mit Steuerung ----
function ProbefahrtCanvas({ vehicleType, bodyType }) {
  const mountRef = useRef(null);
  const { read, setTouch } = useDrivingControls(true);
  const [speedKmh, setSpeedKmh] = useState(0);

  useEffect(() => {
    const canvas = mountRef.current;
    const { renderer, scene, camera, dispose } = createBaseScene(canvas);

    const track = buildOvalTrack();
    scene.add(track);

    const truck = buildTruck(vehicleType, bodyType);
    scene.add(truck);

    const veh = { x: 0, z: 60, heading: Math.PI, speed: 0 };
    truck.position.set(veh.x, 0, veh.z);
    truck.rotation.y = veh.heading;

    camera.position.set(0, 6, 14);

    let raf;
    let last = performance.now();

    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const input = read();
      updateVehicle(veh, input, dt, DEFAULT_VEHICLE_PARAMS);

      truck.position.set(veh.x, 0, veh.z);
      truck.rotation.y = veh.heading;

      // Kamera folgt hinter dem Lkw
      const camX = veh.x - Math.sin(veh.heading) * 12;
      const camZ = veh.z - Math.cos(veh.heading) * 12;
      camera.position.lerp(new THREE.Vector3(camX, 6, camZ), 0.08);
      camera.lookAt(veh.x, 1.5, veh.z);

      setSpeedKmh(Math.round(Math.abs(veh.speed) * 3.6 * 2.5));

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

  return (
    <div className="absolute inset-0">
      <canvas ref={mountRef} className="w-full h-full block" />
      {/* Tacho */}
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-surface/70 backdrop-blur px-3.5 py-2 rounded-xl border border-white/10">
        <Gauge className="w-4 h-4 text-lime" />
        <span className="text-sm font-medium tabular-nums">{speedKmh} km/h</span>
      </div>
      {/* Touch-Buttons */}
      <TouchControls setTouch={setTouch} />
    </div>
  );
}

export function TouchControls({ setTouch }) {
  const btn = "select-none active:scale-95 transition flex items-center justify-center rounded-2xl bg-surface/70 backdrop-blur border border-white/15 text-foreground text-lg font-bold";
  return (
    <div className="absolute bottom-5 left-0 right-0 flex items-end justify-between px-6 pointer-events-none">
      {/* Lenken */}
      <div className="flex gap-3 pointer-events-auto">
        <button
          className={`${btn} w-16 h-16`}
          onPointerDown={e => { e.preventDefault(); setTouch({ left: 1 }); }}
          onPointerUp={() => setTouch({ left: 0 })}
          onPointerLeave={() => setTouch({ left: 0 })}
        >◀</button>
        <button
          className={`${btn} w-16 h-16`}
          onPointerDown={e => { e.preventDefault(); setTouch({ right: 1 }); }}
          onPointerUp={() => setTouch({ right: 0 })}
          onPointerLeave={() => setTouch({ right: 0 })}
        >▶</button>
      </div>
      {/* Gas / Bremse */}
      <div className="flex gap-3 pointer-events-auto">
        <button
          className={`${btn} w-16 h-16 bg-red-500/20 border-red-400/30`}
          onPointerDown={e => { e.preventDefault(); setTouch({ brake: 1 }); }}
          onPointerUp={() => setTouch({ brake: 0 })}
          onPointerLeave={() => setTouch({ brake: 0 })}
        >▼</button>
        <button
          className={`${btn} w-20 h-16 bg-lime/20 border-lime/40`}
          onPointerDown={e => { e.preventDefault(); setTouch({ throttle: 1 }); }}
          onPointerUp={() => setTouch({ throttle: 0 })}
          onPointerLeave={() => setTouch({ throttle: 0 })}
        >▲</button>
      </div>
    </div>
  );
}