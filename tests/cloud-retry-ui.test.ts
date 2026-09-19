// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi,afterEach} from 'vitest';
const fixture=vi.hoisted(()=>({game:{} as any}));
vi.mock('@/lib/gameContext',()=>({useGame:()=>fixture.game}));
import CloudSyncSection from '@/components/game/CloudSyncSection';
let root,container;
afterEach(async()=>{if(root)await act(async()=>root.unmount());container?.remove();});
it('zeigt Fehlergrund, letzte Sicherung und führt eine echte Wiederholung aus',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 fixture.game={syncMeta:{status:'error',lastError:'Zeitüberschreitung',lastCloudSyncAt:1800000000000},cloudSaves:[],cloudLoading:false,retryCloudSync:vi.fn(async()=>({ok:true})),refreshCloudSaves:vi.fn()};
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>root.render(React.createElement(CloudSyncSection)));
 expect(container.textContent).toContain('Zeitüberschreitung');expect(container.textContent).toContain('Letzte erfolgreiche Cloud-Sicherung');
 const button=Array.from(container.querySelectorAll('button')).find((b:any)=>b.textContent.includes('erneut versuchen')) as HTMLButtonElement;
 await act(async()=>button.click());expect(fixture.game.retryCloudSync).toHaveBeenCalledTimes(1);expect(fixture.game.refreshCloudSaves).not.toHaveBeenCalled();
});
