// Client-seitige Mail-Daten-Hilfsfunktionen für FERNWERK.
// Spiegelt die serverseitigen Filter-/Suchfunktionen aus mailEngine.ts,
// damit die Postfach-UI direkt aus state.mail arbeiten kann.

import { getPortraitUrl } from "./portraitCatalog";

const PERSON_ROLE_LABELS = {
  driver: "Fahrer",
  dispatcher: "Disponent",
  dispatcher_senior: "Erfahrener Disponent",
  cleaner: "Reinigungskraft",
  mechanic: "Werkstattmitarbeiter",
  accountant: "Buchhalter/Buchhalterin",
  accountant_senior: "Erfahrene Buchhaltungskraft",
  assistant: "Assistent der Geschäftsführung",
  branch_manager: "Filialleiter",
};

export function getPersonInfo(state, personId) {
  if (!personId) return { id: null, name: "—", role: "—", roleKey: null, portraitId: null, isActive: false };
  if (personId === "player") {
    return {
      id: "player",
      name: (state.private?.playerName || "Geschäftsführer") + " (GF)",
      role: "Geschäftsführer", roleKey: "boss", portraitId: null,
      isPlayer: true, isActive: true,
    };
  }
  if (personId === "system") {
    return { id: "system", name: "System", role: "System", roleKey: "system", portraitId: null, isSystem: true, isActive: true };
  }
  const emp = (state.employees || []).find(e => e.id === personId);
  if (emp) {
    return {
      id: emp.id, name: emp.name,
      role: PERSON_ROLE_LABELS[emp.role] || emp.role,
      roleKey: emp.role, portraitId: emp.portraitId,
      isEmployee: true, isActive: emp.employmentStatus === "employed",
    };
  }
  const driver = (state.drivers || []).find(d => d.id === personId);
  if (driver) {
    return {
      id: driver.id, name: driver.name,
      role: "Fahrer", roleKey: "driver", portraitId: driver.portraitId,
      isDriver: true, isActive: driver.employmentStatus === "employed",
    };
  }
  return { id: personId, name: "Ehemalige(r) Mitarbeiter(in)", role: "Ehemalig", roleKey: "former", portraitId: null, isFormer: true, isActive: false };
}

export function getAllContacts(state) {
  const contacts = [];
  for (const emp of state.employees || []) {
    if (emp.employmentStatus !== "employed") continue;
    contacts.push({
      id: emp.id, name: emp.name,
      role: PERSON_ROLE_LABELS[emp.role] || emp.role,
      roleKey: emp.role, portraitId: emp.portraitId,
      isActive: emp.employmentStatus === "employed",
    });
  }
  for (const d of state.drivers || []) {
    if (d.employmentStatus !== "employed") continue;
    contacts.push({
      id: d.id, name: d.name,
      role: "Fahrer", roleKey: "driver", portraitId: d.portraitId,
      isActive: d.employmentStatus === "employed",
    });
  }
  return contacts;
}

export function getConversationMessages(state, convId) {
  return (state.mail?.messages || [])
    .filter(m => m.conversationId === convId)
    .sort((a, b) => a.gameTime - b.gameTime);
}

export function getMailboxStats(state) {
  const messages = state.mail?.messages || [];
  const incoming = messages.filter(m => !m.isOutgoing && !m.archived);
  const unread = incoming.filter(m => !m.read);
  const decisions = incoming.filter(m => m.intent?.requiresDecision);
  return {
    total: messages.length,
    unread: unread.length,
    decisions: decisions.length,
    drafts: (state.mail?.drafts || []).length,
    archived: messages.filter(m => m.archived).length,
  };
}

export function searchConversations(state, { folder, filter, query }) {
  if (!state.mail) return [];
  let convs = (state.mail.conversations || []).slice();

  if (folder === "inbox") {
    convs = convs.filter(c => c.messageIds.some(mid => {
      const m = state.mail.messages.find(mm => mm.id === mid);
      return m && !m.isOutgoing && !m.archived;
    }));
  } else if (folder === "sent") {
    convs = convs.filter(c => c.messageIds.some(mid => {
      const m = state.mail.messages.find(mm => mm.id === mid);
      return m && m.isOutgoing && !m.archived;
    }));
  } else if (folder === "archive") {
    convs = convs.filter(c => c.messageIds.some(mid => {
      const m = state.mail.messages.find(mm => mm.id === mid);
      return m && m.archived;
    }));
  } else if (folder === "starred") {
    convs = convs.filter(c => c.messageIds.some(mid => {
      const m = state.mail.messages.find(mm => mm.id === mid);
      return m && m.starred;
    }));
  }

  if (filter === "decision_required") {
    convs = convs.filter(c => c.decisionRequired);
  } else if (filter === "reports") {
    convs = convs.filter(c => (c.sourceEvent || "").startsWith("report_"));
  } else if (filter && filter !== "all") {
    convs = convs.filter(c => c.category === filter);
  }

  if (query) {
    const q = query.toLowerCase();
    convs = convs.filter(c => {
      if (c.subject?.toLowerCase().includes(q)) return true;
      const msgs = c.messageIds.map(mid => state.mail.messages.find(mm => mm.id === mid)).filter(Boolean);
      return msgs.some(m =>
        m.body?.toLowerCase().includes(q) ||
        m.fromName?.toLowerCase().includes(q) ||
        m.toName?.toLowerCase().includes(q)
      );
    });
  }

  convs.sort((a, b) => b.lastActivityMin - a.lastActivityMin);
  return convs;
}

export function getConversationPreview(state, conv) {
  const msgs = (conv.messageIds || [])
    .map(mid => state.mail.messages.find(m => m.id === mid))
    .filter(Boolean)
    .sort((a, b) => b.gameTime - a.gameTime);
  return msgs[0]?.body?.slice(0, 120) || "";
}

export function getConversationOtherParticipant(state, conv) {
  const otherId = conv.participantIds.find(id => id !== "player");
  return getPersonInfo(state, otherId);
}

export function getPortraitUrlForPerson(person) {
  if (!person || !person.portraitId) return null;
  return getPortraitUrl(person.portraitId);
}

// Quick Replies pro Rolle (spiegelt mailIntents.getQuickReplies)
export function getQuickReplies(roleKey) {
  const base = [
    { intent: "status_request", label: "Status erfragen" },
    { intent: "acknowledge", label: "Vielen Dank, zur Kenntnis genommen" },
  ];
  const roleSpecific = {
    dispatcher: [
      { intent: "find_return_load", label: "Rückladung suchen" },
      { intent: "suggest_alternative", label: "Andere Kombination vorschlagen" },
      { intent: "approve_plan", label: "Plan zur Freigabe vorlegen" },
      { intent: "change_mode", label: "Befugnisse ändern" },
    ],
    dispatcher_senior: [
      { intent: "find_return_load", label: "Rückladung suchen" },
      { intent: "suggest_alternative", label: "Andere Kombination vorschlagen" },
      { intent: "approve_plan", label: "Bestehenden Plan freigeben" },
      { intent: "change_mode", label: "Befugnisse ändern" },
    ],
    accountant: [
      { intent: "explain_due_items", label: "Fälligkeiten erläutern" },
      { intent: "prepare_payments", label: "Zahlungen vorbereiten" },
      { intent: "approve_payment", label: "Zahlung freigeben" },
    ],
    accountant_senior: [
      { intent: "explain_due_items", label: "Fälligkeiten erläutern" },
      { intent: "prepare_payments", label: "Zahlungen vorbereiten" },
      { intent: "approve_payment", label: "Zahlung freigeben" },
    ],
    driver: [
      { intent: "approve_vacation", label: "Urlaub prüfen" },
    ],
    mechanic: [
      { intent: "approve_repair", label: "Reparatur freigeben" },
    ],
    cleaner: [
      { intent: "check_cleaning_need", label: "Reinigungsbedarf prüfen" },
    ],
  };
  return [...(roleSpecific[roleKey] || []), ...base];
}

// Intent-Erkennung client-seitig (für Vorschau im Editor)
const INTENT_PATTERNS = [
  { type: "acknowledge", keywords: ["danke", "dank", "kenntnis", "verstanden", "zur kenntnis"] },
  { type: "find_return_load", keywords: ["rueckladung", "rueckfracht", "fracht zurueck", "ladung zurueck", "lade rueck"], roles: ["dispatcher", "dispatcher_senior"] },
  { type: "suggest_alternative", keywords: ["alternativ", "andere tour", "andere kombination", "anderer vorschlag", "andere moeglichkeit"], roles: ["dispatcher", "dispatcher_senior"] },
  { type: "change_mode", keywords: ["selbststaendig", "autonom", "befugnisse", "modus aendern", "eigenstaendig", "darfst selbst"], roles: ["dispatcher", "dispatcher_senior"] },
  { type: "approve_vacation", keywords: ["urlaub"] },
  { type: "approve_repair", keywords: ["reparatur", "werkstatt freigeben", "reparatur freigeben"], roles: ["mechanic"] },
  { type: "check_cleaning_need", keywords: ["reinigung", "sauber", "putz"], roles: ["cleaner"] },
  { type: "explain_due_items", keywords: ["faellig", "offene posten", "verbindlichkeiten", "schulden"], roles: ["accountant", "accountant_senior"] },
  { type: "prepare_payments", keywords: ["zahlung vorbereiten", "zahlungen vorbereiten", "ueberweisung vorbereiten"], roles: ["accountant", "accountant_senior"] },
  { type: "approve_payment", keywords: ["bezahlen", "zahlung freigeben", "ueberweisen", "begleichen", "rechnung bezahlen"], roles: ["accountant", "accountant_senior"] },
  { type: "approve_plan", keywords: ["freigeben", "freigabe", "plan bestaetigen", "bestaetigen", "plan freigeben", "tour freigeben"], roles: ["dispatcher", "dispatcher_senior"] },
  { type: "status_request", keywords: ["status", "wie geht", "stand", "lage", "uebersicht", "wie laeuft"] },
];

function normalize(text) {
  return (text || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

export function detectIntentPreview(text, roleKey) {
  const norm = normalize(text);
  if (!norm.trim()) return null;
  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.some(kw => norm.includes(kw));
    if (!matched) continue;
    if (pattern.roles && roleKey && !pattern.roles.includes(roleKey)) continue;
    return { type: pattern.type };
  }
  return null;
}