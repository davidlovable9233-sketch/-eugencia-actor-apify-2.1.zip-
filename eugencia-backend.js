/** Server-only helper. Call after validating the Eugência administrator session.
 * Never import this module into the React/browser bundle.
 */
async function apify(path, options={}) {
 const token=process.env.APIFY_API_TOKEN;
 if(!token) throw Error('Configure APIFY_API_TOKEN no backend da Eugência');
 const r=await fetch('https://api.apify.com/v2/'+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
 if(!r.ok) throw Error('Falha ao consultar Apify');return r.json();
}
export async function startOrchestrator(input) {
 const actor=process.env.EUGENCIA_ORCHESTRATOR_ACTOR_ID;
 if(!actor) throw Error('Configure o ID retornado pela publicação do Actor');
 const allowed=['action','requestId','prompt','execution','knowledge','cycle','dailyAvailable','cycleAvailable','live'];
 const clean=Object.fromEntries(Object.entries(input).filter(([k])=>allowed.includes(k)));
 const r=await apify(`acts/${encodeURIComponent(actor)}/runs`,{method:'POST',body:JSON.stringify(clean)});
 return {runId:r.data.id,status:r.data.status};
}
export async function getOrchestratorResult(runId) {
 const actor=process.env.EUGENCIA_ORCHESTRATOR_ACTOR_ID;
 const r=await apify(`actor-runs/${encodeURIComponent(runId)}`);
 // Bind run ownership to this Actor AND to the requesting administrator in your application's data.
 if(r.data.actId!==actor) throw Error('Execução de outro Actor');
 if(!['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(r.data.status)) return {status:r.data.status};
 const result=await apify(`key-value-stores/${r.data.defaultKeyValueStoreId}/records/OUTPUT`);
 return {status:r.data.status,result};
}
