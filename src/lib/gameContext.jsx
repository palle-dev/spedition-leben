import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { gameCommand } from "@/lib/gameClient";

const GameContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame muss innerhalb von GameProvider verwendet werden");
  return ctx;
}

const LS_KEY = "spedition_leben_state_id";

export function GameProvider({ children }) {
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(0);
  const [stateId, setStateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return true;
  });
  const revRef = useRef(0);
  const idRef = useRef(null);
  const [overlay, setOverlay] = useState(null);
  const prevAchievementsRef = useRef(new Set());
  const pendingAchievementsRef = useRef([]);
  const dismissOverlay = useCallback(() => {
    setOverlay(null);
    // Nächste ausstehende Auszeichnung anzeigen, falls vorhanden
    if (pendingAchievementsRef.current.length > 0) {
      const next = pendingAchievementsRef.current.shift();
      setTimeout(() => setOverlay({ type: "achievement", data: next }), 300);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);

  const toggleMotion = useCallback(() => setMotionEnabled(v => !v), []);

  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const applyLoaded = useCallback((data) => {
    setState(data.state);
    setRevision(data.revision);
    revRef.current = data.revision;
    setStateId(data.stateId);
    idRef.current = data.stateId;
    if (data.stateId) localStorage.setItem(LS_KEY, data.stateId);
    prevAchievementsRef.current = new Set((data.state?.achievements || []).filter(a => a.unlocked).map(a => a.id));
  }, []);

  const reload = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const data = await gameCommand({ command: "load", stateId: idRef.current });
      applyLoaded(data);
    } catch (e) {
      showToast("Spielstand konnte nicht geladen werden: " + e.message, "error");
    }
  }, [applyLoaded, showToast]);

  useEffect(() => {
    (async () => {
      const savedId = localStorage.getItem(LS_KEY);
      if (savedId) {
        try {
          const data = await gameCommand({ command: "load", stateId: savedId });
          applyLoaded(data);
        } catch (e) {
          localStorage.removeItem(LS_KEY);
        }
      }
      setLoading(false);
    })();
  }, [applyLoaded]);

  const send = useCallback(async (command, params) => {
    if (!idRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true);
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now() + "_" + Math.random());
      const data = await gameCommand({
        stateId: idRef.current,
        action_id,
        expected_revision: revRef.current,
        command,
        params: params || {}
      });
      if (data.conflict) {
        await reload();
        throw new Error(data.error || "Konflikt: Zustand wurde gleichzeitig geändert. Bitte wiederholen.");
      }
      if (data.error) throw new Error(data.error);
      applyLoaded(data);
      const result = data.result;
      if (result?.events) {
        const delivery = result.events.find(e => e.type === "delivery");
        if (delivery) {
          const order = data.state.orders.find(o => o.id === delivery.order);
          const trip = data.state.trips.find(t => t.id === delivery.trip);
          setOverlay({
            type: "delivery",
            data: {
              customer: order?.customer, fromCity: order?.fromCity, toCity: order?.toCity,
              paymentCents: delivery.paymentCents, onTime: delivery.onTime,
              contributionCents: trip ? delivery.paymentCents - trip.fuelCents - trip.tollCents : null
            }
          });
        }
      }
      // Neue Erfolge erkennen und als Overlay anzeigen
      const newAchs = (data.state?.achievements || []).filter(a => a.unlocked && !prevAchievementsRef.current.has(a.id));
      if (newAchs.length > 0) {
        const ACHIEVEMENT_DEFS = await import("@/lib/achievementCatalog.js").then(m => m.ACHIEVEMENTS).catch(() => []);
        const achData = newAchs.map(a => {
          const def = ACHIEVEMENT_DEFS.find(d => d.id === a.id);
          return { id: a.id, title: def?.title || a.id, xp: def?.xp || 0, category: def?.category || "", desc: def?.desc || "" };
        });
        pendingAchievementsRef.current = achData.slice(1);
        setOverlay({ type: "achievement", data: achData[0] });
      }
      prevAchievementsRef.current = new Set((data.state?.achievements || []).filter(a => a.unlocked).map(a => a.id));
      if (command === "startTransport" && result?.fuelCents != null) {
        setOverlay({ type: "transportStart", data: { fuelCents: result.fuelCents, tollCents: result.tollCents, endMin: result.endMin } });
      }
      if (command === "answerInvitation" && result?.choice) {
        setOverlay({
          type: "invitation",
          data: { choice: result.choice, relationship: data.state.private.relationship, happiness: data.state.private.happiness, stress: data.state.private.stress }
        });
      }
      return data.result;
    } catch (e) {
      if (e.response && e.response.data && e.response.data.conflict) {
        await reload();
        throw new Error(e.response.data.error || "Konflikt. Bitte wiederholen.");
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }, [applyLoaded, reload]);

  const newGame = useCallback(async (names) => {
    setBusy(true);
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now());
      const data = await gameCommand({ command: "newGame", action_id, params: names || {} });
      applyLoaded(data);
      return data;
    } finally {
      setBusy(false);
    }
  }, [applyLoaded]);

  const listGames = useCallback(async () => {
    return await gameCommand({ command: "list" });
  }, []);

  const loadGame = useCallback(async (sid) => {
    const data = await gameCommand({ command: "load", stateId: sid });
    applyLoaded(data);
  }, [applyLoaded]);

  const value = { state, revision, stateId, loading, busy, toast, showToast, send, newGame, listGames, loadGame, reload, motionEnabled, toggleMotion, overlay, dismissOverlay };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}