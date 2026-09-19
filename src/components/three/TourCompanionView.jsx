import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { buildTruck } from "@/lib/three/truckModel";
import { createBaseScene, buildStraightRoad } from "@/lib/three/sceneKit";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, Truck as TruckIcon } from "lucide-react";

// 3D-Begleitansicht einer laufenden Tour: Kamera folgt dem Lkw auf der Strecke,
// reine Beobachtung ohne Steuerungseinfluss.
export default function TourCompanionView({ vehicleType = "standard", bodyType = "planen", fromCity, toCity, onClose }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const canvas = mountRef.current;
    const { renderer, scene, camera, dispose } = createBaseScene(canvas, { fogNear: 20, fogFar: 160 });

    const road = buildStraightRoad(600, 9);
    scene.add(road);

    const truck = buildTruck(vehicleType, bodyType);
    truck.position.set(0, 0, 0);
    truck.rotation.y = 0;
    scene.add(truck);

    // Landschaftliche Akzente am Straßenrand (Bäume / Laternen)
    for (let i = 0; i < 40; i++) {
      const z = -i * 15 - 5;
      for (const sx of [-1, 1]) {
        const tree = new THREE.Mesh(
          new THREE.ConeGeometry(1.2, 3, 7),
          new THREE.MeshStandardMaterial({ color: 0x1f3528, roughness: 0.9 })
        );
        tree.position.set(sx * (8 + Math.random() * 6), 1.5, z + (Math.random() - 0.5) * 4);
        tree.castShadow = true;
        scene.add(tree);
      }
    }

    camera.position.set(0, 5, -10);
    camera.lookAt(0, 1, 5);

    let raf;
    let last = performance.now();
    let progress = 0; // 0..1 entlang der Strecke
    const speed = 18; // units/s

    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      progress += (speed * dt) / 600;
      if (progress > 1.1) progress = -0.1;

      const z = -progress * 600;
      // Leichtes Schlingern für Lebendigkeit
      const sway = Math.sin(progress * 12) * 0.3;
      truck.position.set(sway, 0, z);

      // Kamera folgt hinter dem Lkw
      camera.position.set(sway * 0.5, 5, z + 12);
      camera.lookAt(sway, 1.5, z - 5);

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

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-ink/90 backdrop-blur-md flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-surface/60">
        <div className="flex items-center gap-2.5">
          <Eye className="w-5 h-5 text-lime" />
          <div>
            <div className="text-sm font-medium">Tour begleiten</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <TruckIcon className="w-3 h-3" /> {fromCity} → {toCity}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Zurück
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <canvas ref={mountRef} className="w-full h-full block" />
      </div>
    </motion.div>,
    document.body
  );
}