import { runSaveFileTask } from "./saveFileTasks";
// postMessage already gives this isolated worker its own copy.
self.onmessage = async ({ data: { command, input } }) => {
  try { self.postMessage({ result: await runSaveFileTask(command, input, undefined, { ownedInput: true }) }); }
  catch (error) { self.postMessage({ error: error.message || "Spielstand konnte nicht verarbeitet werden." }); }
};
