import {it,expect,vi,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({execute:vi.fn(),progress:vi.fn()}));
vi.mock('@/lib/simulationAdapter',()=>({executeCommand:mock.execute}));
vi.mock('@/lib/simulation/progressHook',()=>({setProgressHook:mock.progress}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.resetModules();mock.execute.mockReset();mock.progress.mockReset();});
it('meldet reine Rechenzeit neben dem Ergebnis, ohne den Spielstand zu verändern',async()=>{
 const postMessage=vi.fn();const worker:any={postMessage};vi.stubGlobal('self',worker);
 await import('../src/lib/simulationWorker.js');
 const data={state:{gameTime:540},result:{ok:true}};mock.execute.mockResolvedValue(data);
 vi.spyOn(performance,'now').mockReturnValueOnce(100).mockReturnValueOnce(135);
 await worker.onmessage({data:{id:9,state:{gameTime:480},command:'advanceTime',params:{minutes:60}}});
 expect(postMessage).toHaveBeenCalledWith({id:9,data,workerComputeMs:35});
 expect(data.state).toEqual({gameTime:540});expect(mock.progress).toHaveBeenLastCalledWith(null);
});
it('löst Fehler weiterhin über dieselbe Befehls-ID auf und entfernt den Fortschrittshook',async()=>{
 const postMessage=vi.fn();const worker:any={postMessage};vi.stubGlobal('self',worker);
 await import('../src/lib/simulationWorker.js');mock.execute.mockRejectedValue(new Error('Testfehler'));
 await worker.onmessage({data:{id:10,state:{},command:'advanceTime'}});
 expect(postMessage).toHaveBeenCalledWith({id:10,data:{error:'Testfehler'}});
 expect(mock.progress).toHaveBeenLastCalledWith(null);
});
