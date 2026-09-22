// Shared stats extraction for admin dashboard and cloud sync.
// Used by:
// - cloudSync: stores stats in entity fields during save (instant for new saves)
// - adminDashboard: refreshStats command for background workflow
export function extractStats(state: any) {
  if (!state || typeof state !== "object") return null;
  return {
    gameTime: state.gameTime || 0,
    companyName: state.company?.name || null,
    companyAccountCents: state.company?.accountCents ?? 0,
    privateAccountCents: state.private?.accountCents ?? 0,
    vehicles: (state.vehicles || []).filter((v: any) => v.status !== "sold" && v.status !== "archived").length,
    branches: (state.branches || []).filter((b: any) => b.status === "active").length,
    employees: (state.employees || []).filter((e: any) => e.employmentStatus === "employed").length,
    drivers: (state.drivers || []).filter((d: any) => d.employmentStatus === "employed").length,
  };
}