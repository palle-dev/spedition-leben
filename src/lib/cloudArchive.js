// Transport references never become persistent references: resolve before CAS.
export function archiveIdentity(c) {
  return JSON.stringify(Object.keys(c).filter(k => k !== "data" && k !== "storedBytes")
    .sort().map(k => [k, c[k]]));
}
