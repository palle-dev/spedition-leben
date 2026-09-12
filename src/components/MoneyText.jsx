import React, { useEffect, useRef, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";

// Animierte Geldanzeige: zählt nur bei bestätigter Änderung vom alten
// zum neuen Betrag (300–450 ms). Beim Neuladen wird sofort der echte
// Wert gezeigt – niemals von null hochgezählt.
export default function MoneyText({ value, className = "", accentOnFlash }) {
  const { motionEnabled } = useGame();
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const firstRef = useRef(true);
  const prevRef = useRef(value);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    setFlash(true);
    const flashTimer = setTimeout(() => setFlash(false), 700);
    if (!motionEnabled) {
      setDisplay(value);
      return () => clearTimeout(flashTimer);
    }
    const start = performance.now();
    const dur = 400;
    let raf;
    const animate = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(animate);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); clearTimeout(flashTimer); };
  }, [value, motionEnabled]);

  const flashClass = flash && accentOnFlash ? accentOnFlash : "";
  return <span className={`tabular-nums transition-colors duration-500 ${flashClass} ${className}`}>{formatEuro(display)}</span>;
}