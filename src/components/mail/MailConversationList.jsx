import React, { useState } from "react";
import { Mail, AlertCircle, Star, Archive, Inbox, Send, FileEdit, Search, Trash2, Trash } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import {
  searchConversations, getConversationPreview, getConversationOtherParticipant,
  getMailboxStats, getPersonInfo,
} from "@/lib/mailData";
import Portrait from "@/components/ui/Portrait";
import { formatGameTime } from "@/lib/gameData";

const FOLDERS = [
  { id: "inbox", label: "Posteingang", icon: Inbox },
  { id: "sent", label: "Gesendet", icon: Send },
  { id: "drafts", label: "Entwürfe", icon: FileEdit },
  { id: "starred", label: "Markiert", icon: Star },
  { id: "archive", label: "Archiv", icon: Archive },
];

const FILTERS = [
  { id: "all", label: "Alle" },
  { id: "decision_required", label: "Entscheidungen" },
  { id: "reports", label: "Berichte" },
  { id: "operations", label: "Betrieb" },
  { id: "system", label: "System" },
];

export default function MailConversationList({
  state, folder, setFolder, filter, setFilter, query, setQuery,
  selectedConvId, onSelect, onCompose,
}) {
  const { send } = useGame();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const stats = getMailboxStats(state);
  const conversations = searchConversations(state, { folder, filter, query });
  const drafts = folder === "drafts" ? (state.mail?.drafts || []) : [];

  const handleDeleteDraft = async (draftId) => {
    try { await send("deleteDraft", { draftId }); } catch (e) {}
  };

  const handleDeleteConv = async (convId) => {
    try {
      await send("deleteConversation", { conversationId: convId });
      if (convId === selectedConvId) onSelect(null);
    } catch (e) {}
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await send("clearAllConversations", {});
      onSelect(null);
      setConfirmClear(false);
    } catch (e) {}
    finally { setClearing(false); }
  };

  const hasAnyMail = (state.mail?.conversations?.length || 0) > 0 || (state.mail?.drafts?.length || 0) > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Ordner-Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-3 pt-3 pb-1 shrink-0">
        {FOLDERS.map(f => {
          const Icon = f.icon;
          const active = folder === f.id;
          const badge = f.id === "inbox" ? stats.unread : f.id === "drafts" ? stats.drafts : null;
          return (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                active ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.label}
              {badge > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${active ? "bg-ink/20" : "bg-coral/20 text-coral"}`}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Suche + Neue E-Mail */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-lime/40"
          />
        </div>
        <button
          onClick={onCompose}
          className="flex items-center gap-1.5 rounded-lg bg-lime text-ink px-3 py-1.5 text-xs font-semibold hover:bg-lime/90 transition shrink-0"
        >
          <Mail className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Neue E-Mail</span>
        </button>
        {hasAnyMail && !confirmClear && (
          <button
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-coral hover:border-coral/30 px-2.5 py-1.5 text-xs font-medium transition shrink-0"
            title="Alle E-Mails und Entwürfe löschen"
          >
            <Trash className="w-3.5 h-3.5" />
          </button>
        )}
        {confirmClear && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-coral hidden sm:inline">Alle löschen?</span>
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="flex items-center gap-1 rounded-lg bg-coral/15 text-coral border border-coral/30 px-2.5 py-1.5 text-xs font-semibold hover:bg-coral/25 transition disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ja</span>
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground px-2.5 py-1.5 text-xs font-medium transition"
            >
              Abbrechen
            </button>
          </div>
        )}
      </div>

      {/* Filter-Chips */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none px-3 pb-2 shrink-0">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition ${
              filter === f.id ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Konversationsliste / Entwürfe */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {folder === "drafts" ? (
          drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <FileEdit className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Keine Entwürfe vorhanden.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {drafts.map(draft => {
                const recipient = getPersonInfo(state, draft.toId);
                return (
                  <div key={draft.id} className="flex items-start gap-3 px-3 py-3 hover:bg-white/5">
                    <Portrait portraitId={recipient.portraitId} name={recipient.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {recipient.name || "Kein Empfänger"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {draft.subject || "Kein Betreff"}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                        {draft.body?.slice(0, 100) || ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground/50 mt-1">
                        Entwurf · {formatGameTime(draft.updatedAtMin || draft.createdAtMin)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="w-7 h-7 grid place-items-center rounded text-muted-foreground/40 hover:text-coral hover:bg-white/5 shrink-0"
                      title="Entwurf löschen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
            <Mail className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Keine Nachrichten in diesem Ordner.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {conversations.map(conv => {
              const other = getConversationOtherParticipant(state, conv);
              const preview = getConversationPreview(state, conv);
              const isSelected = conv.id === selectedConvId;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 text-left transition hover:bg-white/5 cursor-pointer ${isSelected ? "bg-white/10" : ""}`}
                >
                  <Portrait portraitId={other.portraitId} name={other.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{other.name}</span>
                      {conv.unreadCount > 0 && (
                        <span className="rounded-full bg-lime/20 text-lime px-1.5 text-[10px] font-bold tabular-nums shrink-0">
                          {conv.unreadCount}
                        </span>
                      )}
                      {conv.decisionRequired && (
                        <AlertCircle className="w-3.5 h-3.5 text-coral shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{conv.subject}</div>
                    <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{preview}</div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteConv(conv.id); }}
                    className="w-7 h-7 grid place-items-center rounded text-muted-foreground/40 hover:text-coral hover:bg-white/5 shrink-0"
                    title="Unterhaltung löschen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}