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
import DecisionModal from "@/components/game/DecisionModal";
import ToastStack from "@/components/notifications/ToastStack";
import { HeaderSlotProvider } from "@/lib/headerSlot";

export default function GameShell() {
  return (
    <HeaderSlotProvider>
      <GameShellContent />
    </HeaderSlotProvider>
  );
}

function GameShellContent() {
  const { state, loading, showStart, toast, motionEnabled, overlay, dismissOverlay, toasts, dismissToast, connectionState, hasLock, localSaveError, save, exportGame } = useGame();
  const location = useLocation();

  if (!hasLock) return (
    <div className="min-h-screen bg-ink text-foreground grid place-items-center p-6">
      <div className="max-w-lg space-y-4" role="alert">
        <h1 className="text-xl font-semibold">Spiel in einem anderen Tab geöffnet</h1>
        <p>Bitte den anderen Spiel-Tab schließen und diese Seite neu laden. Falls kein anderer Tab geöffnet ist, prüfe die Speicherfreigabe Deines Browsers.</p>
        <button className="rounded-lg bg-lime px-4 py-2 text-ink" onClick={() => window.location.reload()}>Neu laden</button>
      </div>
    </div>
  );
  if (loading) return <LoadingScreen />;
  const downloadBackup = () => {
    const data = exportGame();
    if (!data) return;
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "Fernwerk_Sicherung_" + Date.now() + ".json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const storageWarning = localSaveError && (
    <div className="relative z-30 bg-red-950 text-red-100 border-b border-red-400/40 px-4 py-3 text-sm flex flex-wrap items-center gap-3 shrink-0" role="alert">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{localSaveError}</span>
      {state && <button className="underline font-semibold" onClick={save}>Erneut speichern</button>}
      {state && <button className="underline font-semibold" onClick={downloadBackup}>Sicherung herunterladen</button>}
    </div>
  );
  if (showStart || !state) return <>{storageWarning}<StartScreen />{toast && <ToastView toast={toast} />}</>;

  const SCENE_MAP = {
    "/zuhause": "home",
    "/auftraege": "orders",
    "/fuhrpark": "fleet",
    "/personal": "personnel",
    "/finanzen": "finances",
    "/filialen": "branches",
    "/investment": "investment",
  };
  const scene = SCENE_MAP[location.pathname] || "office";
  const blocked = state.appointments.find(a => a.status === "active");

  return (
    <MotionConfig reducedMotion={motionEnabled ? "user" : "always"}>
      <div className="relative h-[100dvh] flex flex-col overflow-hidden">
        <SceneBackground scene={scene} motionEnabled={motionEnabled} />
        <div className="relative z-10 flex flex-col h-full min-h-0">
          <ShellHeader />
          {storageWarning}
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
            {(state.onboarding?.active || state.tutorial?.active) && (
              <div className="px-4 sm:px-6 lg:px-12 pt-4 max-w-[1600px] mx-auto">
                <Tutorial />
              </div>
            )}
            <Outlet />
          </main>
          <ShellDock />
        </div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <AnimatePresence>
          {toast && <ToastView key={toast.id} toast={toast} />}
        </AnimatePresence>
        <EventOverlay overlay={overlay} onDismiss={dismissOverlay} />
        <DecisionModal />
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