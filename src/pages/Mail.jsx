import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import MailConversationList from "@/components/mail/MailConversationList";
import MailConversationView from "@/components/mail/MailConversationView";
import MailComposer from "@/components/mail/MailComposer";
import { Mail as MailIcon } from "lucide-react";

export default function Mail() {
  const { state } = useGame();
  const [folder, setFolder] = useState("inbox");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);

  if (!state?.mail) {
    return (
      <div className="px-4 sm:px-6 lg:px-12 py-10 max-w-[1600px] mx-auto">
        <div className="flex flex-col items-center justify-center text-center py-20">
          <MailIcon className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Postfach wird initialisiert…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Postfach</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Interne Kommunikation mit Mitarbeitern · Berichte, Entscheidungen und Freitext-Anliegen
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-220px)] min-h-[400px]">
        {/* Listen-Spalte */}
        <div className={`flex-1 lg:flex-none lg:w-2/5 rounded-2xl bg-surface/60 border border-white/10 overflow-hidden ${selectedConvId ? "hidden lg:flex" : "flex"} flex-col`}>
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
        <div className={`flex-1 rounded-2xl bg-surface/60 border border-white/10 overflow-hidden ${selectedConvId ? "flex" : "hidden lg:flex"} flex-col`}>
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

      {composerOpen && (
        <MailComposer state={state} onClose={() => setComposerOpen(false)} />
      )}
    </div>
  );
}