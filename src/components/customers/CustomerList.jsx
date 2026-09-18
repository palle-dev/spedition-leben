import React from "react";
import { getTrustColor, formatEuro } from "@/lib/customerData";
import { Search, Star, FileText, TrendingUp, MapPin } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function CustomerList({ customers, onSelect }) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("all"); // all, stammkunde, contract, none
  const [sortBy, setSortBy] = React.useState("name"); // name, trust, revenue, transports

  const filtered = React.useMemo(() => {
    let list = [...customers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q));
    }
    if (filter === "stammkunde") list = list.filter(c => c.isStammkunde);
    if (filter === "contract") list = list.filter(c => c.contractStatus === "active" || c.contractStatus === "offered");
    if (filter === "none") list = list.filter(c => c.contractStatus === "none");

    list.sort((a, b) => {
      if (sortBy === "trust") return b.trust - a.trust;
      if (sortBy === "revenue") return b.revenueCents - a.revenueCents;
      if (sortBy === "transports") return b.completedTransports - a.completedTransports;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [customers, search, filter, sortBy]);

  return (
    <div className="space-y-3">
      {/* Suche + Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Kunde oder Branche suchen…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-lime/40"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-auto w-auto min-w-[130px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-lime/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Kunden</SelectItem>
            <SelectItem value="stammkunde">Stammkunden</SelectItem>
            <SelectItem value="contract">Mit Vertrag</SelectItem>
            <SelectItem value="none">Ohne Vertrag</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-auto w-auto min-w-[130px] px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-lime/40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="trust">Vertrauen</SelectItem>
            <SelectItem value="revenue">Umsatz</SelectItem>
            <SelectItem value="transports">Transporte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Kundenliste */}
      <div className="grid gap-2">
        {filtered.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="flex items-center gap-3 p-3 rounded-xl glass border border-white/10 hover:border-lime/30 transition text-left group"
          >
            {/* Vertrauen-Badge */}
            <div className="flex flex-col items-center gap-0.5 shrink-0 w-14">
              <span className={`text-lg font-semibold tabular-nums ${getTrustColor(c.trust)}`}>{c.trust}</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Vertrauen</span>
            </div>

            {/* Kundeninfo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{c.name}</span>
                {c.isStammkunde && <Star className="w-3.5 h-3.5 text-lime shrink-0 fill-lime/30" />}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <MapPin className="w-3 h-3" />
                <span className="truncate">{c.depots.join(", ")}</span>
                <span>·</span>
                <span className="truncate">{c.industry}</span>
              </div>
            </div>

            {/* Statistiken */}
            <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
              <div className="text-right">
                <div className="font-medium tabular-nums">{c.completedTransports}</div>
                <div className="text-muted-foreground text-[10px]">Transporte</div>
              </div>
              <div className="text-right">
                <div className="font-medium tabular-nums">{formatEuro(c.revenueCents)}</div>
                <div className="text-muted-foreground text-[10px]">Umsatz</div>
              </div>
            </div>

            {/* Vertragsstatus */}
            <div className="shrink-0">
              {c.activeContract ? (
                <span className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                  c.activeContract.status === "active" ? "bg-lime/10 text-lime" : "bg-coral/10 text-coral"
                }`}>
                  <FileText className="w-3 h-3" />
                  {c.activeContract.status === "active" ? "Aktiv" : "Angebot"}
                </span>
              ) : c.isStammkunde ? (
                <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/5 text-muted-foreground">
                  <TrendingUp className="w-3 h-3" />
                  Berechtigt
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/60">—</span>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">Keine Kunden gefunden.</div>
        )}
      </div>
    </div>
  );
}