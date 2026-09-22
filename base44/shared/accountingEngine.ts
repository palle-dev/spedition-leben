import { projectionRange, financialRange } from "./financialProjection.ts";
import { retainLatestHistory } from "./historyRetention.ts";
// Buchhaltungs-Engine für FERNWERK.
// Doppelte Buchführung, Kontenplan, Belege, offene Posten, Anlagen,
// Abschreibung, Periodenabschluss, Buchhaltungspersonal, Auswertungen, Migration.
// Trennung: gameRules (statisch) · accountingEngine (Buchhaltungslogik) · simulationEngine (Spiellogik).

import {
  DRIVER_COST_PER_DAY, BRANCH_COST_PER_DAY, PRIVATE_WITHDRAWAL_PER_DAY,
  PERSONNEL_ROLES, PORTRAIT_IDS, HIRE_FEE, VEHICLE_PRICE,
} from "./gameRules.ts";

// ---------- Kontenplan ----------
export const ACCOUNTS: Record<string, { no: string; name: string; type: string; group: string; contra?: boolean }> = {
  // Aktiva
  "4220": { no: "4220", name: "Fahrzeugvermietung", type: "revenue", group: "other_revenue" },
  "1320": { no: "1320", name: "Anzahlungen für Unternehmensübernahmen", type: "asset", group: "current_assets" },
  "1000": { no: "1000", name: "Firmenbank", type: "asset", group: "current_assets" },
  "1100": { no: "1100", name: "Kundenforderungen", type: "asset", group: "current_assets" },
  "1150": { no: "1150", name: "Sonstige Forderungen", type: "asset", group: "current_assets" },
  "1200": { no: "1200", name: "Eigene Lkw", type: "asset", group: "fixed_assets" },
  "1210": { no: "1210", name: "Werkstattausstattung", type: "asset", group: "fixed_assets" },
  "1220": { no: "1220", name: "Weitere Betriebsanlagen", type: "asset", group: "fixed_assets" },
  // Eigenkapital
  "2000": { no: "2000", name: "Eigenkapital", type: "equity", group: "equity" },
  "2010": { no: "2010", name: "Private Entnahmen", type: "equity", group: "equity", contra: true },
  "2020": { no: "2020", name: "Private Einlagen", type: "equity", group: "equity" },
  // Passiva
  "2100": { no: "2100", name: "Lieferantenverbindlichkeiten", type: "liability", group: "current_liabilities" },
  "2110": { no: "2110", name: "Offene Löhne", type: "liability", group: "current_liabilities" },
  "2120": { no: "2120", name: "Sonstige Verbindlichkeiten", type: "liability", group: "current_liabilities" },
  "2200": { no: "2200", name: "Darlehen", type: "liability", group: "long_term_liabilities" },
  // Erträge
  "4000": { no: "4000", name: "Transporterlöse", type: "revenue", group: "operating_revenue" },
  "4090": { no: "4090", name: "Erlösschmälerungen", type: "revenue", group: "operating_revenue", contra: true },
  "4100": { no: "4100", name: "Versicherungsentschädigungen", type: "revenue", group: "other_revenue" },
  "4200": { no: "4200", name: "Gewinne aus Anlagenverkauf", type: "revenue", group: "other_revenue" },
  // Aufwendungen
  "5005": { no:"5005", name:"Ladestrom", type:"expense", group:"direct_costs" },
  "4210": { no:"4210", name:"PV-Einspeisung", type:"revenue", group:"other_revenue" },
  "5000": { no: "5000", name: "Kraftstoff", type: "expense", group: "direct_costs" },
  "5030": { no:"5030", name:"Zollagentur und Grenzabwicklung", type:"expense", group:"direct_costs" },
  "5010": { no: "5010", name: "Maut", type: "expense", group: "direct_costs" },
  "5020": { no: "5020", name: "Fremdtransporte", type: "expense", group: "direct_costs" },
  "5100": { no: "5100", name: "Fahrerlohn", type: "expense", group: "personnel" },
  "5110": { no: "5110", name: "Disposition", type: "expense", group: "personnel" },
  "5120": { no: "5120", name: "Buchhaltung und Verwaltung", type: "expense", group: "personnel" },
  "5130": { no: "5130", name: "Reinigung und Werkstattpersonal", type: "expense", group: "personnel" },
  "5140": { no: "5140", name: "Personalgewinnung und Bereitstellung", type: "expense", group: "personnel" },
  "5150": { no: "5150", name: "Aus- und Weiterbildung", type: "expense", group: "personnel" },
  "5200": { no: "5200", name: "Standortkosten", type: "expense", group: "operations" },
  "5210": { no: "5210", name: "Externe Reinigung und Betriebshilfen", type: "expense", group: "operations" },
  "5220": { no: "5220", name: "Miete für Fahrzeuge und Ausstattung", type: "expense", group: "operations" },
  "5300": { no: "5300", name: "Wartung und Reparatur", type: "expense", group: "operations" },
  "5310": { no: "5310", name: "Unfall-, Abschlepp- und Ladungsschäden", type: "expense", group: "operations" },
  "5400": { no: "5400", name: "Versicherungsbeiträge", type: "expense", group: "operations" },
  "5500": { no: "5500", name: "Abschreibungen", type: "expense", group: "depreciation" },
  "5510": { no: "5510", name: "Verluste aus Anlagenverkauf", type: "expense", group: "depreciation" },
  "5600": { no: "5600", name: "Zinsaufwand", type: "expense", group: "finance" },
  "5700": { no: "5700", name: "Auftragsstorno und sonstige Betriebskosten", type: "expense", group: "operations" },
  // Finanzierung (Auftrag 17)
  "1300": { no: "1300", name: "Vorausbezahlte Leasingkosten", type: "asset", group: "current_assets" },
  "2210": { no: "2210", name: "Fällige Kredittilgung", type: "liability", group: "current_liabilities" },
  "2230": { no: "2230", name: "Zinsverbindlichkeiten", type: "liability", group: "current_liabilities" },
  "5230": { no: "5230", name: "Leasingaufwand", type: "expense", group: "operations" },
  "5610": { no: "5610", name: "Finanzierungskosten/Gebühren", type: "expense", group: "finance" },
  // Investment (Auftrag 33)
  "1005": { no: "1005", name: "Firmen-Verrechnungskonto Investment", type: "asset", group: "current_assets" },
  "1160": { no: "1160", name: "Ertragsforderungen Investment", type: "asset", group: "current_assets" },
  "1310": { no: "1310", name: "Aktien zu Anschaffungskosten", type: "asset", group: "current_assets" },
  "1311": { no: "1311", name: "Krypto zu Anschaffungskosten", type: "asset", group: "current_assets" },
  "1319": { no: "1319", name: "Marktwertanpassung Investment", type: "asset", group: "current_assets" },
  "4300": { no: "4300", name: "Realisierte Investmentgewinne", type: "revenue", group: "other_revenue" },
  "4301": { no: "4301", name: "Dividenden- und Stakingträge", type: "revenue", group: "other_revenue" },
  "4305": { no: "4305", name: "Unrealisierte Bewertungserträge", type: "revenue", group: "other_revenue" },
  "5710": { no: "5710", name: "Realisierte Investmentverluste", type: "expense", group: "depreciation" },
  "5715": { no: "5715", name: "Bewertungsverluste", type: "expense", group: "depreciation" },
};

export const ACCOUNT_LIST = Object.values(ACCOUNTS);

export function accountName(no) { return ACCOUNTS[no]?.name || no; }
export function accountType(no) { return ACCOUNTS[no]?.type || "unknown"; }
export function accountGroup(no) { return ACCOUNTS[no]?.group || "unknown"; }
export function isContraAccount(no) { return ACCOUNTS[no]?.contra || false; }

// ---------- Perioden ----------
// 1 Spielmonat = 30 Spieltage = 43200 Minuten
export const MONTH_MIN = 43200;
export const MONTH_DAYS = 30;
export const DEPR_MONTHS = 60; // Nutzungsdauer in Spielmonaten

export function periodOf(min) { return Math.floor(min / MONTH_MIN) + 1; }
export function periodStartMin(p) { return (p - 1) * MONTH_MIN; }
export function periodEndMin(p) { return p * MONTH_MIN; }
export function dayOfMin(min) { return Math.floor(min / 1440) + 1; }

// ---------- Initialisierung ----------
export function initAccounting(state) {
  state.accounting = {
    journal: [],
    dailySummary: {}, // Tag → {revenue, expenses, directCosts, personnel, operations, depreciation, finance}
    receipts: [],
    openItems: [],
    assets: [],
    periods: [],
    accountBalances: {},
    nextEntryNo: 1,
    nextReceiptNo: 1,
    nextOpenItemNo: 1,
    nextAssetNo: 1,
    nextTaskNo: 1,
    lastDepreciationMonth: 0,
    depreciationStartMonth: 2, // Einführungsregel: erst ab Monat 2
    taskQueue: [],
    migrationDone: false,
  };
}

// ---------- Buchungsjournal ----------
export function postJournal(state, data) {
  for (const line of data.lines || []) {
    if (!ACCOUNTS[line.account] || !Number.isSafeInteger(line.debit ?? 0) || !Number.isSafeInteger(line.credit ?? 0) ||
        (line.debit || 0) < 0 || (line.credit || 0) < 0) {
      throw new Error("Ungültiges Konto oder Centbetrag: " + data.text);
    }
  }
  if (!state.accounting) initAccounting(state);
  const lines = (data.lines || []).filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0);
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (debit !== credit) {
    throw new Error(`Unausgeglichene Buchung: "${data.text}" – Soll ${debit} ≠ Haben ${credit}`);
  }
  if (lines.length < 2) {
    throw new Error(`Buchung braucht mindestens zwei Zeilen: "${data.text}"`);
  }
  const gt = data.gameTime ?? state.gameTime;
  const entry = {
    id: "je_" + (state.accounting.nextEntryNo++),
    entryNo: state.accounting.nextEntryNo - 1,
    gameTime: gt,
    period: periodOf(gt),
    text: data.text,
    type: data.type || "other",
    sourceEventId: data.sourceEventId || null,
    orderId: data.orderId || null,
    tourId: data.tourId || null,
    vehicleId: data.vehicleId || null,
    employeeId: data.employeeId || null,
    branchId: data.branchId || (data.gameTime == null || data.gameTime === state.gameTime
      ? ((data.vehicleId && (state.vehicles || []).find(v => v.id === data.vehicleId)?.branchId) ||
        (data.employeeId && ((state.employees || []).find(e => e.id === data.employeeId)?.assignedBranchId || (state.employees || []).find(e => e.id === data.employeeId)?.branchId)) ||
        (data.employeeId && (state.drivers || []).find(d => d.id === data.employeeId)?.branchId) || null) : null),
    partnerName: data.partnerName || null,
    actor: data.actor || "system",
    status: "posted",
    lines: lines.map(l => ({
      account: l.account,
      debitCents: l.debit || 0,
      creditCents: l.credit || 0,
      orderId: l.orderId || data.orderId || null,
      vehicleId: l.vehicleId || data.vehicleId || null,
      employeeId: l.employeeId || data.employeeId || null,
      openItemId: l.openItemId || null,
    })),
    correctionOf: data.correctionOf || null,
  };
  // Kontensalden aktualisieren
  for (const line of entry.lines) {
    const bal = state.accounting.accountBalances[line.account] || 0;
    state.accounting.accountBalances[line.account] = bal + line.debitCents - line.creditCents;
  }
  // Bankkonto (1000) mit state.company.accountCents synchron halten
  for (const line of entry.lines) {
    if (line.account === "1000") {
      state.company.accountCents += line.debitCents - line.creditCents;
    }
  }
  state.accounting.journal.push(entry);

  // Tageszusammenfassung aktualisieren (für Zeitverlauf-Charts).
  // Wird nie abgeschnitten — kompakt (ein Eintrag pro Tag).
  const day = Math.floor(gt / 1440) + 1;
  const ds = state.accounting.dailySummary || (state.accounting.dailySummary = {});
  const d = ds[day] || (ds[day] = { revenue: 0, expenses: 0, directCosts: 0, personnel: 0, operations: 0, depreciation: 0, finance: 0 });
  for (const l of entry.lines) {
    const acc = ACCOUNTS[l.account];
    if (!acc) continue;
    if (acc.type === "revenue") {
      d.revenue += l.creditCents - l.debitCents;
    } else if (acc.type === "expense") {
      const amt = l.debitCents - l.creditCents;
      d.expenses += amt;
      if (acc.group === "direct_costs") d.directCosts += amt;
      else if (acc.group === "personnel") d.personnel += amt;
      else if (acc.group === "operations") d.operations += amt;
      else if (acc.group === "depreciation") d.depreciation += amt;
      else if (acc.group === "finance") d.finance += amt;
    }
  }

  // Das Journal ist der prüfbare Buchungsnachweis. Nicht ohne vollständiges
  // Archiv löschen: Kontensalden allein können Periodenberichte nicht ersetzen.
  return entry;
}

// ---------- Ursachen-Konto-Zuordnung ----------
// Wird von addBooking genutzt, um Buchungstexten (z.B. "Kraftstoff: ...")
// die korrekten Aufwands-/Ertragskonten zuzuordnen.
export const CAUSE_ACCOUNT_MAP = {
  "Ladestrom":"5005", "Ladestrom unterwegs":"5005", "PV-Einspeisung":"4210", "Energieanlage":"1220",
  "Zollagentur": "5030", "Kraftstoff": "5000", "Maut": "5010", "Vergütung": "4000",
  "Fahrerlohn": "5100", "Standort": "5200", "Lohn": "5120",
  "Private Entnahme": "2010", "Stornogebühr": "5700",
  "Fahrzeugkauf": "1200", "Einstellung": "5140", "Wartung": "5300",
  "Kraftstoff (Leerfahrt)": "5000", "Maut (Leerfahrt)": "5010",
  "Offene Kosten bezahlt": "2120",
  "Disposition": "5110", "Reinigung und Werkstatt": "5130", "Buchhaltung": "5120",
  "Werkstattbau": "1210", "Wartungsteile": "5300",
  "Gebrauchtfahrzeugkauf": "1200", "Kraftstoff (Überstellung)": "5000", "Maut (Überstellung)": "5010",
  "Reiseticket": "5700", "Mietfahrzeug": "5220", "Notfallreparatur": "5300", "Fremdfahrer": "5140",
};

// Zentrale Buchungsroutine: Legacy-Array + doppelte Buchführung über Journal.
// Wird von simulationEngine UND tourEngine verwendet, damit jede Geldbewegung
// eine konsistente Journal-Zeile erhält (Paket 2: keine Buchung ohne Journal).
export function addBooking(state, min, cause, amountCents, account, refId, context = {}) {
  if (!Number.isSafeInteger(amountCents)) throw new Error("Ungültiger Centbetrag.");
  if (amountCents === 0) return;
  state.bookings.push({ min, cause, amountCents, account, refId });
  if (state.bookings.length > 200) state.bookings = retainLatestHistory(state, "bookings", state.bookings, 200, null);
  if (account === "private") {
    state.private.accountCents += amountCents;
    return;
  }
  const isPositive = amountCents >= 0;
  const abs = Math.abs(amountCents);
  const causeKey = cause.split(":")[0].trim();
  const matchAcct = CAUSE_ACCOUNT_MAP[causeKey] || (isPositive ? "4000" : "5700");
  if (matchAcct === "2010") {
    postJournal(state, { ...context, text: cause, sourceEventId: refId, type: "withdrawal", gameTime: min,
      lines: [{ account: "2010", debit: abs }, { account: "1000", credit: abs }] });
  } else if (matchAcct === "1200") {
    postJournal(state, { ...context, text: cause, sourceEventId: refId, type: "vehicle_purchase", gameTime: min,
      lines: [{ account: "1200", debit: abs }, { account: "1000", credit: abs }] });
  } else if (isPositive) {
    postJournal(state, { ...context, text: cause, sourceEventId: refId, type: "revenue", gameTime: min,
      lines: [{ account: "1000", debit: abs }, { account: matchAcct, credit: abs }] });
  } else {
    postJournal(state, { ...context, text: cause, sourceEventId: refId, type: "expense", gameTime: min,
      lines: [{ account: matchAcct, debit: abs }, { account: "1000", credit: abs }] });
  }
}

// ---------- Buchungsvorlagen ----------
export const TEMPLATES = {
  opening: (s, p) => ({
    text: p.text || "Eröffnungsbilanz",
    type: "opening",
    actor: "system",
    lines: [
      { account: "1000", debit: p.bankCents },
      { account: "1200", debit: p.assetCents },
      { account: "2000", credit: p.bankCents + p.assetCents - p.liabilityCents },
      ...(p.liabilityCents > 0 ? [{ account: "2120", credit: p.liabilityCents }] : []),
    ],
  }),
  fuel_toll: (s, p) => ({
    text: `Kraftstoff & Maut: ${p.customer || "Transport"}`,
    type: "fuel_toll",
    actor: "system",
    orderId: p.orderId,
    vehicleId: p.vehicleId,
    partnerName: p.customer,
    lines: [
      { account: "5000", debit: p.fuelCents },
      { account: "5010", debit: p.tollCents },
      { account: "1000", credit: p.fuelCents + p.tollCents },
    ],
  }),
  fuel_toll_empty: (s, p) => ({
    text: `Kraftstoff & Maut (Leerfahrt)`,
    type: "fuel_toll_empty",
    actor: "system",
    vehicleId: p.vehicleId,
    lines: [
      { account: "5000", debit: p.fuelCents },
      { account: "5010", debit: p.tollCents },
      { account: "1000", credit: p.fuelCents + p.tollCents },
    ],
  }),
  revenue_immediate: (s, p) => ({
    text: `Vergütung: ${p.customer}`,
    type: "revenue",
    actor: "system",
    orderId: p.orderId,
    partnerName: p.customer,
    lines: [
      { account: "1000", debit: p.paymentCents },
      { account: "4000", credit: p.paymentCents },
    ],
  }),
  revenue_deferred: (s, p) => ({
    text: `Vergütung (Zahlungsziel): ${p.customer}`,
    type: "revenue_deferred",
    actor: "system",
    orderId: p.orderId,
    partnerName: p.customer,
    lines: [
      { account: "1100", debit: p.paymentCents },
      { account: "4000", credit: p.paymentCents },
    ],
    openItem: { account: "1100", amountCents: p.paymentCents, dueMin: p.dueMin, partnerName: p.customer, orderId: p.orderId },
  }),
  revenue_collection: (s, p) => ({
    text: `Zahlungseingang: ${p.customer}`,
    type: "revenue_collection",
    actor: "system",
    orderId: p.orderId,
    partnerName: p.customer,
    lines: [
      { account: "1000", debit: p.amountCents },
      { account: "1100", credit: p.amountCents },
    ],
  }),
  withdrawal: (s, p) => ({
    text: "Private Entnahme",
    type: "withdrawal",
    actor: "system",
    lines: [
      { account: "2010", debit: p.amountCents },
      { account: "1000", credit: p.amountCents },
    ],
  }),
  deposit: (s, p) => ({
    text: "Private Einlage",
    type: "deposit",
    actor: "player",
    lines: [
      { account: "1000", debit: p.amountCents },
      { account: "2020", credit: p.amountCents },
    ],
  }),
  cancellation: (s, p) => ({
    text: `Stornogebühr: ${p.customer}`,
    type: "cancellation",
    actor: "system",
    orderId: p.orderId,
    partnerName: p.customer,
    lines: [
      { account: "5700", debit: p.feeCents },
      { account: "1000", credit: p.feeCents },
    ],
  }),
  vehicle_purchase: (s, p) => ({
    text: `Fahrzeugkauf: ${p.vehicleName || p.vehicleId}`,
    type: "vehicle_purchase",
    actor: "player",
    vehicleId: p.vehicleId,
    lines: [
      { account: "1200", debit: p.priceCents },
      { account: "1000", credit: p.priceCents },
    ],
  }),
  maintenance: (s, p) => ({
    text: `Wartung: ${p.vehicleName || p.vehicleId}`,
    type: "maintenance",
    actor: "player",
    vehicleId: p.vehicleId,
    lines: [
      { account: "5300", debit: p.amountCents },
      { account: "1000", credit: p.paidCents ?? p.amountCents },
      ...(p.unpaidCents > 0 ? [{ account: p.liabilityAccount || "2120", credit: p.unpaidCents }] : []),
    ],
  }),
  hire_fee: (s, p) => ({
    text: `Einstellung: ${p.name}`,
    type: "hire_fee",
    actor: "player",
    employeeId: p.employeeId,
    lines: [
      { account: "5140", debit: p.amountCents },
      { account: "1000", credit: p.paidCents ?? p.amountCents },
      ...(p.unpaidCents > 0 ? [{ account: "2120", credit: p.unpaidCents }] : []),
    ],
  }),
  expense: (s, p) => ({
    text: p.text,
    type: p.type || "expense",
    actor: p.actor || "system",
    orderId: p.orderId,
    vehicleId: p.vehicleId,
    employeeId: p.employeeId,
    branchId: p.branchId,
    partnerName: p.partnerName,
    lines: [
      { account: p.expenseAccount, debit: p.amountCents },
      ...(p.paidCents > 0 ? [{ account: "1000", credit: p.paidCents }] : []),
      ...(p.unpaidCents > 0 ? [{ account: p.liabilityAccount || "2120", credit: p.unpaidCents }] : []),
    ],
  }),
  depreciation: (s, p) => ({
    text: `Abschreibung: ${p.assetName || p.assetId}`,
    type: "depreciation",
    actor: "system",
    vehicleId: p.vehicleId,
    lines: [
      { account: "5500", debit: p.amountCents },
      { account: p.assetAccount || "1200", credit: p.amountCents },
    ],
  }),
  asset_disposal: (s, p) => {
    const loss = p.bookValueCents - p.salePriceCents;
    const gain = p.salePriceCents - p.bookValueCents;
    const lines: {account: string; debit?: number; credit?: number}[] = [{ account: "1000", debit: p.salePriceCents }];
    if (loss > 0) lines.push({ account: "5510", debit: loss });
    lines.push({ account: p.assetAccount || "1200", credit: p.bookValueCents });
    if (gain > 0) lines.push({ account: "4200", credit: gain });
    return {
      text: `Anlagenverkauf: ${p.assetName || p.assetId}`,
      type: "asset_disposal",
      actor: "player",
      vehicleId: p.vehicleId,
      lines,
    };
  },
  insurance_claim: (s, p) => ({
    text: `Versicherungsanspruch: ${p.cause || "Schaden"}`,
    type: "insurance_claim",
    actor: "system",
    lines: [
      { account: "1150", debit: p.amountCents },
      { account: "4100", credit: p.amountCents },
    ],
    openItem: { account: "1150", amountCents: p.amountCents, dueMin: p.dueMin, partnerName: "Versicherung", cause: p.cause },
  }),
  insurance_payment: (s, p) => ({
    text: `Versicherungszahlung erhalten`,
    type: "insurance_payment",
    actor: "system",
    lines: [
      { account: "1000", debit: p.amountCents },
      { account: "1150", credit: p.amountCents },
    ],
  }),
  pay_liability: (s, p) => ({
    text: `Zahlung: ${p.cause || "Offener Posten"}`,
    type: "liability_payment",
    actor: p.actor || "player",
    lines: [
      { account: p.liabilityAccount, debit: p.amountCents },
      { account: "1000", credit: p.amountCents },
    ],
  }),
};

// ---------- Buchung aus Vorlage ----------
export function book(state, templateName, params) {
  if (!state.accounting) initAccounting(state);
  const tpl = TEMPLATES[templateName];
  if (!tpl) throw new Error("Unbekannte Buchungsvorlage: " + templateName);
  const data = tpl(state, params || {});
  if (params?.gameTime !== undefined) data.gameTime = params.gameTime;
  if (params?.branchId) data.branchId = params.branchId;
  data.sourceEventId = data.sourceEventId || params?.sourceEventId || params?.refId || null;
  const entry = postJournal(state, data);
  createReceipt(state, entry);
  // Open Item erstellen falls definiert
  if (data.openItem) {
    addOpenItem(state, { ...data.openItem, refEntryId: entry.id, createdAtMin: data.gameTime ?? state.gameTime });
  }
  return entry;
}

// ---------- Aufwand mit teilweiser Zahlung ----------
export function bookExpense(state, params) {
  if (params.amountCents === 0) return { entry: null, paidCents: 0, unpaidCents: 0 };
  if (!state.accounting) initAccounting(state);
  const bal = state.company.accountCents;
  const paidCents = Math.min(bal, params.amountCents);
  const unpaidCents = params.amountCents - paidCents;
  const gt = params.gameTime ?? state.gameTime;
  const entry = book(state, "expense", { ...params, paidCents, unpaidCents, gameTime: gt });
  if (unpaidCents > 0) {
    addOpenItem(state, {
      account: params.liabilityAccount || "2120",
      amountCents: unpaidCents,
      remainingCents: unpaidCents,
      cause: params.text,
      refEntryId: entry.id,
      createdAtMin: gt,
      dueMin: null,
      partnerName: params.partnerName || null,
      orderId: params.orderId || null,
      vehicleId: params.vehicleId || null,
      employeeId: params.employeeId || null,
    });
  }
  return { entry, paidCents, unpaidCents };
}

// ---------- Belege ----------
export function createReceipt(state, entry) {
  if (!state.accounting) initAccounting(state);
  const receipt = {
    id: "rec_" + (state.accounting.nextReceiptNo++),
    receiptNo: state.accounting.nextReceiptNo - 1,
    entryId: entry.id,
    type: entry.type,
    text: entry.text,
    gameTime: entry.gameTime,
    period: entry.period,
    partnerName: entry.partnerName,
    amountCents: entry.lines.reduce((s, l) => s + l.debitCents, 0),
    status: "generated", // generated → checked → approved
    checkedAtMin: null,
    checkedBy: null,
    refType: entry.orderId ? "order" : entry.vehicleId ? "vehicle" : entry.employeeId ? "employee" : entry.branchId ? "branch" : null,
    refId: entry.orderId || entry.vehicleId || entry.employeeId || entry.branchId || null,
  };
  state.accounting.receipts.push(receipt);
  // Prüfungsaufgabe generieren
  addTask(state, { type: "check_receipt", points: 1, receiptId: receipt.id });
  return receipt;
}

// ---------- Offene Posten ----------
export function addOpenItem(state, params) {
  if (!state.accounting) initAccounting(state);
  const item = {
    id: "op_" + (state.accounting.nextOpenItemNo++),
    account: params.account,
    amountCents: params.amountCents,
    remainingCents: params.remainingCents || params.amountCents,
    cause: params.cause || "",
    partnerName: params.partnerName || null,
    orderId: params.orderId || null,
    vehicleId: params.vehicleId || null,
    employeeId: params.employeeId || null,
    refEntryId: params.refEntryId || null,
    createdAtMin: params.createdAtMin || state.gameTime,
    dueMin: params.dueMin || null,
    status: "open", // open → partially_paid → paid
    payments: [],
  };
  state.accounting.openItems.push(item);
  if (params.dueMin) {
    addTask(state, { type: "prepare_payment", points: 1, openItemId: item.id, dueMin: params.dueMin });
  }
  return item;
}

export function settleOpenItem(state, itemId, amountCents) {
  if (!state.accounting) initAccounting(state);
  const item = state.accounting.openItems.find(o => o.id === itemId);
  if (!item) throw new Error("Offener Posten nicht gefunden: " + itemId);
  const pay = Math.min(amountCents, item.remainingCents);
  if (pay <= 0) return { paid: 0, remaining: item.remainingCents };
  item.remainingCents -= pay;
  item.payments.push({ amountCents: pay, atMin: state.gameTime });
  item.status = item.remainingCents <= 0 ? "paid" : "partially_paid";
  // Buchung: Soll Verbindlichkeit, Haben Bank
  book(state, "pay_liability", {
    amountCents: pay,
    liabilityAccount: item.account,
    cause: item.cause,
    actor: "player",
  });
  return { paid: pay, remaining: item.remainingCents };
}

// ---------- Fahrzeug-Buchwert aus Anlagenverzeichnis (Auftrag 21) ----------
// Liefert den tatsächlichen Restbuchwert aus dem Anlagenverzeichnis,
// nicht den unveränderten Anschaffungswert auf dem Fahrzeugdatensatz.
export function getVehicleBookValue(state, vehicleId) {
  const asset = (state.accounting?.assets || []).find(
    a => a.vehicleId === vehicleId && a.disposedAtMin === null
  );
  if (asset) return asset.bookValueCents;
  const vehicle = (state.vehicles || []).find(v => v.id === vehicleId);
  return vehicle?.bookValueCents || 0;
}

// ---------- Anlagen ----------
export function registerAsset(state, params) {
  if (!state.accounting) initAccounting(state);
  const monthlyDep = Math.floor(params.acquisitionCostCents / DEPR_MONTHS);
  const asset = {
    id: "asset_" + (state.accounting.nextAssetNo++),
    vehicleId: params.vehicleId || null,
    account: params.account || "1200",
    name: params.name || "Anlage",
    acquisitionCostCents: params.acquisitionCostCents,
    acquiredAtMin: params.acquiredAtMin,
    acquiredPeriod: periodOf(params.acquiredAtMin),
    lastDepreciationMonth: periodOf(params.acquiredAtMin) - 1,
    accumulatedDepreciationCents: 0,
    bookValueCents: params.acquisitionCostCents,
    disposedAtMin: null,
    disposalPriceCents: null,
    monthlyDepreciationCents: monthlyDep,
    depreciationStartMonth: state.accounting.depreciationStartMonth,
  };
  state.accounting.assets.push(asset);
  return asset;
}

export function disposeAsset(state, assetId, salePriceCents) {
  if (!state.accounting) initAccounting(state);
  const asset = state.accounting.assets.find(a => a.id === assetId);
  if (!asset) throw new Error("Anlage nicht gefunden: " + assetId);
  // Abschreibung bis Abgang berechnen (vor Verkauf)
  depreciateAssetForMonth(state, asset, periodOf(state.gameTime), true);
  asset.disposedAtMin = state.gameTime;
  asset.disposalPriceCents = salePriceCents;
  book(state, "asset_disposal", {
    assetId: asset.id,
    assetName: asset.name,
    assetAccount: asset.account,
    bookValueCents: asset.bookValueCents,
    salePriceCents,
    vehicleId: asset.vehicleId,
  });
  return asset;
}

// ---------- Abschreibung ----------
function depreciateAssetForMonth(state, asset, currentMonth, isDisposal) {
  const lastBooked = asset.lastDepreciationMonth ?? (asset.accumulatedDepreciationCents > 0 ? state.accounting.lastDepreciationMonth : 0);
  if (lastBooked >= currentMonth) return 0;
  if (asset.disposedAtMin !== null) return 0;
  if (currentMonth < asset.depreciationStartMonth && !isDisposal) return 0;
  if (currentMonth < asset.acquiredPeriod) return 0;
  const monthlyDep = asset.monthlyDepreciationCents;
  const dailyDep = Math.floor(monthlyDep / MONTH_DAYS);
  let depRate = monthlyDep;
  // Anschaffungsmonat: zeitanteilig
  if (currentMonth === asset.acquiredPeriod && asset.acquiredPeriod >= asset.depreciationStartMonth) {
    const daysInMonth = MONTH_DAYS - Math.floor((asset.acquiredAtMin % MONTH_MIN) / 1440);
    depRate = dailyDep * daysInMonth;
  }
  // Abgangsmonat: zeitanteilig (Abgangstag zählt nicht)
  if (isDisposal && currentMonth === periodOf(state.gameTime)) {
    const daysUsed = Math.floor((state.gameTime % MONTH_MIN) / 1440);
    depRate = dailyDep * Math.max(0, daysUsed);
  }
  // Nicht unter 0
  depRate = Math.min(depRate, asset.bookValueCents);
  if (depRate > 0) {
    asset.lastDepreciationMonth = currentMonth;
    asset.accumulatedDepreciationCents += depRate;
    asset.bookValueCents -= depRate;
    book(state, "depreciation", {
      amountCents: depRate,
      assetId: asset.id,
      assetName: asset.name,
      assetAccount: asset.account,
      vehicleId: asset.vehicleId,
    });
  }
  return depRate;
}

export function calculateDepreciation(state, min) {
  if (!state.accounting) initAccounting(state);
  const currentMonth = periodOf(min);
  if (state.accounting.lastDepreciationMonth >= currentMonth) return;
  if (currentMonth < state.accounting.depreciationStartMonth) {
    state.accounting.lastDepreciationMonth = currentMonth;
    return;
  }
  for (const asset of state.accounting.assets) {
    // Alle Monate seit letzter Abschreibung bis zum aktuellen
    const startMonth = Math.max(state.accounting.lastDepreciationMonth + 1, asset.depreciationStartMonth);
    for (let m = startMonth; m <= currentMonth; m++) {
      depreciateAssetForMonth(state, asset, m, false);
    }
  }
  state.accounting.lastDepreciationMonth = currentMonth;
}

// ---------- Periodenabschluss ----------
export function processMonthEnd(state, min, log) {
  if (!state.accounting) initAccounting(state);
  const currentMonth = periodOf(min) - 1;
  if (currentMonth < 1) return;
  // Abschreibung buchen
  calculateDepreciation(state, min);
  // Periodenrecord erstellen oder aktualisieren
  let period = state.accounting.periods.find(p => p.month === currentMonth);
  if (!period) {
    const pnl = getPnL(state, periodStartMin(currentMonth), min - 1);
    period = {
      id: "per_" + currentMonth,
      month: currentMonth,
      startMin: periodStartMin(currentMonth),
      endMin: min,
      status: "open", // open → checking → ready → closed
      pnl,
      createdAtMin: min,
    };
    state.accounting.periods.push(period);
  }
  // Abschlussprüfungsaufgabe generieren
  addTask(state, { type: "period_close", points: 10, periodId: period.id, dueMin: min });
  log.push({ type: "month_end", month: currentMonth, atMin: min });
}

// ---------- Aufgaben (Buchhaltungspersonal) ----------
function addTask(state, params) {
  if (!state.accounting) initAccounting(state);
  // Keine Duplikate
  const exists = (state.accounting.taskQueue || []).some(t =>
    t.status === "pending" && t.type === params.type &&
    ((t.receiptId === params.receiptId && params.receiptId) ||
     (t.openItemId === params.openItemId && params.openItemId) ||
     (t.periodId === params.periodId && params.periodId))
  );
  if (exists) return;
  const task = {
    id: "task_" + (state.accounting.nextTaskNo++),
    type: params.type,
    points: params.points,
    status: "pending",
    receiptId: params.receiptId || null,
    openItemId: params.openItemId || null,
    periodId: params.periodId || null,
    dueMin: params.dueMin || null,
    createdAtMin: state.gameTime,
    completedAtMin: null,
    completedBy: null,
  };
  state.accounting.taskQueue.push(task);
}

export function processAccountant(state, emp, m, log) {
  if (!state.accounting) initAccounting(state);
  const capacity = emp.role === "accountant_senior" ? 10 : 5; // Prüfpunkte pro Stunde
  let remaining = capacity;
  const pending = (state.accounting.taskQueue || []).filter(t => t.status === "pending");
  for (const task of pending) {
    if (remaining <= 0) break;
    if (task.points > remaining) continue;
    // Aufgabe erledigen
    task.status = "done";
    task.completedAtMin = m;
    task.completedBy = emp.id;
    remaining -= task.points;
    if (task.type === "check_receipt") {
      const r = state.accounting.receipts.find(x => x.id === task.receiptId);
      if (r && r.status === "generated") { r.status = "checked"; r.checkedAtMin = m; r.checkedBy = emp.id; }
    } else if (task.type === "prepare_payment") {
      const item = state.accounting.openItems.find(x => x.id === task.openItemId);
      if (item) item.paymentPrepared = true;
    } else if (task.type === "period_close") {
      const per = state.accounting.periods.find(x => x.id === task.periodId);
      if (per && per.status === "open") per.status = "checking";
    }
    log.push({ type: "accountant_task_done", employee: emp.id, task: task.id, taskType: task.type, atMin: m });
  }
}

// ---------- Auswertungen ----------
function balancesAt(state, upToMin) {
  if (!state.accounting || upToMin < 0) return {};
  const balances = { ...state.accounting.accountBalances };
  if (upToMin === undefined || upToMin >= state.gameTime) return balances;
  const newer = projectionRange(state.accounting.journalProjection, upToMin, Infinity).accounts;
  const boundary = projectionRange(state.accounting.journalProjection, upToMin, upToMin).accounts;
  for (const [a, n] of Object.entries(newer)) balances[a] = (balances[a] || 0) - Number(n);
  for (const [a, n] of Object.entries(boundary)) balances[a] = (balances[a] || 0) + Number(n);
  for (const e of state.accounting.journal) if (e.gameTime > upToMin) {
    for (const l of e.lines) balances[l.account] = (balances[l.account] || 0) - l.debitCents + l.creditCents;
  }
  return balances;
}
export function getAccountBalance(state, accountNo, upToMin) {
  if (!state.accounting || upToMin < 0) return 0;
  if (upToMin === undefined || upToMin >= state.gameTime) return state.accounting.accountBalances?.[accountNo] || 0;
  return balancesAt(state, upToMin)[accountNo] || 0;
}

export function getAccountMovements(state, accountNo, fromMin, toMin) {
  if (!state.accounting) return [];
  if (state.accounting.journalProjection?.count && fromMin <= state.accounting.journalProjection.lastMin && toMin >= state.accounting.journalProjection.firstMin) {
    throw Error("Ältere Einzelbuchungen bitte über die vollständige Journalabfrage laden.");
  }
  return state.accounting.journal
    .filter(e => e.gameTime >= fromMin && e.gameTime <= toMin)
    .flatMap(e => e.lines.filter(l => l.account === accountNo).map(l => ({ ...l, entryId: e.id, gameTime: e.gameTime, text: e.text, type: e.type })));
}

export function getPnL(state, fromMin, toMin) {
  if (!state.accounting) return { revenue: 0, expenses: 0, result: 0, lines: [] };
  const atEnd = balancesAt(state, toMin), atStart = balancesAt(state, fromMin - 1);
  const lines = [];
  const revAccounts = ACCOUNT_LIST.filter(a => a.type === "revenue");
  const expAccounts = ACCOUNT_LIST.filter(a => a.type === "expense");
  let totalRev = 0, totalExp = 0;
  for (const acc of revAccounts) {
    const bal = (atEnd[acc.no] || 0) - (atStart[acc.no] || 0);
    if (bal !== 0) {
      const signed = -bal; // Erträge sind Haben (negativ im Saldo), contra positiv
      lines.push({ account: acc.no, name: acc.name, amountCents: -bal, type: "revenue", contra: acc.contra });
      totalRev += -bal;
    }
  }
  for (const acc of expAccounts) {
    const bal = (atEnd[acc.no] || 0) - (atStart[acc.no] || 0);
    if (bal !== 0) {
      lines.push({ account: acc.no, name: acc.name, amountCents: bal, type: "expense", contra: acc.contra });
      totalExp += bal;
    }
  }
  return { revenue: totalRev, expenses: totalExp, result: totalRev - totalExp, lines };
}

export function getBalanceSheet(state, atMin) {
  if (!state.accounting) return { assets: [], liabilities: [], equity: [], total: {} };
  const cap = atMin === undefined ? Infinity : atMin;
  const balances = balancesAt(state, cap);
  const assets = [], liabilities = [], equity = [];
  let totalAssets = 0, totalLiab = 0, totalEquity = 0;
  for (const acc of ACCOUNT_LIST) {
    const bal = balances[acc.no] || 0;
    if (bal === 0) continue;
    if (acc.type === "asset") {
      assets.push({ account: acc.no, name: acc.name, amountCents: bal });
      totalAssets += bal;
    } else if (acc.type === "liability") {
      liabilities.push({ account: acc.no, name: acc.name, amountCents: -bal });
      totalLiab += -bal;
    } else if (acc.type === "equity") {
      const signed = -bal;
      equity.push({ account: acc.no, name: acc.name, amountCents: signed, contra: acc.contra });
      totalEquity += signed;
    }
  }
  // Periodenergebnis hinzufügen
  const pnl = getPnL(state, 0, cap);
  if (pnl.result !== 0) {
    equity.push({ account: "PNL", name: "Periodenergebnis", amountCents: pnl.result });
    totalEquity += pnl.result;
  }
  return {
    assets, liabilities, equity,
    total: {
      assets: totalAssets,
      liabilities: totalLiab,
      equity: totalEquity,
      balanced: totalAssets === totalLiab + totalEquity,
    },
  };
}

export function getCashFlow(state, fromMin, toMin) {
  if (!state.accounting) return { operating: 0, investing: 0, financing: 0, total: 0 };
  const [operating, investing, financing] = financialRange(state, ACCOUNTS, fromMin, toMin).cash;
  return { operating, investing, financing, total: operating + investing + financing };
}

export function getLiquidityProjection(state, days) {
  const startMin = state.gameTime;
  const endMin = startMin + days * 1440;
  const currentBalance = state.company.accountCents;
  // Tägliche Pflichtkosten
  const dailyDriverWages = state.drivers.length * DRIVER_COST_PER_DAY;
  const dailyEmployeeWages = (state.employees || []).filter(e => e.employmentStatus === "employed").reduce((s, e) => s + e.costPerDayCents, 0);
  const dailyBranchCosts = state.branches.reduce((s, b) => s + b.costPerDayCents, 0);
  const dailyWithdrawal = PRIVATE_WITHDRAWAL_PER_DAY;
  const dailyTotal = dailyDriverWages + dailyEmployeeWages + dailyBranchCosts + dailyWithdrawal;
  // Erwartete Einnahmen aus laufenden Fahrten
  let expectedRevenue = 0;
  for (const trip of state.trips) {
    if (trip.status === "in_progress") expectedRevenue += trip.paymentCents;
  }
  // Fällige offene Posten
  let dueLiabilities = 0;
  for (const item of (state.accounting?.openItems || [])) {
    if (item.remainingCents > 0 && (!item.dueMin || item.dueMin <= endMin)) {
      dueLiabilities += item.remainingCents;
    }
  }
  // Finanzierungs-Verbindlichkeiten (Kredite, Leasing)
  let financingDue = 0;
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    for (let i = loan.paidInstallments; i < loan.termMonths; i++) {
      const dueMin = loan.firstPaymentMin + i * 30 * 1440;
      if (dueMin > endMin) break;
      if (dueMin > startMin) financingDue += loan.schedule[i]?.totalCents || 0;
    }
    financingDue += loan.overduePrincipalCents || 0;
    financingDue += loan.overdueInterestCents || 0;
    financingDue += loan.accruedInterestCents || 0;
  }
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active" && contract.status !== "ending") continue;
    for (let i = contract.paidRates; i < contract.termMonths; i++) {
      const dueMin = contract.startMin + i * 30 * 1440;
      if (dueMin > endMin) break;
      if (dueMin > startMin) financingDue += contract.monthlyRateCents;
    }
    financingDue += contract.overdueRatesCents || 0;
  }
  const projectedBalance = currentBalance + expectedRevenue - dailyTotal * days - dueLiabilities - financingDue;
  return {
    currentBalance, expectedRevenue, projectedExpenses: dailyTotal * days,
    dueLiabilities, financingDue, projectedBalance, days,
    dailyBreakdown: { driverWages: dailyDriverWages, employeeWages: dailyEmployeeWages, branchCosts: dailyBranchCosts, withdrawal: dailyWithdrawal },
  };
}

// ---------- Rollen-Mapping ----------
export function roleExpenseAccount(role) {
  const map = {
    driver: "5100", dispatcher: "5110", dispatcher_senior: "5110",
    cleaner: "5130", mechanic: "5130",
    accountant: "5120", accountant_senior: "5120",
    assistant: "5140",
    branch_manager: "5140",
  };
  return map[role] || "5120";
}

// ---------- Migration ----------
export function migrateAccounting(state) {
  if (!state.accounting) {
    initAccounting(state);
  }
  // Sicherstellen, dass alle Felder existieren
  const a = state.accounting;
  if (!a.journal) a.journal = [];
  if (!a.dailySummary) a.dailySummary = {};
  if (!a.receipts) a.receipts = [];
  if (!a.openItems) a.openItems = [];
  if (!a.assets) a.assets = [];
  if (!a.periods) a.periods = [];
  if (!a.accountBalances) a.accountBalances = {};
  // Cache aus Journal rekonstruieren falls leer aber Journal hat Einträge
  // (alte Spielstände vor dem Balance-Cache). O(journal) einmalig beim Laden.
  if ((a.journal.length > 0 || a.journalProjection?.count) && Object.keys(a.accountBalances).length === 0) {
    a.accountBalances = { ...projectionRange(a.journalProjection).accounts };
    for (const e of a.journal) {
      for (const l of e.lines) {
        a.accountBalances[l.account] = (a.accountBalances[l.account] || 0) + l.debitCents - l.creditCents;
      }
    }
  }
  if (!a.nextEntryNo) a.nextEntryNo = 1;
  if (!a.nextReceiptNo) a.nextReceiptNo = 1;
  if (!a.nextOpenItemNo) a.nextOpenItemNo = 1;
  if (!a.nextAssetNo) a.nextAssetNo = 1;
  if (!a.nextTaskNo) a.nextTaskNo = 1;
  if (!a.taskQueue) a.taskQueue = [];
  if (!a.lastDepreciationMonth) a.lastDepreciationMonth = 0;
  if (!a.depreciationStartMonth) a.depreciationStartMonth = Math.max(2, periodOf(state.gameTime) + 1);
  if (a.dailySummaryRebuilt === undefined) a.dailySummaryRebuilt = false;

  // Wenn noch keine Journal-Einträge existieren: Eröffnungsbilanz aus aktuellem Zustand
  if (a.journal.length === 0 && !a.journalProjection?.count && !a.migrationDone) {
    const bankCents = state.company?.accountCents || 0;
    const assetCents = (state.vehicles || []).reduce((s, v) => s + (v.bookValueCents || 0), 0);
    const liabilityCents = (state.openCosts || []).filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
    // Eröffnungsbuchung
    book(state, "opening", {
      bankCents, assetCents, liabilityCents,
      text: "Übernommener Spielstand – Eröffnungsbilanz",
    });
    // Anlagen registrieren
    for (const v of (state.vehicles || [])) {
      registerAsset(state, {
        vehicleId: v.id,
        account: "1200",
        name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
        acquisitionCostCents: v.bookValueCents || VEHICLE_PRICE,
        acquiredAtMin: state.gameTime,
      });
    }
    // Offene Kosten als offene Posten übernehmen
    for (const oc of (state.openCosts || []).filter(o => o.account === "company")) {
      addOpenItem(state, {
        account: "2120",
        amountCents: oc.amountCents,
        remainingCents: oc.amountCents,
        cause: oc.cause,
        createdAtMin: oc.createdAtMin || state.gameTime,
        refEntryId: null,
      });
    }
    a.depreciationStartMonth = Math.max(2, periodOf(state.gameTime) + 1);
    a.migrationDone = true;
  }

  // Tageszusammenfassung: einmaliger Reset und Neuaufbau aus dem Journal.
  // Durch einen früheren Bug wurde dailySummary bei jedem migrateAccounting-
  // Aufruf aus dem Journal neu addiert (statt nur einmal), was die Beträge
  // massiv überhöht hat. Wir erkennen das an einer Flag und bauen die
  // Zusammenfassung einmalig korrekt neu auf. postJournal pflegt sie danach
  // laufend weiter. Daten älter als 14 Tage (vor Journal-Kürzung) gehen
  // dabei verloren, waren aber bereits korrupt.
  if (!a.dailySummaryRebuilt) {
    a.dailySummary = {};
    const archivedDays = Object.entries(a.journalProjection?.days || {}).map(([day, d]: any) => ({ gameTime: Number(day) * 1440, lines: Object.entries(d.total.accounts).map(([account, n]) => ({ account, debitCents: Math.max(0, Number(n)), creditCents: Math.max(0, -Number(n)) })) }));
    for (const e of [...archivedDays, ...a.journal]) {
      if (!e || !e.lines) continue;
      const day = Math.floor(e.gameTime / 1440) + 1;
      const d = a.dailySummary[day] || (a.dailySummary[day] = { revenue: 0, expenses: 0, directCosts: 0, personnel: 0, operations: 0, depreciation: 0, finance: 0 });
      for (const l of e.lines) {
        const acc = ACCOUNTS[l.account];
        if (!acc) continue;
        if (acc.type === "revenue") {
          d.revenue += l.creditCents - l.debitCents;
        } else if (acc.type === "expense") {
          const amt = l.debitCents - l.creditCents;
          d.expenses += amt;
          if (acc.group === "direct_costs") d.directCosts += amt;
          else if (acc.group === "personnel") d.personnel += amt;
          else if (acc.group === "operations") d.operations += amt;
          else if (acc.group === "depreciation") d.depreciation += amt;
          else if (acc.group === "finance") d.finance += amt;
        }
      }
    }
    a.dailySummaryRebuilt = true;
  }

  // Alte, bereits gekürzte Exporte kennzeichnen; fehlende Buchungen lassen
  // sich aus dem Kontostand nicht zuverlässig rekonstruieren.
  if (a.historyChecked !== true) {
    const first = a.journalProjection?.firstEntryNo < (a.journal[0]?.entryNo ?? Infinity) ? { entryNo: a.journalProjection.firstEntryNo, gameTime: a.journalProjection.firstEntryMin } : a.journal[0];
    a.historyIncompleteBeforeMin = first?.entryNo > 1 ? first.gameTime : null;
    a.historyChecked = true;
  }
  return state;
}