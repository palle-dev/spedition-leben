import NordSprintChallengePanel from "@/components/world/NordSprintChallengePanel";
import { nordSprintActive } from "@/lib/simulation/nordSprintChallenge";
import CompetitionPanel from "@/components/world/CompetitionPanel";
import HarborOpeningPanel from "@/components/world/HarborOpeningPanel";
import { harborOpeningActive } from "@/lib/simulation/harborOpening";
import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Anchor, ArrowRight, BookOpen, Check, Clock, Compass, Flag, Heart, Loader2, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { WORLD_STORIES, WORLD_BIDS, worldScene } from "@/lib/simulation/worldCatalog";
import { worldChoiceReason, worldBidReason, worldAppointmentSlot } from "@/lib/simulation/worldEngine";

const money = cents => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = min => "Tag " + (Math.floor(min / 1440) + 1) + ", " + String(Math.floor(min % 1440 / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const card = "glass border border-white/10 rounded-2xl";
const button = "rounded-xl border border-white/15 px-4 py-3 text-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-40 disabled:cursor-not-allowed";
const outcomeLabels = { delivered: "Pünktlich geliefert", late: "Verspätet geliefert", failed: "Nicht erfüllt", rival: "An Konkurrenz vergeben", unassigned: "Kein geeigneter Anbieter" };

export default function GameWorld() {
  const { state, send, showToast, busy, backgroundAdvance } = useGame();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = ["stories", "competition", "chronicle"].includes(searchParams.get("view")) ? searchParams.get("view") : "stories";
  const setTab = value => setSearchParams({ view: value });
  const [pending, setPending] = useState(false);
  const w = state?.world;
  const blocked = state?.appointments?.some(a => a.status === "active" && a.type !== "scenario_timeoff");
  const disabled = pending || busy || backgroundAdvance?.active || blocked;
  async function act(command, params = {}) {
    if (pending) return;
    setPending(true);
    try {
      await send(command, params);
      showToast(command === "chooseWorldStory" ? "Deine Entscheidung ist Teil der Geschichte." : command === "bidWorldTender" ? "Gebot gespeichert. Du kannst es bis zum Zuschlag ändern." : command === "withdrawWorldBid" ? "Gebot zurückgezogen." : command === "cancelWorldAppointment" ? "Termin abgesagt. Die Geschichte berücksichtigt deine Absage." : "Willkommen am Kai.", "success");
    } catch (error) { showToast(error.message, "error"); }
    finally { setPending(false); }
  }
  if (!state) return null;
  return <main className="px-4 sm:px-6 lg:px-12 py-6 lg:py-8 max-w-[1600px] mx-auto space-y-6 pb-12">
    <header className="relative overflow-hidden rounded-3xl border border-sky-300/20 bg-gradient-to-br from-slate-800 via-slate-900 to-ink p-6 sm:p-9">
      <div className="absolute right-4 top-4 opacity-[0.06] pointer-events-none" aria-hidden="true"><Anchor className="w-52 h-52" /></div>
      <div className="relative max-w-3xl space-y-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"><Compass className="w-4 h-4" /> Die Spielwelt · FRACHTFIEBER</p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Zwischen Hafen<br className="sm:hidden" /> und Zuhause.</h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">Drei Firmen wollen dieselben Kunden. Zu Hause wartet jemand auf dein Wort. Und am alten Kai erinnert man sich daran, wer geblieben ist.</p>
        {w?.active && <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-sky-300/10 text-sky-200 px-3 py-1.5">{w.identity || "Deine Geschichte hat begonnen"}</span>
          <span className="rounded-full bg-white/5 text-slate-300 px-3 py-1.5">Seit {when(w.startedAtMin)}</span>
        </div>}
      </div>
    </header>
    {blocked && <p role="status" className="rounded-xl border border-coral/30 bg-coral/5 p-4 text-sm">Du nimmst gerade an einem Termin teil. Neue Entscheidungen und Gebote sind danach wieder möglich.</p>}
    {tab === "stories" && <NordSprintChallengePanel key={"nordsprint_" + state.meta?.partyId} showCompleted />}
    {tab === "stories" && <HarborOpeningPanel key={"harbor_" + state.meta?.partyId} showCompleted />}
    {!w?.active ? <section className={card + " p-6 sm:p-8 space-y-6"}>
      <div className="grid sm:grid-cols-3 gap-6">
        {[{ Icon: Truck, title: "Echte Konkurrenz", text: "Gebote, begrenzte Reserven und gewonnene Transporte, die du selbst disponierst." }, { Icon: BookOpen, title: "Zusammenhängende Geschichten", text: "Zwei zusammenhängende Staffeln, persönliche Geschichten und eine Fortsetzung für dein Team." }, { Icon: Heart, title: "Eine Welt mit Gedächtnis", text: "Die Weltchronik verbindet deine Entscheidungen mit dem, was daraus entsteht." }].map(({ Icon, title, text }) => <div key={title} className="space-y-2"><Icon className="w-6 h-6 text-sky-200" /><h2 className="font-medium">{title}</h2><p className="text-sm text-muted-foreground leading-relaxed">{text}</p></div>)}
      </div>
      <p className="text-sm text-muted-foreground">Der Einstieg ist kostenlos. Geschichten und Ausschreibungen beginnen ab deiner jetzigen Spielzeit. Geschichten warten auf dich; Gebotsfristen laufen mit der Spielzeit weiter.</p>
      {state.scenario?.status === "active" && <p className="text-sm text-sky-200">Die Spielwelt beginnt nach dem Szenario, sobald du im freien Spiel weitermachst.</p>}
      <button disabled={disabled || state.scenario?.status === "active"} className={button + " bg-sky-300/10 text-sky-100 inline-flex items-center gap-2"} onClick={() => act("startWorld")}>{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Spielwelt betreten</button>
    </section> : <>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[["Verlässlichkeit", w.reputation.trust, "/ 100"], ["Qualitätsvorsprung", w.reputation.quality, "/ 20"], ["Verhandlungsvorsprung", w.reputation.price, "/ 20"]].map(([label, value, max]) => <div key={label} className={card + " p-3 sm:p-5"}><p className="text-[10px] sm:text-xs text-muted-foreground break-words">{label}</p><p className="mt-2 text-xl sm:text-3xl font-semibold tabular-nums">{value} <span className="text-xs text-muted-foreground font-normal">{max}</span></p></div>)}
      </div>
      <nav aria-label="Bereiche der Spielwelt" className="flex gap-2 overflow-x-auto pb-1">
        {[{ id: "stories", label: "Geschichten", Icon: BookOpen }, { id: "competition", label: "Wettbewerb", Icon: Flag }, { id: "chronicle", label: "Weltchronik", Icon: Clock }].map(({ id, label, Icon }) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={button + " shrink-0 inline-flex items-center gap-2 " + (tab === id ? "bg-sky-300/10 text-sky-200 border-sky-300/30" : "text-muted-foreground")}><Icon className="w-4 h-4" />{label}{id === "stories" && Object.values(w.stories).filter(r => r.status === "decision").length > 0 && <span className="rounded-full bg-sky-200/15 px-1.5 text-xs">{Object.values(w.stories).filter(r => r.status === "decision").length}</span>}</button>)}
      </nav>
      {tab === "stories" && <div className="grid xl:grid-cols-3 gap-5">
        {WORLD_STORIES.map(def => {
          const run = w.stories[def.id];
          if (!run || (def.id === "harbor" && (harborOpeningActive(state) || nordSprintActive(state)))) return null;
          const scene = worldScene(state, run);
          const ap = state.appointments.find(a => a.id === run.appointmentId);
          return <article key={def.id} className={card + " p-5 sm:p-6 space-y-5 " + ((def.id === "harbor" || def.id === "built_together") ? "xl:col-span-3 border-sky-300/20" : "")}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-sky-200 mb-2">{def.kind}</p><h2 className="text-xl font-semibold">{def.title}</h2><p className="text-sm text-muted-foreground mt-1">{def.subtitle}</p></div><span className="shrink-0 text-xs text-muted-foreground">{run.id === "everyday" ? "Begegnung " + (run.episode || "–") : Math.min(run.stage, def.chapters) + " / " + def.chapters}</span></div>
            <div className="flex gap-1.5" aria-label={run.stage + " von " + def.chapters + " Kapiteln abgeschlossen"}>{Array.from({ length: def.chapters }, (_, i) => <div key={i} className={"h-1 flex-1 rounded-full " + (i < run.stage ? "bg-sky-300" : i === run.stage && run.status !== "locked" ? "bg-sky-300/40" : "bg-white/10")} />)}</div>
            {run.status === "locked" ? <p className="text-sm text-muted-foreground">{run.id === "everyday" ? (run.availableAtMin == null ? "Beginnt nach „Was wir aufgebaut haben“. Danach entstehen mit Abstand weitere Begegnungen." : "Nächste Gelegenheit ab " + when(run.availableAtMin) + ". Größere Geschichten haben Vorrang.") : run.id === "headwind" && run.availableAtMin == null ? "Beginnt 21 Spieltage nach dem Abschluss von „Was wir aufgebaut haben“, sobald alle drei Konkurrenten zur Spielwelt gehören." : run.id === "own_dreams" && run.availableAtMin == null ? "Beginnt 14 Spieltage nach dem Abschluss von „Was wir aufgebaut haben“ und „Das Licht in der Küche“, sofern eure Beziehung fortbesteht." : run.id === "people_behind_tours" && run.availableAtMin == null ? "Beginnt sieben Spieltage nach dem Abschluss von „Was wir aufgebaut haben“ und „Dein erster Fahrer“, sofern diese Person noch im Betrieb arbeitet." : run.id === "built_together" && run.availableAtMin == null ? "Beginnt sieben Spieltage nach dem Abschluss der Hauptgeschichte. Dein bisheriger Weg bestimmt die Fortsetzung." : run.availableAtMin > state.gameTime ? "Beginnt ab " + when(run.availableAtMin) + "." : run.id === "driver" ? "Beginnt, sobald ein fest angestellter Fahrer zu deinem Team gehört." : "Beginnt, sobald du in einer Beziehung bist."}</p>
            : run.status === "done" ? <p className="text-sm text-sky-100 flex items-start gap-2"><Check className="w-4 h-4 shrink-0 mt-0.5" />{run.ending}{run.id === "everyday" && run.nextEncounterMin != null && <span className="block text-xs text-muted-foreground">Nächste Gelegenheit ab {when(run.nextEncounterMin)}.</span>}</p>
            : <><div className="space-y-2"><h3 className="text-lg font-medium">{scene.title}</h3><p className="text-sm leading-relaxed text-slate-300 max-w-4xl">{scene.text}</p></div>
              {run.status === "decision" ? <div className={"grid gap-3 " + ((def.id === "harbor" || def.id === "built_together") ? "lg:grid-cols-3" : "")}>{scene.choices.map(choice => {
                const reason = worldChoiceReason(state, run, choice);
                const slot = choice.appointment ? worldAppointmentSlot(state) : null;
                return <div key={choice.id} className="rounded-xl border border-white/10 p-4 flex flex-col gap-3 bg-black/10">
                  <h4 className="text-sm font-medium">{choice.label}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{choice.detail}</p>
                  {slot && <p className="text-xs text-sky-200">Kalender: {when(slot.startMin)}–20:00 · Kosten bei Zusage</p>}
                  {reason && <p className="text-xs text-coral">{reason}</p>}
                  <button disabled={disabled || !!reason} className={button + " text-left text-sky-100"} onClick={() => act("chooseWorldStory", { storyId: run.id, stage: run.stage, choiceId: choice.id, ...(run.id === "everyday" ? { episode: run.episode } : {}) })}>So entscheide ich <ArrowRight className="w-3 h-3 inline ml-1" /></button>
                </div>;
              })}</div> : <div className="rounded-xl bg-sky-300/5 border border-sky-300/10 p-4 space-y-2"><p className="text-sm text-sky-100 flex items-center gap-2"><Clock className="w-4 h-4" />{run.status === "appointment" && ap ? "Im Kalender: " + when(ap.startMin) + "–20:00" : "Die Geschichte geht weiter ab " + when(run.dueMin)}</p><p className="text-xs text-muted-foreground">Deine Wahl: {run.pending?.cause?.choice}. Die Spielzeit muss bis dahin fortschreiten.</p>{run.status === "appointment" && <div className="flex flex-wrap gap-4"><Link to="/zuhause" className="text-xs text-sky-200 underline underline-offset-4">Zum Privatleben</Link><button disabled={disabled || ap?.status !== "accepted"} className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-40" onClick={() => act("cancelWorldAppointment", { storyId: run.id, stage: run.stage })}>Termin absagen · Kosten werden nicht erstattet</button></div>}</div>}
            </>}
          </article>;
        })}
      </div>}
      {tab === "competition" && <div className="space-y-6">
        <CompetitionPanel />
        <section className={card + " p-5 space-y-3"}><h2 className="text-lg font-semibold">Ausschreibungen am Kai</h2><p className="text-sm text-muted-foreground leading-relaxed">Alle drei Spieltage erscheinen zwei Transporte. Ein Gebot ist kostenlos und bis zum Zuschlag änderbar. <strong className="text-foreground">Bei Gewinn wird der Auftrag verbindlich angenommen.</strong> Plane Fahrzeug, Fahrer und Anfahrt selbst; normale Storno- und Verspätungsregeln gelten. Der Erlös entsteht erst durch die Lieferung.</p><p className="text-xs text-sky-200">Nächste Runde: {when(w.nextTenderMin)}</p>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">Wie wird entschieden?</summary><p className="pt-2 leading-relaxed">Punkte = (130 − Preis in % des Richtpreises) × 0,65 + Verlässlichkeit × 0,35 + (Qualitätsvorsprung + Verhandlungsvorsprung) × 0,6. Die höchste Punktzahl gewinnt; bei Gleichstand zuerst der niedrigere Preis, danach eine feste Anbieterreihenfolge. Konkurrenten brauchen freie Lkw und genügend Reserve. Deine Spielwelt-Zusagen sind auf die Anzahl eigener geeigneter Lkw und fester Fahrer begrenzt; bereits geplante normale Touren musst du selbst berücksichtigen. Zuschläge und Lieferungen verändern eure Möglichkeiten für spätere Runden.</p></details>
        </section>
        <div className="grid lg:grid-cols-2 gap-4">{[...w.tenders].reverse().slice(0, 12).map(t => <article key={t.id} className={card + " p-5 space-y-4"}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{t.customer}</p><h3 className="font-semibold mt-1">{t.title}</h3></div><span className={"text-xs rounded-full px-2.5 py-1 " + (t.status === "open" ? "bg-lime/10 text-lime" : "bg-white/5 text-muted-foreground")}>{t.status === "open" ? "Gebote offen" : t.winnerId === "player" ? "Dein Zuschlag" : "Vergeben"}</span></div>
          <p className="text-sm">{t.fromCity} <ArrowRight className="inline w-3 h-3 mx-1" /> {t.toCity} <span className="text-muted-foreground">· {t.tons} t Stückgut</span></p>
          <div className="text-xs text-muted-foreground space-y-1"><p>Zuschlag: {when(t.closeMin)}</p><p>Lieferung bis: {when(t.deliveryDeadlineMin)}</p><p>Richtpreis: {money(t.baseCents)}</p></div>
          {t.status === "open" ? <><div className="grid sm:grid-cols-3 gap-2">{WORLD_BIDS.map(b => <button key={b.id} disabled={disabled || !!worldBidReason(state, t)} aria-pressed={t.bid?.id === b.id} onClick={() => act("bidWorldTender", { tenderId: t.id, bidId: b.id })} className={button + " p-3 text-left " + (t.bid?.id === b.id ? "bg-lime/10 border-lime/30" : "")}><span className="block text-xs">{b.label}</span><strong className="block mt-2">{money(Math.round(t.baseCents * b.percent / 100))}</strong><span className="text-[10px] text-muted-foreground">{b.percent} % Richtpreis {t.bid?.id === b.id ? "· dein Gebot" : ""}</span></button>)}</div>
            {worldBidReason(state, t) && <p className="text-xs text-coral">{worldBidReason(state, t)}</p>}
            {t.bid && <button disabled={disabled} onClick={() => act("withdrawWorldBid", { tenderId: t.id })} className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-40">Gebot zurückziehen</button>}
          </> : <><p className="text-sm text-sky-200">{t.winnerId === "player" ? (t.outcome ? outcomeLabels[t.outcome] : "Angenommen – jetzt disponieren") : w.rivals.find(r => r.id === t.winnerId)?.name || "Ohne Zuschlag"}</p>
            {t.winnerId === "player" && !t.outcome && <Link to="/disposition" className={button + " inline-flex gap-2 items-center text-lime"}>Zur Disposition <ArrowRight className="w-4 h-4" /></Link>}
            <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Wertung ansehen</summary><ol className="mt-3 space-y-2">{t.results?.map(r => <li key={r.id} className="flex justify-between gap-3"><span>{r.id === "player" ? state.company.name : w.rivals.find(c => c.id === r.id)?.name}</span><span className="shrink-0 tabular-nums">{r.score.toLocaleString("de-DE")} P. · {money(r.paymentCents)}</span></li>)}</ol>{t.bid && !t.results?.some(r => r.id === "player") && <p className="mt-2">Dein Gebot konnte mangels eigener Kapazität nicht berücksichtigt werden.</p>}</details>
          </>}
        </article>)}</div>
      </div>}
      {tab === "chronicle" && <section className={card + " p-5 sm:p-7"}>
        <div className="flex items-center gap-3 mb-6"><BookOpen className="w-5 h-5 text-sky-200" /><div><h2 className="text-xl font-semibold">Was bleibt.</h2><p className="text-sm text-muted-foreground">Die letzten 180 Einträge. Entscheidungen der Geschichten bleiben zusätzlich dauerhaft erhalten.</p></div></div>
        <ol className="space-y-0">{[...w.chronicle].reverse().map(e => <li key={e.id} className="relative border-l border-white/10 ml-1 pl-6 pb-7 last:pb-0"><span aria-hidden="true" className={"absolute -left-1 top-1.5 w-2 h-2 rounded-full " + (e.kind === "consequence" ? "bg-lime" : e.kind === "decision" ? "bg-sky-300" : "bg-slate-500")} /><p className="text-xs text-muted-foreground">{when(e.atMin)}</p><h3 className="text-sm font-medium mt-1">{e.title}</h3><p className="text-sm text-slate-300 leading-relaxed mt-2 max-w-4xl">{e.text}</p>{e.cause && <p className="text-xs text-sky-200 mt-2">Geht zurück auf: {e.cause.title} · „{e.cause.choice}“</p>}</li>)}</ol>
      </section>}
    </>}
  </main>;
}