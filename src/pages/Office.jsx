import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import Drawer from "@/components/ui/Drawer";
import DispositionForm from "@/components/DispositionForm";
import OfficeHeader from "@/components/office/OfficeHeader";
import OfficeKPIs from "@/components/office/OfficeKPIs";
import FleetOverview from "@/components/office/FleetOverview";
import DecisionsPanel from "@/components/office/DecisionsPanel";
import TeamActivity from "@/components/office/TeamActivity";
import OfficeBottom from "@/components/office/OfficeBottom";
import { Package, ArrowRight } from "lucide-react";

// Büro – zentrale Führungsansicht für die gesamte Firma.
// Kompakte Kopfzeile, Kennzahlen, Flottenlage, Entscheidungen,
// Mitarbeiteraktivität und Ausblicke auf Finanzen/Personal/Wachstum/Privatleben.
export default function Office() {
  const { state } = useGame();
  const navigate = useNavigate();
  const [period, setPeriod] = useState("today");
  const [drawerOrderId, setDrawerOrderId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Schnellaktion: dringendsten unzugewiesenen Auftrag anzeigen
  const unassigned = (state.orders || []).find(o =>
    o.status === "angenommen" &&
    !(state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress") &&
    !(state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id))
  );

  function handleQuickAction() {
    if (!unassigned) { navigate("/auftraege"); return; }
    openDrawer(unassigned.id);
  }

  function openDrawer(orderId) { setDrawerOrderId(orderId); setDrawerOpen(true); }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-4 lg:py-6 max-w-[1600px] mx-auto space-y-4">
      {/* Kopfzeile */}
      <OfficeHeader state={state} period={period} setPeriod={setPeriod} />

      {/* Kennzahlen */}
      <OfficeKPIs state={state} period={period} />

      {/* Hauptbereich: Flotte + Entscheidungen/Aktivität */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Flottenübersicht – nimmt 2/3 ein auf Desktop */}
        <div className="lg:col-span-2 space-y-3">
          <FleetOverview state={state} />

          {/* Schnellaktion für unzugewiesenen Auftrag */}
          {unassigned && (
            <div className="glass border border-lime/20 rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-lime/10 grid place-items-center text-lime shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{unassigned.customer}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {unassigned.fromCity} → {unassigned.toCity} · {unassigned.tons} t · Frist {formatGameTime(unassigned.deliveryDeadlineMin)}
                  </div>
                </div>
              </div>
              <button
                onClick={handleQuickAction}
                className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 bg-lime text-ink font-semibold text-xs hover:brightness-110 transition"
              >
                <ArrowRight className="w-3.5 h-3.5" /> Disponieren
              </button>
            </div>
          )}
        </div>

        {/* Entscheidungen + Aktivität – rechte Spalte */}
        <div className="space-y-3">
          <DecisionsPanel state={state} />
          <TeamActivity state={state} />
        </div>
      </div>

      {/* Unterer Bereich: Finanzen, Personal, Wachstum, Privatleben */}
      <OfficeBottom state={state} />

      {/* Dispositions-Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Transport planen" kicker="Disposition" maxWidth="max-w-lg">
        {drawerOrderId && <DispositionForm orderId={drawerOrderId} onClose={() => setDrawerOpen(false)} onSuccess={() => setDrawerOpen(false)} />}
      </Drawer>
    </div>
  );
}