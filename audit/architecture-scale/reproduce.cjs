const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));
 if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';
 return resolve.call(this,request,parent,...rest);
};
const load=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file
}).outputText,file);
require.extensions['.ts']=load;
const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>file.startsWith(path.join(root,'src'))?load(mod,file):js(mod,file);

const {getBranchFinancials}=require(path.join(root,'src/lib/accountingData.js'));
const {cleanupHistory}=require(path.join(root,'src/lib/simulation/historyCleanup.ts'));
const input={gameTime:20*1440,branches:[{id:'a',status:'active',costPerDayCents:0},{id:'b',status:'active',costPerDayCents:0}],vehicles:[{id:'v',branchId:'a',status:'free'}],drivers:[],employees:[],appointments:[],tours:[],events:[],bookings:[],
orders:[{id:'o',status:'geliefert',paidCents:10000,deliveredAtMin:100}],
trips:[{id:'t',orderId:'o',vehicleId:'v',type:'loaded',status:'completed',endMin:100,fuelCents:1000,tollCents:100}],accounting:{receipts:[]}};
const revenues=s=>getBranchFinancials(s,0,2000).map(x=>({branch:x.branch.id,revenueCents:x.revenue,directCostsCents:x.directCosts}));
const before=revenues(input),moved=structuredClone(input),cleaned=structuredClone(input);
moved.vehicles[0].branchId='b';cleanupHistory(cleaned,cleaned.gameTime);
const report={baselineCommit:'73db1ff9fc90160aa402c4ca5a840692b63746b6',test:'Synthetic read-only historical branch revenue reproduction; not a scale/performance test',period:[0,2000],before,afterVehicleMove:revenues(moved),afterHistoryCleanup:revenues(cleaned),remainingOrders:cleaned.orders.length,remainingTrips:cleaned.trips.length};
assert.equal(before[0].revenueCents,10000);assert.equal(report.afterVehicleMove[0].revenueCents,0);assert.equal(report.afterVehicleMove[1].revenueCents,10000);assert.equal(report.afterHistoryCleanup[0].revenueCents,0);
fs.writeFileSync(path.join(__dirname,'historical-report-reproduction.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
