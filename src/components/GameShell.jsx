import React from "react";
import { useLocation, Outlet } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import SceneBackground from "@/components/SceneBackground";
import ShellHeader from "@/components/game/ShellHeader";
import ShellDock from "@/components/game/ShellDock";
import Tutorial from "@/components/Tutorial";
import StartScreen from "@/pages/Start";
import { AlertTriangle, CheckCircle2, Info, WifiOff } from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { EASE } from "@/lib/motion";
import { formatGameTime } from "@/lib/gameData";
import EventOverlay from "@/components/EventOverlay";
import ToastStack from "@/components/notifications/ToastStack";

export default function GameShell() {
  const { state, loading, toast, motionEnabled, overlay, dismissOverlay, toasts, dismissToast, connectionState } = useGame();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!state) return <StartScreen />;

  const isHome = location.pathname === "/zuhause";
  const scene = isHome ? "home" : "office";
  const blocked = state.appointments.find(a => a.status === "active");

  return (
    <MotionConfig reducedMotion={motionEnabled ? "user" : "always"}>
      <div className="relative h-[100dvh] flex flex-col overflow-hidden">
        <SceneBackground scene={scene} motionEnabled={motionEnabled} />
        <div className="relative z-10 flex flex-col h-full min-h-0">
          <ShellHeader />
          {connectionState === "reconnecting" && (
            <div className="relative z-20 bg-amber-500/10 border-b border-amber-500/30 px-4 lg:px-12 py-1.5 text-xs text-amber-300 flex items-center gap-2 shrink-0">
              <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              Verbindung wird wiederhergestellt… (Spielzeit: {formatGameTime(state.gameTime)})
            </div>
          )}
          {blocked && (
            <div className="relative z-20 bg-coral/10 border-b border-coral/30 px-4 lg:px-12 py-2 text-sm text-coral flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Du bist mit einer privaten Aktivität beschäftigt. Operative Aktionen sind bis {formatGameTime(blocked.endMin)} gesperrt.
            </div>
          )}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
          <ShellDock />
        </div>
        {state.tutorial.active && <Tutorial />}
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <AnimatePresence>
          {toast && <ToastView key={toast.id} toast={toast} />}
        </AnimatePresence>
        <EventOverlay overlay={overlay} onDismiss={dismissOverlay} />
      </div>
    </MotionConfig>
  );
}

function LoadingScreen() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink">
      <div className="w-10 h-10 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
    </div>
  );
}

function ToastView({ toast }) {
  const Icon = toast.kind === "error" ? AlertTriangle : toast.kind === "success" ? CheckCircle2 : Info;
  const bg = toast.kind === "error"
    ? "bg-red-500/15 border-red-400/40 text-red-100"
    : toast.kind === "success"
    ? "bg-lime/15 border-lime/40 text-lime"
    : "bg-surface/90 border-white/20 text-foreground";
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md border rounded-xl px-5 py-3 shadow-2xl backdrop-blur-lg flex items-center gap-3 ${bg}`}
      role="status"
      aria-live="polite"
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-sm">{toast.msg}</span>
    </motion.div>
  );
}