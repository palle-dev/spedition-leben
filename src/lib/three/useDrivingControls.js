import { useEffect, useRef, useState, useCallback } from "react";

// Steuerungs-Hook für das Fahr-Mini-Spiel und die Probefahrt.
// Tastatur (WASD/Pfeile) auf Desktop, Touch-Buttons auf Mobil.
// Gibt { read, setTouch } zurück: read() liefert aktuelle Eingabe,
// setTouch aktualisiert die Button-Zustände.

export function useDrivingControls(enabled = true) {
  const [touchState, setTouchState] = useState({ throttle: 0, brake: 0, left: 0, right: 0 });
  const keys = useRef({});

  useEffect(() => {
    if (!enabled) return;
    function down(e) {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      keys.current[k] = true;
    }
    function up(e) {
      keys.current[e.key.toLowerCase()] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled]);

  const setTouch = useCallback((patch) => {
    setTouchState(prev => ({ ...prev, ...patch }));
  }, []);

  function read() {
    const k = keys.current;
    const throttle = Math.max(touchState.throttle, (k["w"] || k["arrowup"]) ? 1 : 0);
    const brake = Math.max(touchState.brake, (k["s"] || k["arrowdown"] || k[" "]) ? 1 : 0);
    const left = Math.max(touchState.left, (k["a"] || k["arrowleft"]) ? 1 : 0);
    const right = Math.max(touchState.right, (k["d"] || k["arrowright"]) ? 1 : 0);
    return { throttle, brake, left, right };
  }

  return { read, setTouch };
}

// Vereinfachte Fahrphysik: aktualisiert ein Vehicle-State-Objekt.
// state: { x, z, heading (rad), speed (units/s) }
// input: { throttle, brake, left, right } (0..1)
// dt: Sekunden
// params: { maxSpeed, accel, brakeDecel, drag, steerRate }
export function updateVehicle(state, input, dt, params) {
  const p = params;
  if (input.throttle > 0) state.speed += p.accel * input.throttle * dt;
  if (input.brake > 0) state.speed -= p.brakeDecel * input.brake * dt;
  if (input.throttle === 0 && input.brake === 0) {
    const drag = p.drag * dt;
    state.speed -= Math.sign(state.speed) * Math.min(Math.abs(state.speed), drag);
  }
  state.speed = Math.max(-p.maxSpeed * 0.4, Math.min(p.maxSpeed, state.speed));

  const steerInput = input.left - input.right;
  if (Math.abs(state.speed) > 0.1 && steerInput !== 0) {
    const speedFactor = Math.min(1, Math.abs(state.speed) / (p.maxSpeed * 0.5));
    const turnRate = p.steerRate * steerInput * (state.speed >= 0 ? 1 : -1) * (0.4 + 0.6 * speedFactor);
    state.heading += turnRate * dt;
  }

  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;
  return state;
}

export const DEFAULT_VEHICLE_PARAMS = {
  maxSpeed: 22,
  accel: 8,
  brakeDecel: 16,
  drag: 2.5,
  steerRate: 1.2,
};