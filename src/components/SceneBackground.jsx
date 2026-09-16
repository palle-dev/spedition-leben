import React, { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { EASE } from "@/lib/motion";

// Szenen-Konfiguration: jedes Spielgebiet hat sein eigenes cineastisches Hintergrundbild.
// Business-Szenen nutzen shade-office, das Privatleben nutzt shade-home.
const SCENES = {
  office: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/af8b503ab_office_cinematic.png",
    shade: "shade-office",
  },
  home: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/109d5d567_home_cinematic.png",
    shade: "shade-home",
  },
  orders: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/b573fb6c7_generated_image.png",
    shade: "shade-office",
  },
  fleet: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/5036cf6c9_generated_image.png",
    shade: "shade-office",
  },
  personnel: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/cf88eef93_generated_image.png",
    shade: "shade-office",
  },
  finances: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/8304e7600_generated_image.png",
    shade: "shade-office",
  },
  branches: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/46d70713f_generated_image.png",
    shade: "shade-office",
  },
  investment: {
    url: "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/e146ba94c_generated_image.png",
    shade: "shade-office",
  },
};

// Atmosphärischer Hintergrund: cineastische Szenen mit Überblendung,
// Schattierung für Lesbarkeit, subtiler Parallaxe auf Desktop und
// sauberem Fallback bei Asset-Fehlern. Nur besuchte Szenen werden geladen.
export default function SceneBackground({ scene, motionEnabled }) {
  const config = SCENES[scene] || SCENES.office;
  const [visited, setVisited] = useState(() => new Set([scene]));
  const [failed, setFailed] = useState(() => new Set());

  useEffect(() => {
    setVisited((prev) => (prev.has(scene) ? prev : new Set(prev).add(scene)));
  }, [scene]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 20 });
  const sy = useSpring(my, { stiffness: 40, damping: 20 });
  const tx = useTransform(sx, (v) => `${v}px`);
  const ty = useTransform(sy, (v) => `${v}px`);

  useEffect(() => {
    if (!motionEnabled) { mx.set(0); my.set(0); return; }
    let raf = false;
    const handler = (e) => {
      if (raf || e.pointerType === "touch" || window.innerWidth < 960) return;
      raf = true;
      requestAnimationFrame(() => {
        mx.set((e.clientX / window.innerWidth - 0.5) * 6);
        my.set((e.clientY / window.innerHeight - 0.5) * 4);
        raf = false;
      });
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [motionEnabled, mx, my]);

  function markFailed(s) {
    setFailed((prev) => new Set(prev).add(s));
  }

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-ink" aria-hidden="true">
      {/* Szenen-Layer: nur besuchte Szenen werden gerendert, aktive eingeblendet */}
      {[...visited].map((s) => {
        const cfg = SCENES[s];
        if (!cfg) return null;
        const isActive = s === scene;
        const isFailed = failed.has(s);
        return (
          <motion.div
            key={s}
            className="absolute inset-0"
            animate={{ opacity: isActive ? 1 : 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            style={{ scale: motionEnabled ? 1.03 : 1 }}
          >
            <motion.div className="w-full h-full" style={{ x: motionEnabled ? tx : 0, y: motionEnabled ? ty : 0 }}>
              {isFailed ? (
                <div className="w-full h-full bg-gradient-to-br from-[#1a1e22] to-[#0b1011]" />
              ) : (
                <img
                  src={cfg.url}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => markFailed(s)}
                />
              )}
            </motion.div>
          </motion.div>
        );
      })}

      {/* Schattierung für Lesbarkeit (aktive Szene) */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${config.shade}`} />

      {/* Atmosphärisches Glühen */}
      <div
        className="absolute -right-52 -top-64 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(232,212,164,0.06), transparent 67%)" }}
      />
    </div>
  );
}