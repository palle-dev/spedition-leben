import React, { useState, useRef, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { History, Loader2 } from "lucide-react";

const labels = { accountingJournal: "Buchungsjournal", expiredOffers: "Abgelaufene Angebote", accountingTasks: "Erledigte Buchhaltungsaufgaben",
  orders: "Aufträge", trips: "Fahrten", tours: "Touren", receipts: "Belege", bookings: "Buchungen",
  events: "Meldungen", mailMessages: "E-Mails", mailConversations: "Unterhaltungen", mailConversationVersions: "Frühere Unterhaltungen",
  mailTasks: "Postfachaufgaben", appointments: "Termine", approvals: "Freigaben", assistantDecisions: "Assistent",
  delegationDecisions: "Delegation", investmentPrices: "Kursverlauf", investmentTransfers: "Depottransfers",
  investmentFills: "Handelsausführungen", investmentOrders: "Investmentorders", investmentPerformance: "Depotentwicklung",
  investmentAdvisor: "Investmentberater", investmentStaking: "Staking", customerRelations: "Kundenbeziehungen",
  disruptions: "Störungen", storyRuns: "Geschichten", privateChronicle: "Private Chronik", worldChronicle: "Spielwelt",
  marketEvents: "Marktereignisse", applicants: "Bewerber", gifts: "Geschenke", dates: "Verabredungen", promises: "Versprechen",
  driverSatisfaction: "Fahrerzufriedenheit", poachingAttempts: "Abwerbungen", cooperationOffers: "Kooperationsangebote", cooperations: "Kooperationen", branchDecisions: "Filialentscheidungen", settledCosts: "Beglichene Kosten", autoDecisionDays: "Automatische Entscheidungen" };
const fields = { id: "Kennung", customer: "Kunde", customerId: "Kunde", fromCity: "Abholung", toCity: "Ziel", cargo: "Ladung", tons: "Tonnen", status: "Status", subject: "Betreff", body: "Nachricht", text: "Beschreibung", cause: "Anlass", reason: "Begründung", type: "Art", min: "Spielzeit", gameTime: "Spielzeit", scope: "Zuordnung", vehicleId: "Fahrzeug", driverId: "Fahrer", orderId: "Auftrag", title: "Titel", name: "Name", amountCents: "Betrag", paymentCents: "Vergütung", paidCents: "Gezahlt", fuelCents: "Kraftstoffkosten", tollCents: "Maut", archivedAtMin: "Archiviert", deliveredAtMin: "Zugestellt", completedAtMin: "Abgeschlossen", startMin: "Beginn", endMin: "Ende", acceptDeadlineMin: "Annahmefrist", deliveryDeadlineMin: "Lieferfrist", data: "Originaldaten", lines: "Positionen", phases: "Fahrtabschnitte", history: "Verlauf", details: "Einzelheiten", messageIds: "Nachrichten", isOutgoing: "Ausgehend", read: "Gelesen" };
const fieldLabel = key => fields[key] || key.replace(/Cents$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
function valueText(key, value) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number" && /Cents$/.test(key)) return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value / 100);
  if (typeof value === "number" && (/(AtMin|DeadlineMin|startMin|endMin)$/.test(key) || ["min", "gameTime"].includes(key))) return `Tag ${Math.floor(value / 1440) + 1}, ${String(Math.floor(value % 1440 / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}
const label = kind => labels[kind.replace(/^history:/, "")] || kind.replace(/^history:/, "");

export default function HistoryBrowser() {
  const { state, queryHistory } = useGame();
  const [snapshot, setSnapshot] = useState(null), [kind, setKind] = useState(""), [search, setSearch] = useState("");
  const [page, setPage] = useState({ rows: [], cursor: null }), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  async function load(s, next = null, selectedKind = kind, text = search) {
    const id = ++request.current;
    setBusy(true); setError(null);
    try {
      const result = await queryHistory(s, { kind: selectedKind, search: text, cursor: next });
      if (request.current === id) setPage({ ...result, filter: JSON.stringify([selectedKind, text]) });
    } catch (e) { if (request.current === id) setError(e.message); }
    finally { if (request.current === id) setBusy(false); }
  }
  if (!state?.historyArchive?.chunks?.length) return null;
  return <section className="space-y-3 rounded-xl border border-white/10 p-3">
    <Button variant="ghost" disabled={busy} onClick={() => {
      if (snapshot) { request.current++; setSnapshot(null); }
      else { setSnapshot(state); void load(state); }
    }}><History className="w-4 h-4" />{snapshot ? "Historie schließen" : "Historie im Spiel öffnen"}</Button>
    {snapshot && <>
      <p className="text-xs text-muted-foreground">Archivierte Originaldaten dieser Sicherung. Die Suche umfasst alle archivierten Felder. Neueste Archivblöcke zuerst.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void load(snapshot); }}>
        <select aria-label="Historienbereich" className="bg-surface-2 rounded p-2 text-sm max-w-full" value={kind} onChange={e => setKind(e.target.value)} disabled={busy}>
          <option value="">Alle Bereiche</option>
          {[...new Set(snapshot.historyArchive.chunks.map(c => c.kind))].sort().map(k => <option key={k} value={k}>{label(k)}</option>)}
        </select>
        <input aria-label="Historie durchsuchen" className="bg-surface-2 rounded p-2 text-sm min-w-0 flex-1" placeholder="Kunde, Ort, ID oder Text …" value={search} onChange={e => setSearch(e.target.value)} disabled={busy} />
        <Button type="submit" disabled={busy}>Suchen</Button>
      </form>
      {busy && <p role="status" className="text-sm flex gap-2"><Loader2 className="w-4 h-4 animate-spin" />Historie wird geladen …</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!busy && !error && !page.rows.length && <p className="text-sm text-muted-foreground">Keine passenden Einträge.</p>}
      <div className="max-h-80 overflow-auto space-y-2">
        {page.rows.map(({kind: k, record}, i) => {
          const data = k.startsWith("history:") ? record.data : record;
          const title = data?.subject || data?.text || data?.title || data?.customer || data?.reason || data?.id || label(k);
          return <details key={i} className="rounded-lg border border-white/10 p-2 text-sm">
            <summary className="cursor-pointer break-words">{label(k)} · {String(title)}{record.scope ? ` · ${record.scope}` : ""}</summary>
            <dl className="mt-2 space-y-1">
              {Object.entries(data && typeof data === "object" ? data : { Wert: data }).map(([key, value]) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                <dt className="text-muted-foreground break-words">{fieldLabel(key)}</dt>
                <dd className="whitespace-pre-wrap break-words">{valueText(key, value)}</dd>
              </div>)}
            </dl>
          </details>;
        })}
      </div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void load(snapshot)}>Erste Seite</Button>
        <Button variant="outline" disabled={busy || !page.cursor || page.filter !== JSON.stringify([kind, search])} onClick={() => void load(snapshot, page.cursor)}>Weitere Einträge</Button></div>
    </>}
  </section>;
}
