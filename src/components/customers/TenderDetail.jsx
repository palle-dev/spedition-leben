import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatDay, formatClock } from "@/lib/customerData";
import NegotiationPanel from "./NegotiationPanel";
import {
  ArrowLeft, MapPin, Package, Clock, FileText, Gavel, TrendingUp,
  CheckCircle2, AlertTriangle, Info, Calculator, Shield, Award
} from "lucide-react";

export default function TenderDetail({ tenderId, onBack }) {
  const { state, send } = useGame();
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [bidPrice, setBidPrice] = React.useState("");
  const [calculation, setCalculation] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [capacityCheck, setCapacityCheck] = React.useState(null);

  const loadDetail = React.useCallback(async () => {
    try {
      const r = await send("getTenderDetails", { tenderId });
      setDetail(r);
      // Vorab-Kalkulation mit Marktpreis als Default
      if (r.tender && !r.tender.playerBid && !bidPrice) {
        const defaultPrice = Math.round(
          (r.tender.tons * 600 + 210 * Math.max(1, Math.round(
            Math.sqrt((r.tender.fromCity !== r.tender.toCity ? 100 : 0) + (r.tender.tons * 10))
          )) + 12500)
        );
        setBidPrice(String(defaultPrice));
      }
    } catch (e) { /* toast */ }
    finally { setLoading(false); }
  }, [tenderId, send]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await send("getTenderDetails", { tenderId });
        if (!cancelled) setDetail(r);
      } catch (e) { /* toast */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenderId, state.gameTime]);

  // Kalkulation aktualisieren bei Preisänderung
  React.useEffect(() => {
    if (!detail || !bidPrice) return;
    const price = parseInt(bidPrice, 10);
    if (isNaN(price) || price <= 0) { setCalculation(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await send("calculateBid", { tenderId, pricePerTransportCents: price });
        if (!cancelled) setCalculation(r.calculation);
      } catch (e) { /* toast */ }
    })();
    return () => { cancelled = true; };
  }, [bidPrice, detail, tenderId, send]);

  const handleSubmitBid = async () => {
    const price = parseInt(bidPrice, 10);
    if (isNaN(price) || price <= 0) return;
    setSubmitting(true);
    try {
      await send("submitBid", { tenderId, pricePerTransportCents: price });
      await loadDetail();
    } catch (e) { /* toast */ }
    finally { setSubmitting(false); }
  };

  const handleCheckCapacity = async () => {
    try {
      const r = await send("checkCapacityAtAcceptance", { tenderId });
      setCapacityCheck(r);
    } catch (e) { /* toast */ }
  };

  if (loading || !detail) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Lade Ausschreibung…</div>;
  }

  const { tender, customer, relation, playerEvaluation } = detail;
  const weights = tender.evaluationCriteria.weights;
  const sortedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
      </button>

      {/* Ausschreibungskopf */}
      <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-lime" />
              <h3 className="font-heading text-lg font-semibold">Ausschreibung: {tender.customerName}</h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3" />
              {tender.fromCity} → {tender.toCity}
            </div>
          </div>
          <span className={`shrink-0 px-2 py-1 rounded-md text-xs font-medium ${
            tender.status === "open" ? "bg-lime/10 text-lime" :
            tender.status === "evaluating" ? "bg-amber-500/10 text-amber-400" :
            tender.status === "awarded" ? "bg-lime/20 text-lime" :
            "bg-coral/10 text-coral"
          }`}>
            {tender.status === "open" ? "Offen" :
             tender.status === "evaluating" ? "In Bewertung" :
             tender.status === "awarded" ? "Zuschlag erhalten" :
             tender.status === "lost" ? "Nicht gewonnen" :
             "Abgelaufen"}
          </span>
        </div>

        {/* Eckdaten */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Fracht</div>
            <div className="font-medium">{tender.cargo}</div>
            <div className="text-muted-foreground">{tender.tons} t</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Transporte</div>
            <div className="font-medium">{tender.transportsPerDay}× pro Tag</div>
            <div className="text-muted-foreground">{tender.durationDays} Tage</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Angebotsfrist</div>
            <div className="font-medium">{formatDay(tender.offerDeadlineMin)}</div>
            <div className="text-muted-foreground">{formatClock(tender.offerDeadlineMin)}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Entscheidung</div>
            <div className="font-medium">{formatDay(tender.decisionMin)}</div>
            <div className="text-muted-foreground">Beginn: {formatDay(tender.contractStartMin)}</div>
          </div>
        </div>

        {tender.requiresDg && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span>Gefahrgut-Transport erforderlich (Klasse {tender.dgClass || "unbekannt"})</span>
          </div>
        )}
      </div>

      {/* Bewertungskriterien */}
      <div className="rounded-xl border border-white/10 glass p-4 space-y-2">
        <h4 className="font-medium text-sm flex items-center gap-1.5">
          <Award className="w-4 h-4" /> Bewertungskriterien
        </h4>
        <p className="text-[11px] text-muted-foreground">
          {customer?.name} gewichtet die Kriterien branchenspezifisch. Höhere Gewichtung = wichtiger.
        </p>
        <div className="space-y-1.5">
          {sortedWeights.map(([key, weight]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs w-32 shrink-0 text-muted-foreground">
                {tender.evaluationCriteria.criteriaLabels[key]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${key === "price" ? "bg-lime" : key === "reliability" ? "bg-cyan-400" : key === "capacity" ? "bg-amber-400" : "bg-purple-400"}`}
                  style={{ width: `${Math.round(weight * 100)}%` }}
                />
              </div>
              <span className="text-xs tabular-nums w-10 text-right">{Math.round(weight * 100)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Spieler-Bewertung (falls bereits Angebot abgegeben) */}
      {playerEvaluation && (
        <div className="rounded-xl border border-lime/20 bg-lime/5 p-4 space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-lime" /> Ihre Bewertung
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <div className="font-medium tabular-nums">{playerEvaluation.priceScore}</div>
              <div className="text-muted-foreground text-[10px]">Preis</div>
            </div>
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <div className="font-medium tabular-nums">
                {playerEvaluation.reliabilityScore !== null ? playerEvaluation.reliabilityScore : "—"}
              </div>
              <div className="text-muted-foreground text-[10px]">Zuverlässigkeit</div>
            </div>
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <div className="font-medium tabular-nums">{playerEvaluation.relationFitScore}</div>
              <div className="text-muted-foreground text-[10px]">Passung</div>
            </div>
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <div className="font-medium tabular-nums">{playerEvaluation.capacityScore}</div>
              <div className="text-muted-foreground text-[10px]">Kapazität</div>
            </div>
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <div className="font-medium tabular-nums">{playerEvaluation.relationshipScore}</div>
              <div className="text-muted-foreground text-[10px]">Beziehung</div>
            </div>
          </div>
          {!playerEvaluation.hasReliabilityHistory && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="w-3 h-3" />
              Keine Zuverlässigkeits-Historie — neutral bewertet.
            </div>
          )}
          <div className="text-sm font-medium text-lime">
            Gesamtbewertung: {playerEvaluation.totalScore} Punkte
          </div>
        </div>
      )}

      {/* Angebotsabgabe (nur wenn offen und noch nicht abgegeben) */}
      {tender.status === "open" && !tender.playerBid && (
        <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
          <h4 className="font-medium text-sm flex items-center gap-1.5">
            <Gavel className="w-4 h-4" /> Angebot abgeben
          </h4>

          {/* Preis-Eingabe */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Angebotspreis pro Transport (€)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={bidPrice}
                onChange={(e) => setBidPrice(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm tabular-nums focus:outline-none focus:border-lime/30"
                placeholder="z.B. 45000"
                step="100"
              />
              <span className="text-xs text-muted-foreground">€</span>
            </div>
          </div>

          {/* Live-Kalkulation */}
          {calculation && (
            <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Calculator className="w-3.5 h-3.5" /> Kalkulation
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground text-[10px]">Variable Kosten/Trip</div>
                  <div className="tabular-nums">{formatEuro(calculation.costPerTrip)}</div>
                  <div className="text-muted-foreground text-[10px]">Treibstoff: {formatEuro(calculation.fuelPerTrip)} · Maut: {formatEuro(calculation.tollPerTrip)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Deckungsbeitrag/Trip</div>
                  <div className={`tabular-nums font-medium ${calculation.contributionPerTrip < 0 ? "text-coral" : "text-lime"}`}>
                    {formatEuro(calculation.contributionPerTrip)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Transporte gesamt</div>
                  <div className="tabular-nums">{calculation.totalTransports}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Gesamtumsatz</div>
                  <div className="tabular-nums">{formatEuro(calculation.totalRevenue)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Gesamtkosten (var.)</div>
                  <div className="tabular-nums">{formatEuro(calculation.totalCost)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Gesamt-DB</div>
                  <div className={`tabular-nums font-medium ${calculation.totalContribution < 0 ? "text-coral" : "text-lime"}`}>
                    {formatEuro(calculation.totalContribution)}
                  </div>
                </div>
              </div>

              {calculation.belowCost && (
                <div className="flex items-center gap-1.5 text-[11px] text-coral bg-coral/5 border border-coral/20 rounded p-2">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Preis liegt unter den variablen Kosten!
                </div>
              )}

              {calculation.capacityConflicts.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Kapazitätskonflikte:
                  </div>
                  {calculation.capacityConflicts.map((c, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground pl-4">· {c.description}</div>
                  ))}
                </div>
              )}

              <div className="space-y-0.5">
                <div className="text-[10px] text-muted-foreground/70">Unsichere Annahmen:</div>
                {calculation.uncertainAssumptions.map((a, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground pl-3">· {a}</div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSubmitBid}
            disabled={submitting || !bidPrice}
            className="w-full text-sm px-3 py-2 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-50"
          >
            {submitting ? "Angebot wird abgegeben…" : "Angebot verbindlich abgeben"}
          </button>
        </div>
      )}

      {/* Abgegebenes Angebot */}
      {tender.playerBid && tender.status !== "awarded" && (
        <div className="rounded-xl border border-white/10 glass p-4 space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-lime" /> Angebot abgegeben
          </h4>
          <div className="text-xs space-y-1">
            <div>Preis pro Transport: <span className="font-medium tabular-nums">{formatEuro(tender.playerBid.pricePerTransportCents)}</span></div>
            <div className="text-muted-foreground">Abgegeben: {formatDay(tender.playerBid.submittedAtMin)} {formatClock(tender.playerBid.submittedAtMin)}</div>
            <div className="text-muted-foreground">Entscheidung: {formatDay(tender.decisionMin)} {formatClock(tender.decisionMin)}</div>
          </div>
        </div>
      )}

      {/* Zuschlag → Verhandlung */}
      {tender.status === "awarded" && (
        <NegotiationPanel tenderId={tender.id} onCheckCapacity={handleCheckCapacity} capacityCheck={capacityCheck} />
      )}

      {/* Ergebnis-Erklärung */}
      {tender.awardExplanation && tender.status !== "awarded" && (
        <div className={`rounded-xl border p-4 space-y-2 ${
          tender.status === "lost" ? "border-coral/20 bg-coral/5" : "border-white/10 glass"
        }`}>
          <h4 className="font-medium text-sm">Ergebnis</h4>
          <div className="text-xs whitespace-pre-line text-muted-foreground">{tender.awardExplanation}</div>
        </div>
      )}
    </div>
  );
}