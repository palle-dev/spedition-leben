import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { getCareerPaths } from "@/lib/careerPathData";
import Portrait from "@/components/ui/Portrait";
import { Headset, Building2, CheckCircle, Clock, GraduationCap, Euro, ArrowRight, Search, Play, X, AlertCircle, Check } from "lucide-react";

// Karrierepfad-Tab: zeigt welche Kurse Mitarbeiter noch benötigen,
// um die nächste Karrierestufe als Disponent oder Filialleiter zu erreichen.
// Mit Filter (Name/Status) und direkter Kursbuchung aus der Liste.
export default function CareerPathTab() {
  const { state } = useGame();
  const paths = useMemo(() => getCareerPaths(state), [state]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | open | complete

  const searchLower = search.toLowerCase();

  function filterList(list) {
    let result = list;
    if (searchLower) {
      result = result.filter(p => p.employee.name.toLowerCase().includes(searchLower));
    }
    if (statusFilter === "open") result = result.filter(p => !p.complete);
    else if (statusFilter === "complete") result = result.filter(p => p.complete);
    return result;
  }

  const dispatcherFiltered = filterList(paths.dispatcherPaths);
  const branchManagerFiltered = filterList(paths.branchManagerPaths);

  return (
    <div className="space-y-5">
      {/* Filter-Leiste */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Mitarbeiter suchen…"
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground focus:border-lime/50 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {[
            { key: "all", label: "Alle" },
            { key: "open", label: "Offen" },
            { key: "complete", label: "Fertig" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-medium transition border ${
                statusFilter === f.key ? "bg-lime/10 border-lime/30 text-lime" : "bg-surface-2/60 border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Disponent-Karrierepfad */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Headset className="w-4 h-4 text-sky-300" />
          <h3 className="text-sm font-medium">Disponent-Karrierepfad</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {paths.dispatcherComplete}/{paths.dispatcherTotal} vollständig qualifiziert
          </span>
        </div>
        {dispatcherFiltered.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {paths.dispatcherPaths.length === 0 ? "Keine Disponenten beschäftigt." : "Keine Treffer für den Filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {dispatcherFiltered.map(p => <CareerCard key={p.employee.id} path={p} />)}
          </div>
        )}
      </div>

      {/* Filialleiter-Karrierepfad */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-coral" />
          <h3 className="text-sm font-medium">Filialleiter-Karrierepfad</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {paths.branchManagerComplete}/{paths.branchManagerTotal} vollständig qualifiziert
          </span>
        </div>
        {branchManagerFiltered.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {paths.branchManagerPaths.length === 0 ? "Keine Filialleiter beschäftigt." : "Keine Treffer für den Filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {branchManagerFiltered.map(p => <CareerCard key={p.employee.id} path={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CareerCard({ path }) {
  const { employee, courses, remaining, complete } = path;

  return (
    <div className={`glass border rounded-xl p-3 ${complete ? "border-lime/20" : "border-white/10"}`}>
      <div className="flex items-center gap-3 mb-3">
        <Portrait portraitId={employee.portraitId} name={employee.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{employee.name}</div>
          <div className="text-[10px] text-muted-foreground">{roleLabel(employee.role)}</div>
        </div>
        <div className={`text-[10px] flex items-center gap-1 shrink-0 ${complete ? "text-lime" : "text-amber-300"}`}>
          {complete ? <><CheckCircle className="w-3 h-3" /> Vollständig</> : <><Clock className="w-3 h-3" /> {remaining} offen</>}
        </div>
      </div>

      <div className="space-y-1.5">
        {courses.map(c => <CourseRow key={c.courseId} course={c} personId={employee.id} />)}
      </div>
    </div>
  );
}

function CourseRow({ course, personId }) {
  const { send, showToast } = useGame();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [confirmPromotion, setConfirmPromotion] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const r = await send("previewCourseBooking", { personId, courseId: course.courseId });
      setPreview(r);
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleBook() {
    setBooking(true);
    try {
      const r = await send("bookCourse", { personId, courseId: course.courseId, confirmPromotion });
      showToast(`Kurs gebucht: ${formatGameTime(r.startMin)}`, "success");
      setPreview(null);
      setConfirmPromotion(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBooking(false);
    }
  }

  // Abgeschlossener Kurs — nur Status anzeigen
  if (course.has) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border text-xs border-lime/15 bg-lime/5">
        <div className="w-5 h-5 rounded-full grid place-items-center shrink-0 bg-lime/20 text-lime">
          <CheckCircle className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-1.5">
            {course.label}
            {course.isPromotion && (
              <span className="flex items-center gap-0.5 text-[9px] text-lime bg-lime/10 px-1 py-0.5 rounded">
                <ArrowRight className="w-2.5 h-2.5" /> Beförderung
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{course.effectDesc}</div>
        </div>
      </div>
    );
  }

  // Offener Kurs — mit Buchungs-Funktion
  return (
    <div className="rounded-lg border text-xs border-white/10 bg-surface-2/30 overflow-hidden">
      <div className="flex items-center gap-2 p-2">
        <div className="w-5 h-5 rounded-full grid place-items-center shrink-0 bg-white/5 text-muted-foreground">
          <GraduationCap className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-1.5">
            {course.label}
            {course.isPromotion && (
              <span className="flex items-center gap-0.5 text-[9px] text-lime bg-lime/10 px-1 py-0.5 rounded">
                <ArrowRight className="w-2.5 h-2.5" /> Beförderung
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{course.effectDesc}</div>
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />{formatEuro(course.feeCents)}</span>
          <span>{course.hours} Std</span>
        </div>
        {!preview && (
          <button
            onClick={loadPreview}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-lime/10 border border-lime/30 text-lime hover:border-lime/50 disabled:opacity-40 transition shrink-0"
          >
            {loading ? <span className="w-3 h-3 border-2 border-lime/30 border-t-lime rounded-full animate-spin" /> : <Play className="w-2.5 h-2.5" />}
            Buchen
          </button>
        )}
      </div>

      {/* Buchungs-Vorschau (inline ausgeklappt) */}
      {preview && !preview.ok && (
        <div className="px-2 pb-2">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-400/20 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-300 shrink-0 mt-0.5" />
            <div className="text-[10px] text-red-300">{preview.reason}</div>
          </div>
          <button onClick={() => setPreview(null)} className="mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition">
            Schließen
          </button>
        </div>
      )}

      {preview && preview.ok && (
        <div className="px-2 pb-2 space-y-2">
          <div className="p-2 rounded-lg bg-surface-2/50 border border-white/5 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Termin</span>
              <span className="font-medium">{formatGameTime(preview.startMin)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Ende</span>
              <span className="font-medium">{formatGameTime(preview.endMin)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Kursgebühr</span>
              <span className="font-medium tabular-nums">{formatEuro(preview.feeCents)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-muted-foreground">Lohn während Kurs</span>
              <span className="font-medium tabular-nums">{formatEuro(preview.wageDuringCourse)}</span>
            </div>
          </div>

          {preview.conflicts?.length > 0 && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-400/20">
              <div className="text-[9px] uppercase tracking-[0.14em] text-amber-300 mb-1">Konflikte</div>
              {preview.conflicts.map((c, i) => (
                <div key={i} className="text-[10px] text-muted-foreground">{c.label}</div>
              ))}
            </div>
          )}

          {preview.promotion && (
            <div className="p-2 rounded-lg bg-lime/10 border border-lime/20">
              <div className="text-[9px] uppercase tracking-[0.14em] text-lime mb-1">Beförderung bei Abschluss</div>
              <div className="text-[10px] text-foreground/80">Neuer Lohn: {formatEuro(preview.promotion.newWageCents)}/Tag</div>
              <label className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                <input type="checkbox" checked={confirmPromotion} onChange={e => setConfirmPromotion(e.target.checked)} className="accent-lime" />
                Beförderung bestätigen
              </label>
            </div>
          )}

          <div className="flex gap-1.5">
            <button onClick={() => { setPreview(null); setConfirmPromotion(false); }} className="px-2 py-1.5 rounded-md border border-white/10 text-[10px] text-muted-foreground hover:text-foreground transition">
              Abbrechen
            </button>
            <button
              onClick={handleBook}
              disabled={booking || (preview.promotion && !confirmPromotion)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-lime text-ink rounded-md py-1.5 font-semibold text-[11px] hover:brightness-110 disabled:opacity-40 transition"
            >
              {booking ? <span className="w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-3 h-3" /> Buchen</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}