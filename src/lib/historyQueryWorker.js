import { runSaveFileTask } from './saveFileTasks';
import { createHistoryReadCache } from './historyReadCache';
const readRecords = createHistoryReadCache();
let queue = Promise.resolve();
self.onmessage = ({ data: { id, command, input } }) => {
  queue = queue.then(async () => {
    try {
      if (!['historyPage', 'journalPage'].includes(command)) throw Error('Unzulässige Historienabfrage.');
      const result = await runSaveFileTask(command, input, readRecords);
      self.postMessage({ id, result });
    } catch (error) { self.postMessage({ id, error: error.message || 'Historienabfrage fehlgeschlagen.' }); }
  });
  return queue;
};
