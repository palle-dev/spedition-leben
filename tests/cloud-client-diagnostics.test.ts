import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@/api/base44Client',()=>({base44:{functions:{invoke:mock.invoke}}}));
import {listCloudSaves,loadCloudSave,saveCloudSave} from '@/lib/cloudSync';
beforeEach(()=>vi.resetAllMocks());
it('identifies the actual failing client operation and known routing detail',async()=>{
 mock.invoke.mockRejectedValue({response:{status:404,data:{error:'not-found',detail:'user worker not found'}}});
 await expect(listCloudSaves()).rejects.toThrow('[cloudSync/list · HTTP 404] not-found (user worker not found)');
 await expect(loadCloudSave('private-save-id')).rejects.toMatchObject({command:'load',status:404,detail:'user worker not found'});
});
it('distinguishes successful listing from failed saving without acknowledging it',async()=>{
 mock.invoke.mockResolvedValueOnce({data:{saves:[{id:'one'}]}}).mockRejectedValueOnce({response:{status:500,data:{error:'save failed',code:'CLOUD_OPERATION_FAILED'}}});
 expect(await listCloudSaves()).toEqual({saves:[{id:'one'}]});
 await expect(saveCloudSave('private-save-id',{meta:{partyId:'p'}},3,null,null)).rejects.toMatchObject({command:'save',status:500,code:'CLOUD_OPERATION_FAILED',message:'[cloudSync/save · HTTP 500] save failed'});
});
it('preserves conflict handling and excludes arbitrary server detail and headers',async()=>{
 const conflict={conflict:true,current_revision:9};mock.invoke.mockRejectedValueOnce({response:{status:409,data:conflict}});
 expect(await loadCloudSave('one')).toBe(conflict);
 mock.invoke.mockRejectedValue({message:'Network Error',code:'ERR_NETWORK',config:{headers:{Authorization:'private-token'}},data:{detail:'private-state'}});
 try{await listCloudSaves();throw Error('Expected rejection');}catch(error){expect(error.message).toBe('[cloudSync/list · keine HTTP-Antwort] Network Error');expect(error.code).toBe('ERR_NETWORK');expect(JSON.stringify(error)).not.toMatch(/private-token|private-state/);}
});
