// Karrierepfad-Daten: zeigt, welche Kurse Mitarbeiter noch benötigen,
// um die nächste Karrierestufe als Disponent oder Filialleiter zu erreichen.

import { COURSE_CATALOG, getCourseById } from "./trainingData";

// Disponent-Karrierepfad: Kurse für Disponenten
const DISPATCHER_COURSE_IDS = ["dispo_advanced", "dispo_dg", "dispo_efficiency"];

// Filialleiter-Karrierepfad: Kurs für Filialleiter
const BRANCH_MANAGER_COURSE_IDS = ["branch_manager_advanced"];

function buildPathForEmployee(emp, quals, courseIds) {
  const empQuals = quals.filter(q => q.personId === emp.id && q.status === "active");
  const activeTypes = new Set(empQuals.map(q => q.type));
  const courses = courseIds.map(cid => {
    const course = getCourseById(cid);
    if (!course) return null;
    return {
      courseId: cid,
      label: course.label,
      effectDesc: course.effectDesc,
      effect: course.effect,
      has: activeTypes.has(course.effect),
      isPromotion: !!course.isPromotion,
      feeCents: course.feeCents,
      hours: course.hours,
    };
  }).filter(Boolean);
  const remaining = courses.filter(c => !c.has).length;
  return { employee: emp, courses, remaining, complete: remaining === 0 };
}

export function getCareerPaths(state) {
  const quals = (state.training?.qualifications) || [];
  const employees = (state.employees || []).filter(e => e.employmentStatus === "employed");

  const dispatchers = employees.filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior");
  const branchManagers = employees.filter(e => e.role === "branch_manager");

  const dispatcherPaths = dispatchers
    .map(emp => buildPathForEmployee(emp, quals, DISPATCHER_COURSE_IDS))
    .sort((a, b) => a.remaining - b.remaining);

  const branchManagerPaths = branchManagers
    .map(emp => buildPathForEmployee(emp, quals, BRANCH_MANAGER_COURSE_IDS))
    .sort((a, b) => a.remaining - b.remaining);

  return {
    dispatcherPaths,
    branchManagerPaths,
    dispatcherTotal: dispatchers.length,
    dispatcherComplete: dispatcherPaths.filter(p => p.complete).length,
    branchManagerTotal: branchManagers.length,
    branchManagerComplete: branchManagerPaths.filter(p => p.complete).length,
  };
}