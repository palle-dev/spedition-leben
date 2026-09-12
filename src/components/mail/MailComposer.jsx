import React, { useState, useMemo } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { getAllContacts, detectIntentPreview } from "@/lib/mailData";
import Portrait from "@/components/ui/Portrait";

export default function MailComposer({ state, onClose }) {
  const { send, busy } = useGame();
  const contacts = useMemo(() => getAllContacts(state), [state]);
  const [toId, setToId] = useState(contacts[0]?.id || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const selectedContact = contacts.find(c => c.id === toId);
  const detectedIntent = detectIntentPreview(body, selectedContact?.roleKey);

  const handleSend = async () => {
    if (!toId || !body.trim() || sending) return;
    setSending(true);
    try {
      await send("sendMail", {
        toId,
        subject: subject || "Neue Nachricht",
        body,
      });
      onClose();
    } catch (e) {
      // Fehler wird durch Toast im Kontext angezeigt
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-surface border border-white/10 shadow-2xl flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-foreground">Neue E-Mail</h2>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Empfänger */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">An</label>
            <div className="flex items-center gap-2">
              {selectedContact && <Portrait portraitId={selectedContact.portraitId} name={selectedContact.name} size="sm" />}
              <select
                value={toId}
                onChange={e => setToId(e.target.value)}
                className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-lime/40"
              >
                {contacts.map(c => (
                  <option key={c.id} value={c.id} className="bg-surface">
                    {c.name} — {c.role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Betreff */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Betreff</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Betreff eingeben…"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-lime/40"
            />
          </div>

          {/* Nachricht */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 block">Nachricht</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Nachricht schreiben… Bei Freitext erkennt das System Anliegen automatisch."
              rows={6}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-lime/40 resize-none"
            />
          </div>

          {detectedIntent && (
            <div className="flex items-center gap-1.5 rounded-lg bg-lime/10 border border-lime/20 px-3 py-2 text-[11px] text-lime/80">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Erkanntes Anliegen: <strong className="font-semibold">{detectedIntent.type.replace(/_/g, " ")}</strong></span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSend}
            disabled={!toId || !body.trim() || sending || busy}
            className="flex items-center gap-1.5 rounded-lg bg-lime text-ink px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-lime/90 transition"
          >
            <Send className="w-4 h-4" />
            Senden
          </button>
        </div>
      </div>
    </div>
  );
}