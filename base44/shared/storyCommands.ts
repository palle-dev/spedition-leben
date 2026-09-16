// Command-Handler für Geschichten und Chronik.
// Leitet Befehle an die storyEngine weiter.

import {
  getStories, getChronicle, getPromises,
  makeStoryDecision,
} from "./storyEngine.ts";

export function handleStoryCommand(state, command, p) {
  switch (command) {
    case "getStories":
      return { ok: true, stories: getStories(state) };

    case "getChronicle":
      return { ok: true, chronicle: getChronicle(state) };

    case "getPromises":
      return { ok: true, promises: getPromises(state) };

    case "makeStoryDecision":
      return makeStoryDecision(state, {
        storyRunId: p.storyRunId,
        choiceId: p.choiceId,
        params: p.params || {},
      });

    default:
      return null;
  }
}