// Read-only projection: existing pending requests become calls without save migration.
export function getBranchDecisionCalls(state) {
 const pending=(state.branchDecisions||[]).filter(d=>d.status==="pending");
 if(!pending.length)return [];
 const branches=new Map((state.branches||[]).map(b=>[b.id,b]));
 const managers=new Map((state.employees||[]).map(e=>[e.id,e]));
 return pending.map(d=>{
  const branch:any=branches.get(d.branchId), manager:any=managers.get(d.managerId);
  return {key:"branch_"+d.id,id:d.id,type:"branch_decision",title:d.title||"Bitte um Freigabe",
   source:manager?.name||"Filialleitung",portraitId:manager?.portraitId||manager?.portrait_id,
   location:branch ? branch.name+" · "+branch.city : "Filiale",
   description:d.description||"Bitte entscheide über diese Maßnahme.",createdAt:d.createdAt,deadline:null};
 });
}
export function getBranchPhoneProposal(state, id) {
 const d=(state.branchDecisions||[]).find(d=>d.id===id&&d.status==="pending");
 if(!d)return null;
 return {id:"branch:"+d.id,label:d.title||"Bitte um Freigabe",description:d.description||"",
  costCents:d.costCents||0,benefitDesc:d.benefitDesc||"",
  command:"approveBranchDecision",params:{decisionId:d.id},
  rejectCommand:"rejectBranchDecision",rejectParams:{decisionId:d.id},
  approvalUnavailable:(d.costCents||0)>(state.company?.accountCents||0) ? "Für die Freigabe fehlen aktuell Geldmittel. Du kannst ablehnen oder später zurückrufen." : null};
}
