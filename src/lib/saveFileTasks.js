import { readHistoryBlock } from "./historyRepository";
import { exportSave, importSave } from "./persistence";
import { MAX_SAVE_BYTES, prepareLoadedState } from "./saveSafety";
import { compactHistory, portableHistory, restoreHistory, readLimited, readArchiveRecords } from "./historyArchive";

export async function runSaveFileTask(command, input) {
  if (command === "historyPage") {
    const { state, userId, kind = "", search = "", cursor = null } = input;
    const chunks = state?.historyArchive?.chunks || [];
    const rows = [];
    let i = cursor?.chunk ?? chunks.length - 1, offset = cursor?.offset ?? 0;
    const needle = search.toLocaleLowerCase("de-DE");
    for (; i >= 0; i--, offset = 0) {
      const chunk = chunks[i];
      if (kind && chunk.kind !== kind) continue;
      const data = await readHistoryBlock(userId, chunk);
      const records = await readArchiveRecords(chunk, data);
      for (; offset < records.length; offset++) {
        const record = records[records.length - 1 - offset];
        if (needle && !JSON.stringify(record).toLocaleLowerCase("de-DE").includes(needle)) continue;
        rows.push({ kind: chunk.kind, record });
        if (rows.length === 50) return { rows, cursor: { chunk: i, offset: offset + 1 } };
      }
    }
    return { rows, cursor: null };
  }
  if (command === "prepare") return compactHistory(await restoreHistory(prepareLoadedState(input), { allowReferences: true }));
  if (command === "archive") {
    const parts = ['{"version":1,"chunks":['];
    let first = true;
    for (const chunk of input?.historyArchive?.chunks || []) {
      const raw = await readLimited(chunk.data.stream().pipeThrough(new DecompressionStream("gzip")), chunk.rawBytes);
      parts.push((first ? "" : ",") + '{"kind":' + JSON.stringify(chunk.kind) + ',"records":', raw, '}');
      first = false;
    }
    parts.push(']}');
    return new Blob(parts, { type: "application/json" });
  }
  if (command === "export") {
    const portable = await portableHistory(input);
    const raw = new Blob([exportSave(portable)], { type: "application/json" });
    if (raw.size > MAX_SAVE_BYTES) throw Error("Die Sicherung überschreitet die Importgrenze von 256 MB.");
    if (typeof CompressionStream === "undefined") return raw;
    const compressed = await readLimited(raw.stream().pipeThrough(new CompressionStream("gzip")));
    return new Blob([compressed], { type: "application/gzip" });
  }
  if (command !== "import") throw Error("Unbekannter Dateivorgang.");
  let text;
  if (typeof input === "string") text = input;
  else {
    if (!(input instanceof Blob) || input.size > MAX_SAVE_BYTES) throw Error("Die Spielstand-Datei ist zu groß (maximal 256 MB).");
    const header = new Uint8Array(await input.slice(0, 2).arrayBuffer());
    const gzip = header[0] === 0x1f && header[1] === 0x8b;
    const raw = gzip ? await readLimited(input.stream().pipeThrough(new DecompressionStream("gzip")), MAX_SAVE_BYTES) : input;
    text = await raw.text();
  }
  return compactHistory(await restoreHistory(importSave(text)));
}
