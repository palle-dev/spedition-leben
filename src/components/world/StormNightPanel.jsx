import React, { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CloudLightning, Loader2, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { STORM_CHOICES, STORM_JOBS, stormNightAvailable, stormNightActive, stormNightPickup, stormNightStartReason } from "@/lib/simulation/stormNight";

const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40 disabled:cursor-not-allowed";
const outcomeLabels = { on_time: "Pünktlich geliefert", late: "Verspätet geliefert", failed: "Nicht geliefert" };
function route(state, job) {
  const trip = (state.trips || []).find(t => t.orderId === job.orderId && t.status === "in_progress");
  return { trip, to: "/disposition?" + (trip ? "trip=" + encodeURIComponent(trip.id) : "order=" + encodeURIComponent(job.orderId)) };
}
export function stormDeadline(deadline, now) {
  const minutes = Math.max(0, deadline - now);
  return now > deadline ? "Lieferfrist überschritten" : now === deadline ? "Lieferfrist jetzt" : "Noch " + Math.floor(minutes / 60) + " h " + minutes % 60 + " min";
}
export function StormNightGuide({ state }) {
  if (!stormNightActive(state)) return null;
  const a = state.world.stormNight;
  const open = a.jobs.filter(j => !a.results[j.key]).sort((x, y) => x.deadlineMin - y.deadlineMin);
  const urgent = open[0], path = urgent ? route(state, urgent) : null;
  return <aside aria-label="Sturmnacht begleiten" className="rounded-xl border border-sky-300/25 bg-slate-950/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
    <div><p className="text-xs text-sky-200 font-medium">{urgent ? urgent.title + " · " + stormDeadline(urgent.deadlineMin, state.gameTime) : "Der Morgen nach dem Sturm"}</p>
      <p className="text-xs text-muted-foreground mt-1">{urgent ? open.length + " Zusage(n) offen. Prüfe beide Teams im Büro; die Spielzeit läuft nur, wenn du sie fortsetzt." : "Die Lieferergebnisse stehen fest. Lies Annas Antwort im Büro."}</p></div>
    <div className="flex flex-wrap gap-2">{path && <Link className={button + " py-2 text-sky-100"} to={path.to}>{path.trip ? "Dringende Fahrt verfolgen" : "Dringende Tour planen"}<ArrowRight className="w-4 h-4" /></Link>}
      <Link className={button + " py-2"} to="/">Zur Notfallübersicht</Link></div>
  </aside>;
}
function Result({ result }) {
  return <div aria-label={result.title + " – Ergebnis"} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
    <h3 className="font-medium">{result.title}</h3>
    <p className={result.outcome === "on_time" ? "text-lime text-sm" : "text-amber-200 text-sm"}>{outcomeLabels[result.outcome]}</p>
    <p className="text-xs text-slate-300">{result.fromCity} → {result.toCity}{result.deliveredAtMin != null ? " · " + formatGameTime(result.deliveredAtMin) : ""}{result.driverName ? " · " + result.driverName : ""}</p>
    <p className="text-sm">Gebuchte Vergütung: <strong>{formatEuro(result.paidCents)}</strong></p>
    <p className="text-xs text-slate-300">Verlässlichkeit {result.reputationDelta > 0 ? "+" : ""}{result.reputationDelta} · Hansen-Verhältnis {result.relationDelta > 0 ? "+" : ""}{result.relationDelta}</p>
  </div>;
}
export default function StormNightPanel({ showCompleted = false }) {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const a = state?.world?.stormNight;
  if (!state || (!a && !stormNightAvailable(state)) || (a?.status === "done" && !showCompleted)) return null;
  const blocked = state.appointments?.some(ap => ap.status === "active" && ap.type !== "scenario_timeoff");
  const disabled = pending || busy || backgroundAdvance?.active || blocked;
  const pickup = a?.pickupMin ?? stormNightPickup(state);
  async function act(command, choiceId = undefined) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setPending(true);
    try {
      const result = await send(command, choiceId ? { choiceId } : {});
      if (result?.orderIds?.length === 1) navigate("/disposition?order=" + encodeURIComponent(result.orderIds[0]));
      if (command === "finishStormNight") showToast("Die Nacht ist vorbei. Deine Zusagen bleiben in Erinnerung.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { inFlight.current = false; setPending(false); }
  }
  const icon = pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />;
  return <section aria-label="Die Nacht am Kai – Notfallschicht" className="rounded-3xl border border-sky-300/25 bg-gradient-to-br from-slate-800 via-slate-900 to-ink p-5 sm:p-7 space-y-5">
    <header className="max-w-3xl">
      <p className="text-xs text-sky-200 uppercase tracking-[0.16em] flex items-center gap-2"><CloudLightning className="w-4 h-4" />Die Nacht am Kai</p>
      <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-3">{a?.status === "debrief" || a?.status === "done" ? "Was von dieser Nacht bleibt." : "Zwei Anrufe. Eine lange Nacht."}</h2>
      <p className="text-sm text-slate-300 mt-2">Dein Kunde braucht Ersatzteile. Anna braucht Hilfe. Ein Versprechen braucht einen Lkw, einen wachen Fahrer und Zeit.</p>
    </header>
    {blocked && <p role="status" className="text-sm text-amber-200">Während deines persönlichen Termins warten neue Zusagen.</p>}
    {!a && <>
      <blockquote className="rounded-xl border-l-2 border-sky-300/50 bg-black/20 p-4 text-sm leading-relaxed">
        <p className="font-medium text-sky-100">Anna · 420 € für die Notfahrt</p>
        <p className="text-slate-300 mt-2">„Der Sturm hat unsere Hafenrampe gesperrt. Ab 20 Uhr können wir wieder laden. Das Pumpenzubehör muss noch diese Nacht nach Bremen. Kann ich auf dich zählen?“</p>
      </blockquote>
      <p className="text-sm text-slate-200 max-w-3xl">Gleichzeitig bietet dein eigener Kunde 950 € für eine Ersatzteillieferung. Noch hast du nichts zugesagt. Beide Ladungen warten in Hamburg; Annas Zeitfenster ist enger. Mit zwei freien Teams kannst du beide übernehmen.</p>
      <div className="grid sm:grid-cols-2 gap-3">{STORM_JOBS.map(job => <div key={job.key} className="rounded-xl border border-white/10 p-4 space-y-2">
        <h3 className="font-medium">{job.title}</h3><p className="text-sm">{formatEuro(job.paymentCents)} · Hamburg → Bremen · {job.tons} t</p>
        <p className="text-xs text-slate-300">{job.cargo}</p>
        <p className="text-xs text-sky-100">Abholung {formatGameTime(pickup)} · Frist {formatGameTime(pickup + job.windowMin)}</p>
        <p className="text-xs text-slate-400">Pünktlich: Verlässlichkeit +{job.key === "anna" ? "5, Hansen-Verhältnis +10" : "3"}. Verspätet: Verlässlichkeit −3{job.key === "anna" ? ", Hansen −4" : ""}. Nicht geliefert: Verlässlichkeit −5{job.key === "anna" ? ", Hansen −8" : ""}.</p>
      </div>)}</div>
      <div className="grid lg:grid-cols-3 gap-3">{STORM_CHOICES.map(choice => {
        const reason = stormNightStartReason(state, choice.id);
        return <article key={choice.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 flex flex-col gap-3">
          <h3 className="font-medium">{choice.label}</h3><p className="text-sm text-slate-300 leading-relaxed flex-1">{choice.detail}</p>
          {reason && <p className="text-xs text-amber-200">{reason}</p>}
          <button aria-label={choice.label + " – verbindlich zusagen"} disabled={disabled || !!reason} className={button + " text-sky-100"} onClick={() => act("startStormNight", choice.id)}>Verbindlich zusagen {icon}</button>
        </article>;
      })}</div>
      <p className="text-xs text-slate-400">Bis zur Zusage wartet diese Geschichte. Danach stehen die Fristen fest. Die Sperre betrifft diese beiden Ladungen bis 20 Uhr; andere Aufträge bleiben unverändert. Keine Teilnahmegebühr. Normale Fahrtkosten, Ruhezeiten, Verspätungsabschläge und Stornoregeln gelten. Prüfe Standorte und Arbeitsbudget vor dem Start – Wartezeit im Tourplan ersetzt keine Ruhezeit.</p>
      <Link to="/spielwelt" className="text-xs text-sky-200 underline underline-offset-4">Zur bisherigen Kapitelentscheidung</Link>
    </>}
    {a && <>
      <p className="text-sm text-sky-100">{STORM_CHOICES.find(c => c.id === a.choiceId)?.label} · Rampe frei ab {formatGameTime(pickup)}</p>
      <div className="grid md:grid-cols-2 gap-3">{a.jobs.map(job => {
        const result = a.results[job.key];
        if (result) return <Result key={job.key} result={result} />;
        const path = route(state, job), order = state.orders?.find(o => o.id === job.orderId);
        return <article key={job.key} className="rounded-xl border border-sky-300/20 bg-black/20 p-4 space-y-3">
          <h3 className="font-medium flex items-center gap-2"><Truck className="w-4 h-4" />{job.title}</h3>
          <p className="text-sm">Hamburg → Bremen · {job.tons} t · {formatEuro(job.paymentCents)}</p>
          <p className="text-xs text-slate-300">{job.cargo}</p>
          <p className="text-sm text-sky-100">{stormDeadline(job.deadlineMin, state.gameTime)}</p>
          <p className="text-xs text-slate-300">Lieferung bis {formatGameTime(job.deadlineMin)}</p>
          {!order && <p role="status" className="text-xs text-amber-200">Der Auftrag fehlt in der aktuellen Liste. Das gilt nicht als erfolgreiche Lieferung.</p>}
          <Link className={button} to={path.to}>{path.trip ? "Fahrt verfolgen" : "Fahrer und Lkw planen"}<ArrowRight className="w-4 h-4" /></Link>
        </article>;
      })}</div>
      {a.status === "running" && <p className="text-xs text-slate-400">Jede Zusage zählt einzeln. Plane bei zwei Aufträgen beide Teams. Die Ergebnisse erscheinen hier, sobald geliefert oder storniert wurde.</p>}
      {a.ending && <div className="space-y-3"><h3 className="text-lg font-medium">Der Morgen nach dem Sturm</h3><p className="text-sm text-slate-200 leading-relaxed max-w-3xl">{a.ending}</p></div>}
      {a.status === "debrief" && <button disabled={disabled} className={button + " text-sky-100"} onClick={() => act("finishStormNight")}>Nacht abschließen {icon}</button>}
      {a.status === "done" && <p className="text-xs text-slate-400">Die Weltchronik bewahrt eure Lieferungen. Im nächsten Kapitel zählt auch Annas tatsächliches Vertrauen.</p>}
      <p className="text-xs text-slate-400">Vergütung ist Umsatz. Kraftstoff, Maut und laufende Kosten werden separat gebucht.</p>
      <Link to="/finanzen" className="block text-xs text-sky-200 underline underline-offset-4">Buchungen und Kosten ansehen</Link>
    </>}
  </section>;
}
