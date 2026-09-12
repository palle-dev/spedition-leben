import React, { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { EASE } from "@/lib/motion";

const OFFICE_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/af8b503ab_office_cinematic.png";
const HOME_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/109d5d567_home_cinematic.png";

// Atmosphärischer Hintergrund: zwei cineastische Szenen mit Überblendung,
// Schattierung für Lesbarkeit, subtiler Parallaxe auf Desktop und
// sauberem Fallback bei Asset-Fehlern. Keine dekorative Dauerbewegung.
export default function SceneBackground({ scene, motionEnabled }) {
  const isHome = scene === "home";
  const [officeError, setOfficeError] = useState(false);
  const [homeError, setHomeError] = useState(false);

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

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-ink" aria-hidden="true">
      {/* Büro-Szene */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: isHome ? 0 : 1 }}
        transition={{ duration: 0.8, ease: EASE }}
        style={{ scale: motionEnabled ? 1.03 : 1 }}
      >
        <motion.div className="w-full h-full" style={{ x: motionEnabled ? tx : 0, y: motionEnabled ? ty : 0 }}>
          {officeError ? (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1e22] to-[#0b1011]" />
          ) : (
            <img
              src={OFFICE_URL}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setOfficeError(true)}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Wohnungs-Szene */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: isHome ? 1 : 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        style={{ scale: motionEnabled ? 1.03 : 1 }}
      >
        <motion.div className="w-full h-full" style={{ x: motionEnabled ? tx : 0, y: motionEnabled ? ty : 0 }}>
          {homeError ? (
            <div className="w-full h-full bg-gradient-to-br from-[#2a1d1d] to-[#100f10]" />
          ) : (
            <img
              src={HOME_URL}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setHomeError(true)}
            />
          )}
        </motion.div>
      </motion.div>

      {/* Schattierung für Lesbarkeit */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isHome ? "shade-home" : "shade-office"}`} />

      {/* Atmosphärisches Glühen */}
      <div
        className="absolute -right-52 -top-64 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(232,212,164,0.06), transparent 67%)" }}
      />
    </div>
  );
}