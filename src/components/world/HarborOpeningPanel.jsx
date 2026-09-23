import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Anchor, ArrowRight, CheckCircle2, Clock, Loader2, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { HARBOR_HANDOVERS, harborOpeningAvailable, harborOpeningStartReason, harborOpeningFeedback } from "@/lib/simulation/harborOpening";

const money = cents => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const when = min => "Tag " + (Math.floor(min / 1440) + 1) + ", " + String(Math.floor(min % 1440 / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40 disabled:cursor-not-allowed";
const labels = { on_time: "Pünktlich geliefert", late: "Verspätet geliefert", failed: "Nicht geliefert" };

export function HarborOpeningGuide({ state }) {
  const a = state.world?.harborOpening;
  const navigate = useNavigate();
  if (!a || a.status === "done") return null;
  const orderId = a.status === "return" ? a.returnId : a.outboundId;
  const trip = (state.trips || []).find(t => t.orderId === orderId && t.status === "in_progress");
  const isTransport = ["outbound", "return"].includes(a.status);
  const path = isTransport ? "/disposition?" + (trip ? "trip=" + encodeURIComponent(trip.id) : "order=" + encodeURIComponent(orderId)) : "/";
  const title = a.status === "briefing" ? "Anna wartet auf deine Entscheidung" :
    ["debrief", "finale"].includes(a.status) ? "Anna hat sich gemeldet" :
      trip ? "Dein Versprechen ist unterwegs" : a.status === "return" ? "Mit einer Rückladung nach Hause" : "Die erste Tour für Anna";
  return <aside aria-label="Annas Auftakt begleiten" className="rounded-xl border border-sky-300/25 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0"><p className="text-xs text-sky-200 font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">
      {isTransport ? trip ? "Verfolge die Fahrt. Live-Simulation oder „1 Stunde weiter“ lässt die Spielzeit voranschreiten." : "Wähle einen passenden Lkw und Fahrer, prüfe die Vorschau und bestätige den Tourstart." : "Im Büro geht eure Geschichte weiter. Die nächste Zusage liegt bei dir."}
    </p></div>
    <button className={button + " py-2 text-sky-100"} onClick={() => navigate(path)}>{isTransport ? trip ? "Fahrt verfolgen" : "Tour planen" : "Zu Anna"}<ArrowRight className="w-4 h-4" /></button>
  </aside>;
}

function DeliveryResult({ result, feeCents = 0 }) {
  if (!result) return null;
  return <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2" aria-label="Ergebnis der Lieferung">
    <p className={"font-medium text-sm " + (result.outcome === "on_time" ? "text-lime" : "text-amber-200")}>{labels[result.outcome]}</p>
    <p className="text-xs text-muted-foreground">{result.fromCity} → {result.toCity}{result.deliveredAtMin != null ? " · angekommen " + when(result.deliveredAtMin) : ""}</p>
    <p className="text-sm">Gebuchte Vergütung: <strong>{money(result.paidCents)}</strong></p>
    {feeCents > 0 && <p className="text-xs text-muted-foreground">Zusätzliche Rampe: {money(feeCents)} bereits bezahlt.</p>}
    <p className="text-xs text-muted-foreground">Vergütung ist Umsatz. Kraftstoff, Maut und laufende Kosten findest du in den Finanzen.</p>
  </div>;
}

export default function HarborOpeningPanel({ showCompleted = false }) {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const a = state?.world?.harborOpening;
  const available = harborOpeningAvailable(state);
  if (!state || (!a && !available)) return null;
  if (a?.status === "done" && !showCompleted) return <aside className="rounded-xl border border-sky-300/20 bg-slate-950/60 p-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-300">{a.outboundResult ? "Anna wartet am Kai. Eure Geschichte geht weiter." : "Du spielst frei weiter. Anna bleibt Teil der Spielwelt."}</p><Link to="/spielwelt" className="text-sm text-sky-200 underline underline-offset-4">Am Kai weiterreden</Link></aside>;
  const blocked = state.appointments?.some(ap => ap.status === "active" && ap.type !== "scenario_timeoff");
  const disabled = pending || busy || backgroundAdvance?.active || blocked;
  const startReason = !a ? harborOpeningStartReason(state) : null;
  const orderId = a?.status === "return" ? a.returnId : a?.outboundId;
  const order = (state.orders || []).find(o => o.id === orderId);
  const trip = (state.trips || []).find(t => t.orderId === orderId && t.status === "in_progress");
  const steps = ["Anna kennenlernen", "Nach Bremen liefern", "Rückmeldung", "Zurück nach Hamburg"];
  const step = !a || a.status === "briefing" ? 0 : a.status === "outbound" ? 1 : a.status === "debrief" ? 2 : 3;
  async function act(command, params = {}, plan = false) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setPending(true);
    try {
      const result = await send(command, params);
      if (plan && result?.orderId) navigate("/disposition?order=" + encodeURIComponent(result.orderId));
      if (command === "finishHarborOpening") showToast("Deine Entscheidung bleibt Teil eurer Geschichte.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { inFlight.current = false; setPending(false); }
  }
  const actionIcon = pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />;
  return <section aria-label="Ein Versprechen am Kai" className="relative overflow-hidden rounded-3xl border border-sky-300/25 bg-gradient-to-br from-slate-800 via-slate-900 to-ink p-5 sm:p-7 space-y-5">
    <div className="absolute right-3 top-3 text-sky-200 opacity-[0.06] pointer-events-none" aria-hidden="true"><Anchor className="w-40 h-40" /></div>
    <header className="relative max-w-3xl">
      <p className="text-xs text-sky-200 uppercase tracking-[0.16em] flex items-center gap-2"><Anchor className="w-4 h-4" /> Anna Hansen · Dein Auftakt am Kai</p>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-3">Ein Versprechen am Kai.</h2>
      <p className="text-sm text-slate-300 mt-2 leading-relaxed">Zwei Touren. Ein Kunde, der zweifelt. Und die Frage, ob man sich auf deine Firma verlassen kann.</p>
    </header>
    {a && a.status !== "done" && <ol aria-label="Fortschritt des Auftakts" className="relative grid grid-cols-2 sm:grid-cols-4 gap-2">{steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} className={"rounded-lg border p-2 text-xs " + (i === step ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400")}><span className="mr-2">{i + 1}</span>{label}</li>)}</ol>}
    {blocked && <p role="status" className="text-sm text-amber-200">Du nimmst gerade an einem persönlichen Termin teil. Anna wartet, bis du wieder Zeit hast.</p>}
    {!a && <div className="relative space-y-4 max-w-3xl">
      <p className="text-sm text-slate-200 leading-relaxed">Anna steht mit der Tourenmappe ihres Vaters in deiner Tür. „Er fällt aus. Unser Stammkunde in Bremen braucht sechs Tonnen Ersatzteile – und Malte von NordSprint hat schon angerufen. Ich brauche jemanden, der sein Wort hält.“</p>
      <p className="text-xs text-slate-400">Du hörst dir zuerst die Übergabe an. Noch keine Kosten, kein angenommener Auftrag. Dabei beginnt die Spielwelt mit ihren Geschichten und Ausschreibungen ab deiner jetzigen Spielzeit.</p>
      {startReason && <p className="text-sm text-amber-200">{startReason}</p>}
      <button disabled={disabled || !!startReason} className={button + " bg-sky-300/15 text-sky-100 border-sky-300/30"} onClick={() => act("startHarborOpening")}>Anna zuhören {actionIcon}</button>
      <p className="text-xs text-slate-400">Du kannst auch frei weiterspielen. Diese Einladung wartet auf dich.</p>
    </div>}
    {a?.status === "briefing" && <div className="relative space-y-4">
      <h3 className="text-lg font-medium">Eine Rampe, zwei Möglichkeiten.</h3>
      <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">Anna zeigt auf den Vermerk des Kunden: Die reguläre Warenannahme ist belegt. „Wir können eine zusätzliche Rampe bezahlen. Oder ich stimme ein späteres Fenster ab – dann reduziert der Kunde die Vergütung. Was passt zu deinem Betrieb?“</p>
      <div className="grid md:grid-cols-2 gap-3">{HARBOR_HANDOVERS.map(c => <div key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-col gap-3">
        <h4 className="font-medium text-sm">{c.label}</h4><p className="text-sm text-slate-300 leading-relaxed flex-1">{c.detail}</p>
        {(c.feeCents > 0 && state.company.accountCents < c.feeCents) && <p className="text-xs text-amber-200">Dafür reicht das Firmenkonto gerade nicht.</p>}
        <button aria-label={c.label + " – zusagen und planen"} disabled={disabled || (c.feeCents > 0 && state.company.accountCents < c.feeCents)} className={button + " text-sky-100"} onClick={() => act("chooseHarborHandover", { choiceId: c.id }, true)}>So zusagen & planen {actionIcon}</button>
      </div>)}</div>
      <p className="text-xs text-slate-400">Hamburg → Bremen · 6 t Stückgut · Fristen ab deiner Zusage. Anfahrt, Lenkzeiten, Kraftstoff und Maut gelten wie bei jeder Tour. Bei Storno gilt die normale Gebühr.</p>
      <button disabled={disabled} className="text-xs text-slate-400 underline underline-offset-4 disabled:opacity-40" onClick={() => act("finishHarborOpening")}>Noch nichts zusagen und frei weiterspielen</button>
    </div>}
    {a && ["outbound", "return"].includes(a.status) && <div className="relative space-y-4">
      <h3 className="text-lg font-medium">{a.status === "return" ? "Die zweite Chance fährt nach Hause." : "Jetzt zählt, was auf der Straße passiert."}</h3>
      <p className="text-sm text-slate-200">{trip ? (((state.drivers || []).find(d => d.id === trip.driverId)?.name || "Dein Fahrer") + " ist mit der Ladung unterwegs. Anna wartet auf die Rückmeldung des Kunden.") : "Der Auftrag ist angenommen. Wähle in der Disposition einen geeigneten Lkw und Fahrer und bestätige den Tourstart."}</p>
      {order && <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-black/20 p-4 text-sm">
        <span className="flex items-center gap-2"><Truck className="w-4 h-4 text-sky-200" />{order.fromCity} → {order.toCity} · {order.tons} t</span>
        <span>{money(order.paymentCents)} Vergütung</span>
        <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-sky-200" />Lieferung bis {when(order.deliveryDeadlineMin)}</span>
        {order.earliestPickupMin > state.gameTime && <span>Abholung ab {when(order.earliestPickupMin)}</span>}
      </div>}
      <Link className={button + " text-sky-100 bg-sky-300/10"} to={"/disposition?" + (trip ? "trip=" + encodeURIComponent(trip.id) : "order=" + encodeURIComponent(orderId))}>{trip ? "Fahrt verfolgen" : "Annas Tour planen"}<ArrowRight className="w-4 h-4" /></Link>
      <p className="text-xs text-slate-400">Die Fahrt braucht Spielzeit. Nutze unten die Live-Simulation oder „1 Stunde weiter“. Nach der Lieferung wartet Annas Antwort hier im Büro.</p>
    </div>}
    {a && ["debrief", "finale"].includes(a.status) && <div className="relative space-y-4">
      <h3 className="text-lg font-medium flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-sky-200" />Anna meldet sich.</h3>
      <p className="text-sm text-slate-200 leading-relaxed max-w-3xl">{harborOpeningFeedback(a, a.status === "debrief" ? "outbound" : "return")}</p>
      <DeliveryResult result={a.status === "debrief" ? a.outboundResult : a.returnResult} feeCents={a.status === "debrief" ? a.feeCents : 0} />
      {a.status === "debrief" && a.outboundResult.outcome !== "failed" && <div className="rounded-xl border border-sky-300/20 p-4 space-y-3">
        <p className="text-sm font-medium">Rückladung: Bremen → Hamburg · 4 t · 720 €</p>
        <p className="text-xs text-slate-300">Zwölf Spielstunden Lieferzeit ab Zusage. Prüfe Standort und verbleibende Lenkzeit deines Fahrers. Du entscheidest, ob du die Rückladung übernehmen kannst.</p>
        <button disabled={disabled} className={button + " text-sky-100 bg-sky-300/10"} onClick={() => act("acceptHarborReturn", {}, true)}>Rückladung zusagen & planen {actionIcon}</button>
      </div>}
      <div className="flex flex-wrap gap-3">
        <button disabled={disabled} className={button} onClick={() => act("finishHarborOpening")}>{a.status === "debrief" && a.outboundResult.outcome !== "failed" ? "Rückladung anderen überlassen" : "Rückmeldung abschließen"} {actionIcon}</button>
        <Link className={button + " text-slate-300"} to="/finanzen">Kosten ansehen</Link>
      </div>
    </div>}
    {a?.status === "done" && <div className="relative space-y-3">
      <p className="text-sm text-slate-200 leading-relaxed">{a.ending}</p>
      {a.outboundResult && <DeliveryResult result={a.outboundResult} feeCents={a.feeCents} />}
      {a.returnResult && <DeliveryResult result={a.returnResult} />}
      <p className="text-xs text-sky-200">Eure Entscheidungen bleiben in der Weltchronik erhalten.</p>
    </div>}
  </section>;
}
