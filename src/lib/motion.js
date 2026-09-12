// Einheitliches Motion-System für "Spedition & Leben".
// Nutzt framer-motion mit einer gemeinsamen Abbremskurve.
// Alle Werte sind aus Zustandswechseln abgeleitet – keine dekorative Dauerbewegung.

export const EASE = [0.2, 0.75, 0.2, 1];

export const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.5, ease: EASE }
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.4, ease: EASE }
};

export const stagger = {
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } }
};

export const drawerSlide = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { duration: 0.32, ease: EASE }
};

export const backdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: EASE }
};

export const popIn = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { duration: 0.5, ease: EASE }
};

export const sceneCrossfade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.8, ease: EASE }
};

// Stufenweise Enthüllung für Szeneninhalte
export const heroStagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } }
};

export const heroItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } }
};