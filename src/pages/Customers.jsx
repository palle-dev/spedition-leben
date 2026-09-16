import React from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import CustomerList from "@/components/customers/CustomerList";
import CustomerDetail from "@/components/customers/CustomerDetail";
import { Users, Star, FileText, Network } from "lucide-react";

export default function Customers() {
  const { state, send } = useGame();
  const [customers, setCustomers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await send("getCustomerSummaries", {});
        if (!cancelled) setCustomers(r.customers || []);
      } catch (e) {
        // Fehler wird als Toast angezeigt
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.gameTime]);

  const stammkundenCount = customers.filter(c => c.isStammkunde).length;
  const activeContracts = customers.filter(c => c.activeContract && c.activeContract.status === "active").length;

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="px-4 lg:px-12 py-4 border-b border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-lime" /> Kunden
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Dauerkundenbeziehungen, Vertrauen und Rahmenverträge
            </p>
          </div>
          {!selectedId && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <Star className="w-3.5 h-3.5 text-lime" />
                <span className="font-medium tabular-nums">{stammkundenCount}</span>
                <span className="text-muted-foreground">Stammkunden</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <FileText className="w-3.5 h-3.5 text-lime" />
                <span className="font-medium tabular-nums">{activeContracts}</span>
                <span className="text-muted-foreground">Verträge</span>
              </div>
              <Link
                to="/netzwerk"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:border-lime/30 hover:bg-lime/5 transition"
                title="Kundenbeziehungen auf der Netzkarte analysieren"
              >
                <Network className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Netzkarte</span>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Inhalt */}
      <div className="flex-1 px-4 lg:px-12 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Lade Kunden…</div>
        ) : selectedId ? (
          <CustomerDetail customerId={selectedId} onBack={() => setSelectedId(null)} />
        ) : (
          <CustomerList customers={customers} onSelect={setSelectedId} />
        )}
      </div>
    </div>
  );
}