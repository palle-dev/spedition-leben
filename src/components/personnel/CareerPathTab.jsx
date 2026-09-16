import React, { useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { getCareerPaths } from "@/lib/careerPathData";
import Portrait from "@/components/ui/Portrait";
import { Headset, Building2, CheckCircle, Clock, GraduationCap, Euro, ArrowRight } from "lucide-react";

// Karrierepfad-Tab: zeigt welche Kurse Mitarbeiter noch benötigen,
// um die nächste Karrierestufe als Disponent oder Filialleiter zu erreichen.
export default function CareerPathTab() {
  const { state } = useGame();
  const paths = useMemo(() => getCareerPaths(state), [state]);

  return (
    <div className="space-y-5">
      {/* Disponent-Karrierepfad */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Headset className="w-4 h-4 text-sky-300" />
          <h3 className="text-sm font-medium">Disponent-Karrierepfad</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {paths.dispatcherComplete}/{paths.dispatcherTotal} vollständig qualifiziert
          </span>
        </div>
        {paths.dispatcherPaths.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Keine Disponenten beschäftigt.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paths.dispatcherPaths.map(p => <CareerCard key={p.employee.id} path={p} />)}
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
        {paths.branchManagerPaths.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-4 text-center">
            <p className="text-sm text-muted-foreground">Keine Filialleiter beschäftigt.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paths.branchManagerPaths.map(p => <CareerCard key={p.employee.id} path={p} />)}
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
        {courses.map(c => (
          <div key={c.courseId} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
            c.has ? "border-lime/15 bg-lime/5" : "border-white/10 bg-surface-2/30"
          }`}>
            <div className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${c.has ? "bg-lime/20 text-lime" : "bg-white/5 text-muted-foreground"}`}>
              {c.has ? <CheckCircle className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate flex items-center gap-1.5">
                {c.label}
                {c.isPromotion && (
                  <span className="flex items-center gap-0.5 text-[9px] text-lime bg-lime/10 px-1 py-0.5 rounded">
                    <ArrowRight className="w-2.5 h-2.5" /> Beförderung
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">{c.effectDesc}</div>
            </div>
            {!c.has && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-0.5"><Euro className="w-2.5 h-2.5" />{formatEuro(c.feeCents)}</span>
                <span>{c.hours} Std</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}