// Mail-Befehlsbehandlung für FERNWERK.
// Extrahiert aus simulationEngine.ts, um die Dateigröße zu reduzieren.
// Verarbeitet alle Postfach-bezogenen Befehle.

import {
  deliverMessage, getPersonInfo,
  createStaffTask,
  saveDraft, deleteDraft,
  markMessageRead, markConversationRead,
  starMessage, archiveMessage,
  deleteConversation,
  clearAllConversations,
  exportCorrespondence,
} from "./mailEngine.ts";
import { detectIntent, getIntentByType } from "./mailIntents.ts";

function isPlayerBlocked(state) {
  return (state.appointments || []).some(a => a.status === "active");
}

function extractTaskParams(body, state, conv) {
  const params = {};
  const orderMatch = body.match(/o_\d+/i);
  if (orderMatch) params.orderId = orderMatch[0];
  const tourMatch = body.match(/tour_\d+/i);
  if (tourMatch) params.tourId = tourMatch[0];
  const vehicleMatch = body.match(/v\d+/i);
  if (vehicleMatch) params.vehicleId = vehicleMatch[0];
  if (conv?.linkedRef) {
    if (conv.linkedRef.type === "order") params.orderId = conv.linkedRef.id;
    if (conv.linkedRef.type === "tour") params.tourId = conv.linkedRef.id;
    if (conv.linkedRef.type === "vehicle") params.vehicleId = conv.linkedRef.id;
  }
  return params;
}

export function handleMailCommand(state, command, p) {
  switch (command) {
    case "sendMail": {
      const { conversationId, toId, subject, body, intentType } = p;
      if (!body || !body.trim()) throw new Error("Nachrichtentext darf nicht leer sein.");
      if (body.length > 10000) throw new Error("Nachricht darf maximal 10.000 Zeichen haben.");

      let conv = null;
      if (conversationId) {
        conv = (state.mail?.conversations || []).find(c => c.id === conversationId);
        if (!conv) throw new Error("Gespraech nicht gefunden.");
      }

      let recipientId = toId;
      if (conv && !recipientId) {
        recipientId = conv.participantIds.find(id => id !== "player");
      }
      if (!recipientId) throw new Error("Empfaenger erforderlich.");

      const recipient = getPersonInfo(state, recipientId);
      if (!recipient) throw new Error("Empfaenger nicht gefunden.");

      let intent = null;
      if (intentType) {
        intent = getIntentByType(intentType, recipient.roleKey);
      } else {
        intent = detectIntent(body, { recipientRoleKey: recipient.roleKey });
      }

      if (intent && intent.requiresDecision) {
        if (isPlayerBlocked(state)) throw new Error("Du bist derzeit mit einer privaten Aktivität beschäftigt.");
      }

      const msg = deliverMessage(state, {
        fromId: "player",
        toId: recipientId,
        subject: subject || (conv ? "Re: " + conv.subject : "Neue Nachricht"),
        body,
        gameTime: state.gameTime,
        category: conv?.category || "operations",
        priority: "normal",
        conversationId: conv?.id,
        intent,
        status: "delivered",
      });

      if (intent && intent.createsTask) {
        createStaffTask(state, {
          employeeId: recipientId,
          conversationId: msg.conversationId,
          messageId: msg.id,
          type: intent.type,
          params: { body, conversationId: msg.conversationId, ...extractTaskParams(body, state, conv) },
          earliestProcessMin: state.gameTime + 15,
        });
      } else if (!intent && !recipient.isFormer) {
        createStaffTask(state, {
          employeeId: recipientId,
          conversationId: msg.conversationId,
          messageId: msg.id,
          type: "no_intent",
          params: { body },
          earliestProcessMin: state.gameTime + 15,
        });
      }

      return { ok: true, messageId: msg.id, conversationId: msg.conversationId, intent };
    }

    case "saveDraft": {
      const draft = saveDraft(state, p);
      return { ok: true, draftId: draft.id };
    }

    case "deleteDraft": {
      deleteDraft(state, p.draftId);
      return { ok: true };
    }

    case "markMessageRead": {
      markMessageRead(state, p.messageId, p.read !== false);
      return { ok: true };
    }

    case "markConversationRead": {
      markConversationRead(state, p.conversationId);
      return { ok: true };
    }

    case "starMessage": {
      starMessage(state, p.messageId, p.starred !== false);
      return { ok: true };
    }

    case "archiveMessage": {
      archiveMessage(state, p.messageId, p.archived !== false);
      return { ok: true };
    }

    case "deleteConversation": {
      deleteConversation(state, p.conversationId);
      return { ok: true };
    }

    case "clearAllConversations": {
      clearAllConversations(state);
      return { ok: true };
    }

    case "exportCorrespondence": {
      const data = exportCorrespondence(state);
      return { ok: true, export: data };
    }

    default:
      return null;
  }
}