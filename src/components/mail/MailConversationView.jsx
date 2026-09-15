import React, { useState, useEffect } from "react";
import { ArrowLeft, Send, Star, Archive, AlertCircle, Sparkles, Trash2 } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import {
  getConversationMessages, getConversationOtherParticipant, getPersonInfo,
  getQuickReplies, detectIntentPreview,
} from "@/lib/mailData";
import Portrait from "@/components/ui/Portrait";
import { formatGameTime } from "@/lib/gameData";

export default function MailConversationView({ state, conversationId, onBack }) {
  const { send, busy } = useGame();
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (conversationId) {
      send("markConversationRead", { conversationId }).catch(() => {});
    }
  }, [conversationId]);

  const conv = (state.mail?.conversations || []).find(c => c.id === conversationId);
  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <p className="text-sm text-muted-foreground">Keine Unterhaltung ausgewählt.</p>
        {onBack && (
          <button onClick={onBack} className="mt-3 text-xs text-lime hover:underline">
            Zurück zur Liste
          </button>
        )}
      </div>
    );
  }

  const other = getConversationOtherParticipant(state, conv);
  const messages = getConversationMessages(state, conv.id);
  const quickReplies = getQuickReplies(other.roleKey);
  const detectedIntent = detectIntentPreview(replyBody, other.roleKey);

  const handleSend = async () => {
    if (!replyBody.trim() || sending) return;
    setSending(true);
    try {
      await send("sendMail", {
        conversationId: conv.id,
        toId: other.id,
        subject: conv.subject,
        body: replyBody,
      });
      setReplyBody("");
    } catch (e) {
      // Fehler wird durch Toast im Kontext angezeigt
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (intent) => {
    setReplyBody(prev => (prev ? prev + " " : "") + intent.label);
  };

  const handleStar = async (msgId, starred) => {
    try { await send("starMessage", { messageId: msgId, starred: !starred }); } catch (e) {}
  };

  const handleArchive = async (msgId, archived) => {
    try { await send("archiveMessage", { messageId: msgId, archived: !archived }); } catch (e) {}
  };

  const handleMarkRead = async (msgId) => {
    try { await send("markMessageRead", { messageId: msgId }); } catch (e) {}
  };

  const handleDelete = async () => {
    try {
      await send("deleteConversation", { conversationId: conv.id });
      if (onBack) onBack();
    } catch (e) {}
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0">
        {onBack && (
          <button onClick={onBack} className="lg:hidden w-8 h-8 grid place-items-center rounded-lg hover:bg-white/5 -ml-1">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <Portrait portraitId={other.portraitId} name={other.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{other.name}</span>
            <span className="text-[11px] text-muted-foreground truncate">{other.role}</span>
          </div>
          <div className="text-xs text-muted-foreground truncate">{conv.subject}</div>
        </div>
        {conv.decisionRequired && (
          <span className="flex items-center gap-1 rounded-full bg-coral/15 text-coral px-2 py-0.5 text-[10px] font-semibold">
            <AlertCircle className="w-3 h-3" /> Entscheidung
          </span>
        )}
        <button
          onClick={handleDelete}
          className="w-8 h-8 grid place-items-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition shrink-0"
          title="Unterhaltung löschen"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Nachrichten-Verlauf */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-4 space-y-3">
        {messages.map(msg => {
          const sender = getPersonInfo(state, msg.fromId);
          const isOutgoing = msg.isOutgoing;
          return (
            <div key={msg.id} className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                isOutgoing
                  ? "bg-lime/15 border border-lime/20 rounded-br-sm"
                  : "bg-white/5 border border-white/10 rounded-bl-sm"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-medium text-muted-foreground">{sender.name}</span>
                  <span className="text-[10px] text-muted-foreground/60">{formatGameTime(msg.gameTime)}</span>
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap break-words">{msg.body}</div>
                {msg.intent && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-lime/80">
                    <Sparkles className="w-3 h-3" />
                    {msg.intent.label || msg.intent.type}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={() => handleStar(msg.id, msg.starred)}
                  className={`w-6 h-6 grid place-items-center rounded hover:bg-white/5 ${msg.starred ? "text-lime" : "text-muted-foreground/40"}`}
                  title="Markieren"
                >
                  <Star className={`w-3 h-3 ${msg.starred ? "fill-lime" : ""}`} />
                </button>
                <button
                  onClick={() => handleArchive(msg.id, msg.archived)}
                  className="w-6 h-6 grid place-items-center rounded hover:bg-white/5 text-muted-foreground/40"
                  title="Archivieren"
                >
                  <Archive className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Antwort-Editor */}
      <div className="border-t border-white/10 px-3 py-3 shrink-0 space-y-2">
        {/* Quick Replies */}
        {quickReplies.length > 0 && !replyBody && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {quickReplies.slice(0, 5).map(qr => (
              <button
                key={qr.intent}
                onClick={() => handleQuickReply(qr)}
                className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/20 whitespace-nowrap transition"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Antwort schreiben…"
            rows={2}
            className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-lime/40 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!replyBody.trim() || sending || busy}
            className="w-10 h-10 grid place-items-center rounded-xl bg-lime text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-lime/90 transition shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        {detectedIntent && (
          <div className="flex items-center gap-1.5 text-[11px] text-lime/70">
            <Sparkles className="w-3 h-3" />
            Erkanntes Anliegen: {detectedIntent.type.replace(/_/g, " ")}
          </div>
        )}
      </div>
    </div>
  );
}