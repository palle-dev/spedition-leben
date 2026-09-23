import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Flag, Loader2, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { NORDSPRINT_OFFERS, nordSprintAvailable, nordSprintActive, nordSprintStartReason, nordSprintPickup, nordSprintFeedback } from "@/lib/simulation/nordSprintChallenge";

const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40 disabled:cursor-not-allowed";
const labels = { on_time: "Pünktlich geliefert", late: "Verspätet geliefert", failed: "Nicht geliefert" };
const relations = { testing: "Du stehst auf dem Prüfstand", second_chance: "Die nächste Tour wird dir angeboten", comparing: "Der Kunde vergleicht wieder", proven: "Probelauf bewährt · Folgeauftrag ausgelassen", preferred: "Zwei gehaltene Zusagen" };
function route(state, a) {
  const id = a.status === "followup" ? a.followupId : a.trialId;
  const trip = (state.trips || []).find(t => t.orderId === id && t.status === "in_progress");
  return { id, trip, to: "/disposition?" + (trip ? "trip=" + encodeURIComponent(trip.id) : "order=" + encodeURIComponent(id)) };
}
export function NordSprintGuide({ state }) {
  const a = state?.world?.nordSprintChallenge;
  if (!nordSprintActive(state)) return null;
  const transport = ["trial", "followup"].includes(a.status);
  const { trip, to } = route(state, a);
  return <aside aria-label="NordSprint-Probelauf begleiten" className="rounded-xl border border-amber-300/25 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <div><p className="text-xs text-amber-200 font-medium">{transport ? trip ? "Jetzt zählt dein Versprechen" : "Dein Auftrag gegen NordSprint" : "Der Kunde hat geantwortet"}</p>
      <p className="text-xs text-muted-foreground mt-1">{transport ? trip ? "Verfolge die Lieferung. Unten kannst du die Spielzeit fortsetzen." : "Prüfe Fahrzeug, Fahrer und Lieferfenster in der Disposition." : "Im Büro siehst du das Ergebnis und entscheidest über den nächsten Schritt."}</p></div>
    <Link className={button + " py-2 text-amber-100"} to={transport ? to : "/"}>{transport ? trip ? "Fahrt verfolgen" : "Tour planen" : "Kundenantwort lesen"}<ArrowRight className="w-4 h-4" /></Link>
  </aside>;
}
function Result({ result }) {
  if (!result) return null;
  return <div aria-label="Ergebnis des Kundenauftrags" className="rounded-xl bg-black/20 border border-white/10 p-4 space-y-2">
    <p className={"text-sm font-medium " + (result.outcome === "on_time" ? "text-lime" : "text-amber-200")}>{labels[result.outcome]}</p>
    <p className="text-xs text-slate-300">{result.fromCity} → {result.toCity}{result.deliveredAtMin != null ? " · " + formatGameTime(result.deliveredAtMin) : ""}{result.driverName ? " · " + result.driverName : ""}</p>
    <p className="text-sm">Gebuchte Vergütung: <strong>{formatEuro(result.paidCents)}</strong></p>
    <p className="text-xs text-slate-300">Kundenvertrauen {result.customerTrustDelta > 0 ? "+" : ""}{result.customerTrustDelta} · Verlässlichkeit {result.reputationDelta > 0 ? "+" : ""}{result.reputationDelta}</p>
    <p className="text-xs text-muted-foreground">Vergütung ist Umsatz. Kraftstoff, Maut und laufende Kosten werden separat gebucht.</p>
  </div>;
}
export default function NordSprintChallengePanel({ showCompleted = false }) {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const a = state?.world?.nordSprintChallenge;
  if (!state || (!a && !nordSprintAvailable(state)) || (a?.status === "done" && !showCompleted)) return null;
  const blocked = state.appointments?.some(ap => ap.status === "active" && ap.type !== "scenario_timeoff");
  const disabled = pending || busy || backgroundAdvance?.active || blocked;
  const reason = !a ? nordSprintStartReason(state) : null;
  const choice = NORDSPRINT_OFFERS.find(c => c.id === a?.choiceId);
  const transport = a && ["trial", "followup"].includes(a.status);
  const path = a ? route(state, a) : null;
  const order = (state.orders || []).find(o => o.id === path?.id);
  async function act(command, params = {}, plan = false) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setPending(true);
    try {
      const result = await send(command, params);
      if (plan && result?.orderId) navigate("/disposition?order=" + encodeURIComponent(result.orderId));
      if (command === "finishNordSprintChallenge") showToast("Dein Lieferergebnis bleibt Teil der Geschichte.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { inFlight.current = false; setPending(false); }
  }
  const icon = pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />;
  return <section aria-label="Der Preis deines Versprechens" className="rounded-3xl border border-amber-300/25 bg-gradient-to-br from-slate-800 via-slate-900 to-ink p-5 sm:p-7 space-y-5">
    <header className="max-w-3xl"><p className="text-xs text-amber-200 uppercase tracking-[0.16em] flex items-center gap-2"><Flag className="w-4 h-4" />Der Preis der Nacht · NordSprint</p>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-3">Der Preis deines Versprechens.</h2>
      <p className="text-sm text-slate-300 mt-2">Ein günstigeres Angebot gewinnt Aufmerksamkeit. Deine Lieferung entscheidet, ob der Kunde bleibt.</p></header>
    {blocked && <p role="status" className="text-sm text-amber-200">Während deines persönlichen Termins warten neue Zusagen.</p>}
    {!a && <div className="space-y-4">
      <blockquote className="rounded-xl border-l-2 border-amber-300/50 bg-black/20 p-4 text-sm leading-relaxed"><p className="font-medium text-amber-100">Malte · NordSprint: 520 €</p><p className="text-slate-300 mt-2">„Hamburg nach Bremen. Sechs Tonnen. Zwölf Stunden ab Abholung. Kann deine Firma da mithalten?“</p></blockquote>
      <p className="text-sm text-slate-200 max-w-3xl leading-relaxed">Der Kunde am Anleger gibt dir einen verbindlichen Probelauf: Entweder unterbietest du Malte oder du rechtfertigst den höheren Preis mit einem früheren Lieferfenster. Das ist ein zugesagter Testauftrag, keine offene Auktion.</p>
      <p className="text-sm text-amber-100">Abholung bei Zusage jetzt: {formatGameTime(nordSprintPickup(state))} · Hamburg → Bremen · 6 t Stückgut</p>
      <div className="grid md:grid-cols-2 gap-3">{NORDSPRINT_OFFERS.map(c => <article key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-col gap-3">
        <h3 className="text-base font-medium">{c.label}</h3><p className="text-2xl font-semibold text-amber-100">{formatEuro(c.paymentCents)}</p>
        <p className="text-sm text-slate-300 leading-relaxed flex-1">{c.detail}</p>
        <p className="text-xs text-slate-400">Lieferung bis {formatGameTime(nordSprintPickup(state) + c.windowMin)}. Bei pünktlichem Probelauf: Verlässlichkeit +{c.id === "quality" ? 5 : 3}, {c.id === "quality" ? "Qualität +3" : "Verhandlungsvorsprung +2"}.</p>
        <button aria-label={c.label + " – Probelauf zusagen"} disabled={disabled || !!reason} className={button + " text-amber-100"} onClick={() => act("startNordSprintChallenge", { choiceId: c.id }, true)}>Probelauf zusagen & planen {icon}</button>
      </article>)}</div>
      {reason && <p className="text-sm text-amber-200">{reason}</p>}
      <p className="text-xs text-slate-400">Keine Zusage ohne deinen Klick. Keine zusätzliche Teilnahmegebühr. Normale Fahrtkosten, Storno- und Verspätungsregeln gelten. Ein verspäteter oder stornierter Probelauf bringt keinen Folgeauftrag. Du kannst auch die bisherige Kapitelentscheidung in der Spielwelt wählen.</p>
      <Link to="/spielwelt" className="text-xs text-amber-200 underline underline-offset-4">Zur Kapitelentscheidung</Link>
    </div>}
    {a && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3 text-sm">
      <span>{choice?.label}</span><span className="text-amber-200">Vertrauen des Kontors: {a.customerTrust}/100</span><span className="text-slate-300">{relations[a.customerStatus]}</span>
    </div>}
    {transport && <div className="space-y-4">
      <h3 className="text-lg font-medium">{a.status === "trial" ? "Dein Probelauf entscheidet." : "Jetzt zählt auch die zweite Zusage."}</h3>
      {order ? <div className="space-y-2 text-sm text-slate-200"><p className="flex items-center gap-2"><Truck className="w-4 h-4" />{order.fromCity} → {order.toCity} · {order.tons} t · {formatEuro(order.paymentCents)}</p><p>Abholung ab {formatGameTime(order.earliestPickupMin)}</p><p>Lieferung bis {formatGameTime(order.deliveryDeadlineMin)}</p></div>
        : <p role="status" className="text-sm text-amber-200">Der Auftrag ist nicht in der aktuellen Liste. Ein fehlender Datensatz zählt nicht als Lieferung.</p>}
      <Link className={button + " text-amber-100"} to={path.to}>{path.trip ? "Fahrt verfolgen" : "Kundenauftrag planen"}<ArrowRight className="w-4 h-4" /></Link>
      <p className="text-xs text-slate-400">Wähle Fahrer und Fahrzeug selbst. Die Spielzeit muss bis zur Lieferung fortschreiten.</p>
    </div>}
    {a && ["debrief", "finale", "done"].includes(a.status) && <div className="space-y-4">
      <h3 className="text-lg font-medium">Die Antwort des Kunden</h3>
      <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">{a.status === "done" ? a.ending : nordSprintFeedback(a)}</p>
      <Result result={a.status === "done" ? a.trialResult : a.followupResult || a.trialResult} />
      {a.status === "done" && <Result result={a.followupResult} />}
      {a.status === "debrief" && a.trialResult.outcome === "on_time" && <div className="rounded-xl border border-amber-300/25 p-4 space-y-3">
        <p className="text-sm font-medium">Dein Folgeangebot: Bremen → Hamburg · 6 t · {formatEuro(choice.followupCents)}</p>
        <p className="text-xs text-slate-300">Abholung sofort, zwölf Spielstunden Lieferzeit ab deiner Zusage. Prüfe verbleibende Fahrerzeit und Standort. Keine automatische Annahme.</p>
        <button disabled={disabled} className={button + " text-amber-100"} onClick={() => act("acceptNordSprintFollowup", {}, true)}>Folgeauftrag zusagen & planen {icon}</button>
      </div>}
      {a.status !== "done" && <button disabled={disabled} className={button} onClick={() => act("finishNordSprintChallenge")}>{a.status === "debrief" && a.trialResult.outcome === "on_time" ? "Folgeauftrag anderen überlassen" : "Kapitel abschließen"} {icon}</button>}
      {a.status === "done" && <p className="text-xs text-slate-400">Die Weltchronik bewahrt eure Ergebnisse. Dein veränderter Ruf zählt bei weiteren Ausschreibungen. Aus diesem Probelauf entsteht kein automatischer Rahmenvertrag.</p>}
      <Link to="/finanzen" className="block text-xs text-amber-200 underline underline-offset-4">Buchungen und Kosten ansehen</Link>
    </div>}
  </section>;
}
