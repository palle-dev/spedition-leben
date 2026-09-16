import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail as MailIcon } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { backdrop, popIn as modalPop } from "@/lib/motion";
import MailConversationList from "@/components/mail/MailConversationList";
import MailConversationView from "@/components/mail/MailConversationView";
import MailComposer from "@/components/mail/MailComposer";

// Postfach als modales Fenster — zentriert, nahezu vollflächig.
export default function MailModal({ open, onClose }) {
  const { state } = useGame();
  const [folder, setFolder] = useState("inbox");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm" {...backdrop} onClick={onClose} />
          <motion.div
            className="absolute left-1/2 top-1/2 w-[94vw] max-w-[1400px] h-[88vh] -translate-x-1/2 -translate-y-1/2 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
            {...modalPop}
            role="dialog"
            aria-modal="true"
            aria-label="Postfach"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-lg font-medium tracking-tight">Postfach</h2>
                <p className="text-[11px] text-muted-foreground">Interne Kommunikation mit Mitarbeitern</p>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 grid place-items-center text-muted-foreground hover:text-foreground transition shrink-0"
                aria-label="Schließen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inhalt */}
            {!state?.mail ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <MailIcon className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Postfach wird initialisiert…</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 overflow-hidden">
                {/* Listen-Spalte */}
                <div className={`flex-1 lg:flex-none lg:w-2/5 rounded-xl bg-surface/60 border border-white/10 overflow-hidden ${selectedConvId ? "hidden lg:flex" : "flex"} flex-col`}>
                  <MailConversationList
                    state={state}
                    folder={folder}
                    setFolder={setFolder}
                    filter={filter}
                    setFilter={setFilter}
                    query={query}
                    setQuery={setQuery}
                    selectedConvId={selectedConvId}
                    onSelect={setSelectedConvId}
                    onCompose={() => setComposerOpen(true)}
                  />
                </div>

                {/* Detail-Spalte */}
                <div className={`flex-1 rounded-xl bg-surface/60 border border-white/10 overflow-hidden ${selectedConvId ? "flex" : "hidden lg:flex"} flex-col`}>
                  {selectedConvId ? (
                    <MailConversationView
                      state={state}
                      conversationId={selectedConvId}
                      onBack={() => setSelectedConvId(null)}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <MailIcon className="w-8 h-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground">Wähle eine Unterhaltung aus der Liste.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {composerOpen && state?.mail && (
              <MailComposer state={state} onClose={() => setComposerOpen(false)} />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}