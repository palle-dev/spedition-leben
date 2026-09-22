import { useGame } from "@/lib/gameContext";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { ACCOUNT_LIST, accountName } from "@/lib/accountingData";
import { Search, ChevronRight } from "lucide-react";

export default function JournalView({ state }) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState(null);

  const { queryJournal } = useGame();
  const [snapshot, setSnapshot] = useState(state);
  const [page, setPage] = useState({ rows: [], before: null });
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const request = useRef(0);
  useEffect(() => {
    if (state.meta?.partyId !== snapshot.meta?.partyId) {
      request.current++; setSnapshot(state); setPage({ rows: [], before: null }); setSelected(null);
    }
  }, [state, snapshot]);
  const filters = useMemo(() => ({ search, account: accountFilter, type: typeFilter }), [search, accountFilter, typeFilter]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    const id = ++request.current;
    setBusy(true); setError(null); setSelected(null);
    const timer = setTimeout(() => {
      queryJournal(snapshot, { filters }).then(result => {
        if (request.current === id) setPage({ ...result, filterKey });
      }).catch(e => { if (request.current === id) setError(e.message); })
        .finally(() => { if (request.current === id) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); request.current++; };
  }, [snapshot, filters, filterKey, queryJournal]);
  async function nextPage() {
    const id = ++request.current;
    setBusy(true); setError(null); setSelected(null);
    try {
      const result = await queryJournal(snapshot, { filters, before: page.before });
      if (request.current === id) setPage({ ...result, filterKey });
    } catch (e) { if (request.current === id) setError(e.message); }
    finally { if (request.current === id) setBusy(false); }
  }
  const journal = page.rows;

  const types = useMemo(() => {
    const set = new Set([...(snapshot.accounting?.journal || []).map(e => e.type), ...(snapshot.accounting?.journalProjection?.types || [])]);
    return Array.from(set).sort();
  }, [snapshot]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Vollständiges Journal einschließlich archivierter Buchungen · Stand {formatGameTime(snapshot.gameTime)}</span>
        <button disabled={busy} onClick={() => setSnapshot({ ...state })} className="text-lime">Aktualisieren / erste Seite</button>
      </div>
      {busy && <p role="status" className="text-sm text-muted-foreground">Journal wird geladen …</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche im Journal…"
            className="w-full rounded-lg bg-surface-2 border border-white/10 pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-lime/40"
          />
        </div>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40"
        >
          <option value="">Alle Konten</option>
          {ACCOUNT_LIST.map(a => (
            <option key={a.no} value={a.no}>{a.no} · {a.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40"
        >
          <option value="">Alle Typen</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Journal-Tabelle */}
      <div className="glass border border-white/10 rounded-xl overflow-hidden">
        {!busy && !error && journal.length === 0 ? (
          <div className="text-sm text-muted-foreground/50 py-8 text-center">
            Keine Buchungen gefunden.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {(!busy && !error && snapshot.meta?.partyId === state.meta?.partyId && page.filterKey === filterKey ? journal : []).map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelected(entry)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition text-sm"
              >
                <span className="text-xs text-muted-foreground/50 tabular-nums w-8 shrink-0">#{entry.entryNo}</span>
                <span className="text-xs text-muted-foreground tabular-nums w-28 shrink-0 hidden sm:block">{formatGameTime(entry.gameTime)}</span>
                <span className="flex-1 min-w-0 truncate text-foreground/80">{entry.text}</span>
                <span className="text-xs text-muted-foreground/50 hidden md:block shrink-0">{entry.type}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
              </button>
            ))}
          </div>
        )}
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-white/5 flex justify-between">
          <span>Bis zu 50 Buchungen pro Seite</span>
          <button className="text-lime disabled:opacity-40" disabled={busy || !!error || page.before == null || page.filterKey !== filterKey} onClick={nextPage}>Ältere Buchungen</button>
        </div>
      </div>

      {/* Detail-Drawer */}
      {selected && (
        <EntryDetail entry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function EntryDetail({ entry, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[80vh] overflow-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs text-muted-foreground/50 tabular-nums">Buchung #{entry.entryNo}</div>
            <h3 className="font-medium text-lg mt-0.5">{entry.text}</h3>
            <div className="text-xs text-muted-foreground mt-1">{formatGameTime(entry.gameTime)} · Periode {entry.period}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10 transition text-muted-foreground">✕</button>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-xs text-muted-foreground">
                <th className="text-left px-3 py-2 font-normal">Konto</th>
                <th className="text-right px-3 py-2 font-normal">Soll</th>
                <th className="text-right px-3 py-2 font-normal">Haben</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground tabular-nums text-xs mr-2">{l.account}</span>
                    {accountName(l.account)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-lime/80">{l.debitCents > 0 ? formatEuro(l.debitCents) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-coral/80">{l.creditCents > 0 ? formatEuro(l.creditCents) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 font-medium">
                <td className="px-3 py-2">Summe</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatEuro(entry.lines.reduce((s, l) => s + l.debitCents, 0))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatEuro(entry.lines.reduce((s, l) => s + l.creditCents, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {entry.type && <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-muted-foreground">{entry.type}</span>}
          {entry.actor && <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-muted-foreground">Actor: {entry.actor}</span>}
          {entry.orderId && <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-muted-foreground">Auftrag: {entry.orderId}</span>}
          {entry.vehicleId && <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-muted-foreground">Fahrzeug: {entry.vehicleId}</span>}
        </div>
      </div>
    </div>
  );
}