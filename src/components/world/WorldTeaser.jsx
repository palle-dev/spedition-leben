import React from "react";
import { Link } from "react-router-dom";
import { Anchor, ArrowRight } from "lucide-react";

export default function WorldTeaser({ state }) {
  const w = state?.world;
  const decisions = w?.active ? Object.values(w.stories).filter(r => r.status === "decision").length : 0;
  const tenders = w?.active ? w.tenders.filter(t => t.status === "open").length : 0;
  return <Link to="/spielwelt" className="group flex items-center gap-4 rounded-2xl border border-sky-300/20 bg-sky-300/[0.04] p-4 sm:p-5 transition hover:bg-sky-300/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200">
    <span className="rounded-xl bg-sky-300/10 p-3 text-sky-200"><Anchor className="w-5 h-5" /></span>
    <div className="flex-1 min-w-0"><p className="font-medium text-sm sm:text-base">Zwischen Hafen und Zuhause</p><p className="text-xs sm:text-sm text-muted-foreground mt-1">{w?.active ? decisions + " offene Entscheidungen · " + tenders + " Ausschreibungen · " + (w.identity || "Deine Spielwelt lebt weiter") : "Neu: drei Konkurrenten, zusammenhängende Geschichten und Entscheidungen mit Folgen."}</p></div>
    <ArrowRight className="w-4 h-4 shrink-0 text-sky-200 transition group-hover:translate-x-1" />
  </Link>;
}
