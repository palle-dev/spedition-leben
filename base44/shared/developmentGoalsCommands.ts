// Befehls-Handler für Entwicklungsziele, Mentoring & Zusagen.
// Extrahiert aus simulationEngine.ts um die Dateigröße zu begrenzen.
// Reine Logik – wird von simulationEngine importiert.
// Gibt undefined zurück, wenn der Befehl nicht zu diesem Subsystem gehört.

import { formatGameTime } from "./gameRules.ts";
import {
  createDevelopmentGoal, removeDevelopmentGoal,
  assignMentor, removeMentoring,
  getDevelopmentProfile, getDevelopmentOverview,
  getConversationCooldown, setConversationCooldown,
  createPromise, getOpenPromises,
  getSuggestedCourses, getAvailableMentors,
} from "./developmentGoalsEngine.ts";
import { conductConversation } from "./satisfactionEngine.ts";

export function handleDevelopmentGoalsCommand(state, command, p) {
  switch (command) {
    case "createDevelopmentGoal":
      return createDevelopmentGoal(state, p.personId, {
        targetCourseId: p.targetCourseId,
        targetQualificationType: p.targetQualificationType,
        title: p.title,
        description: p.description,
        targetDeadlineMin: p.targetDeadlineMin,
        type: p.type,
      });

    case "removeDevelopmentGoal":
      return removeDevelopmentGoal(state, p.goalId);

    case "assignMentor":
      return assignMentor(state, { mentorId: p.mentorId, menteeId: p.menteeId, goalId: p.goalId });

    case "removeMentoring":
      return removeMentoring(state, p.assignmentId);

    case "getDevelopmentProfile":
      return { ok: true, profile: getDevelopmentProfile(state, p.personId) };

    case "getDevelopmentOverview":
      return { ok: true, overview: getDevelopmentOverview(state) };

    case "getSuggestedCourses":
      return { ok: true, courses: getSuggestedCourses(state, p.personId) };

    case "getAvailableMentors":
      return { ok: true, mentors: getAvailableMentors(state, p.personId) };

    case "getConversationCooldown":
      return { ok: true, cooldown: getConversationCooldown(state, p.personId, p.occasion) };

    case "conductDevelopmentConversation": {
      const cd = getConversationCooldown(state, p.personId, "development");
      if (cd.active) throw new Error("Entwicklungsgespräch noch in Sperrfrist bis " + formatGameTime(cd.nextMin) + ".");
      const conv = conductConversation(state, p.personId);
      const conversation = state.satisfaction.conversations.find(c => c.id === conv?.conversationId);
      if (conversation) conversation.type = "development";
      const promises = [];
      for (const ag of (p.agreements || [])) {
        const promise = createPromise(state, {
          personId: p.personId,
          occasion: "development_conversation",
          occasionConversationId: conv.conversationId,
          content: ag.content,
          actionType: ag.actionType || "general",
          actionParams: ag.actionParams || {},
          dueMin: ag.dueMin || null,
        });
        promises.push(promise);
      }
      setConversationCooldown(state, p.personId, "development", state.gameTime);
      return { ok: true, conversationId: conv?.conversationId, promises: promises.map(pr => pr.id) };
    }

    case "conductWorkloadConversation": {
      const cd = getConversationCooldown(state, p.personId, "workload");
      if (cd.active) throw new Error("Gespräch über Arbeitsbelastung noch in Sperrfrist bis " + formatGameTime(cd.nextMin) + ".");
      const conv = conductConversation(state, p.personId);
      const conversation = state.satisfaction.conversations.find(c => c.id === conv?.conversationId);
      if (conversation) conversation.type = "workload";
      const promises = [];
      for (const ag of (p.agreements || [])) {
        const promise = createPromise(state, {
          personId: p.personId,
          occasion: "workload_conversation",
          occasionConversationId: conv.conversationId,
          content: ag.content,
          actionType: ag.actionType || "general",
          actionParams: ag.actionParams || {},
          dueMin: ag.dueMin || null,
        });
        promises.push(promise);
      }
      setConversationCooldown(state, p.personId, "workload", state.gameTime);
      return { ok: true, conversationId: conv?.conversationId, promises: promises.map(pr => pr.id) };
    }

    case "getOpenPromises":
      return { ok: true, promises: getOpenPromises(state, p.personId) };

    default:
      return undefined;
  }
}