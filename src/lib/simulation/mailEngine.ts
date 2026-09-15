// Mail-Engine für FERNWERK – Auftrag 13.
// Verwaltet Gespräche, Nachrichten, Entwürfe, Metadaten, Personenauflösung,
// Suche, Statistiken und Export. Alle Inhalte sind simulierte Spielkommunikation.
// Kein echter E-Mail-Versand, keine echten Konten.

import {
  PERSONNEL_ROLES, PORTRAIT_IDS,
  formatGameTime, dayOf, clockOf,
  SERVICE_START_MIN, SERVICE_END_MIN,
} from "./gameRules.ts";

// ---------- E-Mail-Adressen (fiktiv, .invalid-Domain) ----------

function slugifyName(name) {
  return (name || "unbekannt").toLowerCase()
    .replace(/ae/g, "ae").replace(/oe/g, "oe").replace(/ue/g, "ue")
    .replace(/[^a-z0-9. ]/g, "").replace(/\s+/g, ".").replace(/\.{2,}/g, ".");
}

export function emailAddress(personId, state) {
  if (personId === "player") return "geschaeftsfuehrung@fernwerk.invalid";
  if (personId === "system") return "system@fernwerk.invalid";
  const info = getPersonInfo(state, personId);
  return slugifyName(info.name) + "@fernwerk.invalid";
}

// ---------- Initialisierung & Migration ----------

export function initMail(state) {
  state.mail = {
    conversations: [],
    messages: [],
    drafts: [],
    reportSchedules: [],
    staffTasks: [],
    nextMailId: 1,
    migrationDone: false,
  };
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Willkommen im Postfach",
    body: `Dies ist Dein internes Geschaeftsfuehrungs-Postfach. Alle Mitarbeiter koennen Dich hier erreichen - Disponenten melden Auftraege, Fahrer melden Lieferungen, die Buchhaltung meldet faellige Posten.\n\nDu kannst jeder Person antworten oder selbst eine neue E-Mail schreiben. Bei Freitext erkennt das System Anliegen wie Rueckladung suchen oder Zahlung freigeben und leitet gepruefte Spielschritte ein.\n\nOrdner: Posteingang, Gesendet, Entwuerfe, Archiv, Markiert, Alle Nachrichten. Filter helfen, Berichte, Entscheidungen und Bereiche zu trennen.\n\nKeine Nachricht geht verloren - alles bleibt fuer die Lebensdauer dieses Spielstands abrufbar.`,
    gameTime: state.gameTime,
    category: "system", priority: "normal",
    sourceEvent: "system_intro",
    dedupKey: "system_intro:player",
  });
}

export function migrateMail(state) {
  if (!state.mail) {
    state.mail = {
      conversations: [], messages: [], drafts: [],
      reportSchedules: [], staffTasks: [],
      nextMailId: 1, migrationDone: false,
    };
  }
  if (!state.mail.conversations) state.mail.conversations = [];
  if (!state.mail.messages) state.mail.messages = [];
  if (!state.mail.drafts) state.mail.drafts = [];
  if (!state.mail.reportSchedules) state.mail.reportSchedules = [];
  if (!state.mail.staffTasks) state.mail.staffTasks = [];
  if (!state.mail.nextMailId) state.mail.nextMailId = (state.mail.messages.length || 0) + 1;

  // Performance: Nachrichten und erledigte Tasks begrenzen
  if (state.mail.messages && state.mail.messages.length > 300) {
    state.mail.messages = state.mail.messages.slice(-300);
  }
  if (state.mail.staffTasks && state.mail.staffTasks.length > 100) {
    state.mail.staffTasks = state.mail.staffTasks.filter(t => t.status === "pending").slice(-50)
      .concat(state.mail.staffTasks.filter(t => t.status !== "pending").slice(-50));
  }

  if (!state.mail.migrationDone) {
    for (const emp of state.employees || []) {
      if (emp.employmentStatus !== "employed") continue;
      ensureReportSchedule(state, emp);
    }
    const hasIntro = (state.mail.messages || []).some(m => m.sourceEvent === "system_intro");
    if (!hasIntro) {
      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Postfach aktiviert",
        body: `Das interne Postfach wurde fuer diesen Spielstand freigeschaltet. Ab jetzt erreichst Du alle Mitarbeiter hier. Regelm\u00e4\u00dfige Berichte erscheinen automatisch.\n\nWichtig: Der Delegationsmodus Deiner Disponenten wurde nicht ge\u00e4ndert. Ein Disponent im Modus Vorschlaege nimmt weiterhin keine Auftraege selbstst\u00e4ndig an.`,
        gameTime: state.gameTime,
        category: "system", priority: "normal",
        sourceEvent: "system_intro_migrated",
        dedupKey: "system_intro_migrated:player",
      });
    }
    state.mail.migrationDone = true;
  }
}

export function ensureReportSchedule(state, emp) {
  const isDispatcher = emp.role === "dispatcher" || emp.role === "dispatcher_senior";
  const isAccountant = emp.role === "accountant" || emp.role === "accountant_senior";
  if (!isDispatcher && !isAccountant) return;
  const exists = (state.mail.reportSchedules || []).some(rs => rs.employeeId === emp.id);
  if (exists) return;
  const dayStart = Math.floor(state.gameTime / 1440) * 1440;
  state.mail.reportSchedules.push({
    id: "rs_" + state.mail.nextMailId++,
    employeeId: emp.id,
    role: emp.role,
    reportType: "morning",
    lastProcessedMin: 0,
    nextDueMin: dayStart + SERVICE_START_MIN,
    active: true,
  });
}

// ---------- Personenaufl\u00f6sung ----------

export function getPersonInfo(state, personId) {
  if (!personId) return { id: null, name: "\u2014", role: "\u2014", roleKey: null, portraitId: null, isActive: false };
  if (personId === "player") {
    return {
      id: "player", name: (state.private?.playerName || "Gesch\u00e4ftsf\u00fchrer") + " (GF)",
      role: "Gesch\u00e4ftsf\u00fchrer", roleKey: "boss", portraitId: null,
      isPlayer: true, isActive: true, attendance: "present",
    };
  }
  if (personId === "system") {
    return {
      id: "system", name: "System", role: "System", roleKey: "system",
      portraitId: null, isSystem: true, isActive: true, attendance: "present",
    };
  }
  const emp = (state.employees || []).find(e => e.id === personId);
  if (emp) {
    return {
      id: emp.id, name: emp.name,
      role: PERSONNEL_ROLES[emp.role]?.label || emp.role,
      roleKey: emp.role, portraitId: emp.portraitId,
      isEmployee: true, isActive: emp.employmentStatus === "employed",
      attendance: emp.attendance || "present", location: emp.locationCity,
    };
  }
  const driver = (state.drivers || []).find(d => d.id === personId);
  if (driver) {
    return {
      id: driver.id, name: driver.name,
      role: "Fahrer", roleKey: "driver", portraitId: driver.portraitId,
      isDriver: true, isActive: driver.employmentStatus === "employed",
      attendance: driver.attendance || "present", location: driver.locationCity,
      driverStatus: driver.status,
    };
  }
  return {
    id: personId, name: "Ehemalige(r) Mitarbeiter(in)",
    role: "Ehemalig", roleKey: "former", portraitId: null,
    isFormer: true, isActive: false, attendance: "left",
  };
}

export function getAllContacts(state) {
  const contacts = [];
  for (const emp of state.employees || []) {
    contacts.push({
      id: emp.id, name: emp.name,
      role: PERSONNEL_ROLES[emp.role]?.label || emp.role,
      roleKey: emp.role, portraitId: emp.portraitId,
      location: emp.locationCity,
      isActive: emp.employmentStatus === "employed",
      attendance: emp.attendance || "present",
      email: slugifyName(emp.name) + "@fernwerk.invalid",
    });
  }
  for (const d of state.drivers || []) {
    contacts.push({
      id: d.id, name: d.name,
      role: "Fahrer", roleKey: "driver", portraitId: d.portraitId,
      location: d.locationCity,
      isActive: d.employmentStatus === "employed",
      attendance: d.attendance || "present",
      status: d.status,
      email: slugifyName(d.name) + "@fernwerk.invalid",
    });
  }
  return contacts;
}

// ---------- Gespr\u00e4chsverwaltung ----------

export function findOrCreateConversation(state, {
  subject, category, participantIds, linkedRef, sourceEvent
}) {
  if (linkedRef) {
    const existing = (state.mail.conversations || []).find(c =>
      c.linkedRef &&
      c.linkedRef.type === linkedRef.type &&
      c.linkedRef.id === linkedRef.id &&
      participantIds.every(p => c.participantIds.includes(p))
    );
    if (existing) return existing;
  }
  const conv = {
    id: "conv_" + state.mail.nextMailId++,
    subject: subject || "Ohne Betreff",
    category: category || "operations",
    participantIds: [...new Set(participantIds)],
    lastActivityMin: state.gameTime,
    status: "open",
    linkedRef: linkedRef || null,
    messageIds: [],
    unreadCount: 0,
    decisionRequired: false,
    sourceEvent: sourceEvent || null,
  };
  state.mail.conversations.push(conv);
  return conv;
}

// ---------- Nachrichten ----------

export function deliverMessage(state, {
  fromId, toId, subject, body, gameTime, category, priority,
  linkedRefs, sourceEvent, conversationId, status, intent, dedupKey
}) {
  if (!state.mail) migrateMail(state);

  if (dedupKey) {
    const existing = (state.mail.messages || []).find(m =>
      m.dedupKey === dedupKey && m.toId === toId
    );
    if (existing) return existing;
  }

  const from = getPersonInfo(state, fromId);
  const to = getPersonInfo(state, toId);

  let conv = null;
  if (conversationId) {
    conv = (state.mail.conversations || []).find(c => c.id === conversationId);
  }
  if (!conv && linkedRefs && linkedRefs.length > 0) {
    conv = findOrCreateConversation(state, {
      subject, category, participantIds: [fromId, toId],
      linkedRef: linkedRefs[0], sourceEvent,
    });
  }
  if (!conv) {
    conv = findOrCreateConversation(state, {
      subject, category, participantIds: [fromId, toId], sourceEvent,
    });
  }

  const msg = {
    id: "msg_" + state.mail.nextMailId++,
    conversationId: conv.id,
    fromId, fromName: from.name, fromRole: from.roleKey, fromPortraitId: from.portraitId,
    toId, toName: to.name,
    subject: subject || conv.subject,
    body: body || "",
    gameTime: gameTime != null ? gameTime : state.gameTime,
    category: category || conv.category || "operations",
    priority: priority || "normal",
    status: status || "delivered",
    linkedRefs: linkedRefs || [],
    sourceEvent: sourceEvent || null,
    read: false, starred: false, archived: false,
    isOutgoing: fromId === "player",
    intent: intent || null,
    taskIds: [],
    dedupKey: dedupKey || null,
    createdAtMin: state.gameTime,
  };

  state.mail.messages.push(msg);
  conv.messageIds.push(msg.id);
  conv.lastActivityMin = msg.gameTime;

  if (!msg.isOutgoing && !msg.read && !msg.archived) {
    conv.unreadCount = (conv.unreadCount || 0) + 1;
  }
  if (intent && intent.requiresDecision) {
    conv.decisionRequired = true;
  }

  return msg;
}

export function markMessageRead(state, msgId, read) {
  const msg = (state.mail?.messages || []).find(m => m.id === msgId);
  if (!msg) return;
  const wasUnread = !msg.read;
  msg.read = read !== false;
  if (wasUnread && msg.read && !msg.isOutgoing) {
    const conv = (state.mail.conversations || []).find(c => c.id === msg.conversationId);
    if (conv && conv.unreadCount > 0) conv.unreadCount--;
  }
  if (!msg.read && !msg.isOutgoing) {
    const conv = (state.mail.conversations || []).find(c => c.id === msg.conversationId);
    if (conv) conv.unreadCount = (conv.unreadCount || 0) + 1;
  }
}

export function markConversationRead(state, convId) {
  const conv = (state.mail?.conversations || []).find(c => c.id === convId);
  if (!conv) return;
  for (const msgId of conv.messageIds) {
    const msg = (state.mail.messages || []).find(m => m.id === msgId);
    if (msg && !msg.isOutgoing && !msg.read) {
      msg.read = true;
      if (conv.unreadCount > 0) conv.unreadCount--;
    }
  }
}

export function starMessage(state, msgId, starred) {
  const msg = (state.mail?.messages || []).find(m => m.id === msgId);
  if (msg) msg.starred = starred !== false;
}

export function archiveMessage(state, msgId, archived) {
  const msg = (state.mail?.messages || []).find(m => m.id === msgId);
  if (!msg) return;
  msg.archived = archived !== false;
  if (msg.archived && !msg.isOutgoing && !msg.read) {
    const conv = (state.mail.conversations || []).find(c => c.id === msg.conversationId);
    if (conv && conv.unreadCount > 0) conv.unreadCount--;
  }
}

// ---------- Entw\u00fcrfe ----------

export function saveDraft(state, { id, conversationId, toId, subject, body }) {
  if (!state.mail) migrateMail(state);
  const draftId = id || "draft_" + state.mail.nextMailId++;
  let draft = (state.mail.drafts || []).find(d => d.id === draftId);
  if (draft) {
    draft.conversationId = conversationId || draft.conversationId;
    draft.toId = toId || draft.toId;
    draft.subject = subject != null ? subject : draft.subject;
    draft.body = body != null ? body : draft.body;
    draft.updatedAtMin = state.gameTime;
  } else {
    draft = {
      id: draftId, conversationId: conversationId || null,
      toId: toId || null, subject: subject || "", body: body || "",
      createdAtMin: state.gameTime, updatedAtMin: state.gameTime,
    };
    state.mail.drafts.push(draft);
  }
  return draft;
}

export function deleteDraft(state, draftId) {
  if (!state.mail?.drafts) return;
  state.mail.drafts = state.mail.drafts.filter(d => d.id !== draftId);
}

export function deleteConversation(state, convId) {
  if (!state.mail) return;
  const conv = (state.mail.conversations || []).find(c => c.id === convId);
  if (!conv) return;
  const msgIds = new Set(conv.messageIds || []);
  state.mail.messages = (state.mail.messages || []).filter(m => !msgIds.has(m.id));
  state.mail.conversations = (state.mail.conversations || []).filter(c => c.id !== convId);
  state.mail.staffTasks = (state.mail.staffTasks || []).filter(t => t.conversationId !== convId);
}

export function clearAllConversations(state) {
  if (!state.mail) return;
  state.mail.conversations = [];
  state.mail.messages = [];
  state.mail.staffTasks = [];
  state.mail.drafts = [];
}

// ---------- Statistiken ----------

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

// ---------- Suche & Filter ----------

export function getConversationMessages(state, convId) {
  return (state.mail?.messages || [])
    .filter(m => m.conversationId === convId)
    .sort((a, b) => a.gameTime - b.gameTime);
}

export function searchConversations(state, {
  folder, filter, query, page, pageSize
}) {
  if (!state.mail) return { conversations: [], total: 0 };
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
        m.toName?.toLowerCase().includes(q) ||
        (m.linkedRefs || []).some(r => r.id?.toLowerCase().includes(q))
      );
    });
  }

  convs.sort((a, b) => b.lastActivityMin - a.lastActivityMin);

  const total = convs.length;
  const p = page || 1;
  const ps = pageSize || 50;
  const start = (p - 1) * ps;
  return { conversations: convs.slice(start, start + ps), total, page: p, pageSize: ps };
}

// ---------- Export ----------

export function exportCorrespondence(state) {
  return {
    conversations: (state.mail?.conversations || []).map(c => ({
      id: c.id, subject: c.subject, category: c.category,
      participants: c.participantIds, lastActivity: formatGameTime(c.lastActivityMin),
      status: c.status, linkedRef: c.linkedRef, messageCount: c.messageIds.length,
    })),
    messages: (state.mail?.messages || []).map(m => ({
      id: m.id, conversationId: m.conversationId,
      from: { id: m.fromId, name: m.fromName, role: m.fromRole },
      to: { id: m.toId, name: m.toName },
      subject: m.subject, body: m.body,
      gameTime: m.gameTime, gameTimeFormatted: formatGameTime(m.gameTime),
      category: m.category, priority: m.priority, status: m.status,
      linkedRefs: m.linkedRefs, sourceEvent: m.sourceEvent,
      read: m.read, starred: m.starred, archived: m.archived,
      isOutgoing: m.isOutgoing, intent: m.intent,
    })),
    drafts: state.mail?.drafts || [],
    staffTasks: state.mail?.staffTasks || [],
    exportDate: new Date().toISOString(),
    gameTime: state.gameTime,
    gameTimeFormatted: formatGameTime(state.gameTime),
  };
}

// ---------- Staff Tasks ----------

export function createStaffTask(state, {
  employeeId, conversationId, messageId, type, params, earliestProcessMin
}) {
  if (!state.mail) migrateMail(state);
  const task = {
    id: "task_" + state.mail.nextMailId++,
    employeeId, conversationId, messageId,
    type, status: "pending",
    createdAtMin: state.gameTime,
    earliestProcessMin: earliestProcessMin != null ? earliestProcessMin : state.gameTime + 15,
    startedAtMin: null, completedAtMin: null,
    result: null, params: params || {},
  };
  state.mail.staffTasks.push(task);
  if (messageId) {
    const msg = (state.mail.messages || []).find(m => m.id === messageId);
    if (msg) msg.taskIds.push(task.id);
  }
  return task;
}

export function isEmployeeAvailable(state, personId, m) {
  const emp = (state.employees || []).find(e => e.id === personId);
  if (emp) {
    if (emp.employmentStatus !== "employed") return { available: false, reason: "nicht mehr besch\u00e4ftigt" };
    if (emp.attendance === "sick") return { available: false, reason: "krank" };
    if (emp.attendance === "vacation") return { available: false, reason: "im Urlaub" };
    if (emp.attendance !== "present") return { available: false, reason: "abwesend" };
    const clock = m % 1440;
    if (clock < SERVICE_START_MIN || clock > SERVICE_END_MIN) return { available: false, reason: "au\u00dfer Dienst" };
    return { available: true };
  }
  const driver = (state.drivers || []).find(d => d.id === personId);
  if (driver) {
    if (driver.employmentStatus !== "employed") return { available: false, reason: "nicht mehr besch\u00e4ftigt" };
    if (driver.attendance === "sick") return { available: false, reason: "krank" };
    if (driver.status === "on_trip") return { available: false, reason: "auf Fahrt" };
    if (driver.status === "resting") return { available: false, reason: "in Erholung bis " + formatGameTime(driver.restUntil) };
    return { available: true };
  }
  return { available: false, reason: "Person nicht gefunden" };
}