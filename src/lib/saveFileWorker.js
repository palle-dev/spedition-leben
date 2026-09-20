import { runSaveFileTask } from "./saveFileTasks";
self.onmessage = async ({ data: { command, input } }) => {
  try { self.postMessage({ result: await runSaveFileTask(command, input) }); }
  catch (error) { self.postMessage({ error: error.message || "Spielstand konnte nicht verarbeitet werden." }); }
};
