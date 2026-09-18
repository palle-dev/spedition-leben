import { getEscalatedDeliveryRisks } from "@/lib/simulation/deliveryRisk";
import { getPendingDecisions } from "@/lib/decisionQueue";
export function getCommunicationQueue(state) {
 const orders = new Map((state.orders || []).map(o => [o.id,o]));
 const calls=[], emails=[];
 const risks=getEscalatedDeliveryRisks(state);
 const urgentIssueIds=new Set(risks.map(r=>r.disruptionId).filter(Boolean));
 for (const d of state.disruptions?.items || []) {
  if (d.status !== "decision_open") continue;
  const deadlines=(d.orderIds||[]).map(id=>orders.get(id)).filter(o=>o && ["angenommen","unterwegs"].includes(o.status)).map(o=>o.deliveryDeadlineMin).filter(Number.isFinite);
  const deadline=deadlines.length ? Math.min(...deadlines) : null;
  const urgent=urgentIssueIds.has(d.id) || d.type!=="loading_delay";
  // Routine ramp handling belongs to staff, not the decision inbox.
  if(d.type==="loading_delay" && d.delayMin<=120 && !urgent)continue;
  const driver=state.drivers?.find(p=>p.id===d.driverId);
  const entry={key:"disruption_"+d.id,id:d.id,type:"disruption",title:d.type==="loading_delay" ? "Rückfrage an der Laderampe" : d.type==="personnel_absence" ? "Ein Fahrer fällt aus" : "Unser Lkw braucht Hilfe",
   source:driver?.name || "Leitstelle",portraitId:driver?.portraitId || driver?.portrait_id,description:d.cause,deadline,createdAt:d.createdAtMin};
  (urgent?calls:emails).push(entry);
 }
 calls.push(...risks.filter(r=>!r.disruptionId || !calls.some(c=>c.id===r.disruptionId)));
 emails.push(...getPendingDecisions(state));
 calls.sort((a,b)=>(a.deadline??Infinity)-(b.deadline??Infinity)||(a.createdAt||0)-(b.createdAt||0)||a.key.localeCompare(b.key));
 return {calls,emails};
}
export function deadlineLabel(deadline,now) {
 if (deadline===null || deadline===undefined) return "Einsatz wartet auf deine Entscheidung";
 const remaining=Math.floor(deadline-now);
 return remaining<=0 ? "Lieferfrist bereits überschritten" : `Noch ${Math.floor(remaining/60)}h ${remaining%60}min Spielzeit bis zur Lieferfrist`;
}

