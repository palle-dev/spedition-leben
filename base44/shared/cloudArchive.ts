// Transport references never become persistent references: resolve before CAS.
export function archiveIdentity(c) {
  return JSON.stringify(Object.keys(c).filter(k => k !== "data" && k !== "storedBytes")
    .sort().map(k => [k, c[k]]));
}
export function resolveCloudArchive(state, previous) {
  if (!state?.historyArchive?.chunks?.length) return state;
  const known = new Map((previous?.historyArchive?.chunks || []).map(c => [c.id, c]));
  const chunks = state.historyArchive.chunks.map(c => {
    if (typeof c.data === "string" && c.data.length) return c;
    const old = known.get(c.id);
    if (c.data != null || !old || typeof old.data !== "string" || !old.data.length ||
        archiveIdentity(old) !== archiveIdentity(c)) {
      throw Error("Ein Cloud-Archivblock fehlt oder stimmt nicht überein. Bitte erneut vollständig synchronisieren.");
    }
    return { ...c, data: old.data };
  });
  const archive = { ...state.historyArchive, chunks };
  delete archive.storage;
  return { ...state, historyArchive: archive };
}
