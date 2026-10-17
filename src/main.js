import { Actor } from 'apify';
import { operate } from './core.js';
import { cloudState, jsonFetch } from './cloud.js';
await Actor.init();
let storage;
try {
 const input=await Actor.getInput() || {};
 const openaiKey=process.env.OPENAI_API_KEY || input.openaiApiKey;
 const manusKey=process.env.MANUS_API_KEY || input.manusApiKey;
 if(input.action==='generate' && !openaiKey) throw new Error('Cadastre o segredo OpenAI.');
 if((input.action==='sync'||(input.action==='dispatch'&&input.live))&&!manusKey) throw new Error('Cadastre o segredo Manus.');
 storage=await cloudState({token:process.env.APIFY_TOKEN,actorId:process.env.APIFY_ACTOR_ID});
 let result;
 if(!storage) result={state:'busy',reason:'Outra execução possui a trava. Consulte novamente depois.'};
 else result=await operate(input,{
  load:()=>storage.load(),save:s=>storage.save(s),
  openai:payload=>jsonFetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}),
  manus:(endpoint,payload)=>jsonFetch('https://api.manus.ai/v2/'+endpoint,{method:payload?'POST':'GET',headers:{'x-manus-api-key':manusKey,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})})
 });
 await Actor.setValue('OUTPUT',result);
 // Do not copy prompts, code, inputs or secrets into datasets/logs.
 console.log('Operação finalizada. Consulte OUTPUT.');
} catch {
 await Actor.setValue('OUTPUT',{state:'error',reason:'Operação interrompida. Confira configuração e estado persistente; não reenvie tarefas incertas.'});
 process.exitCode=1;
} finally {
 if(storage) { try { await storage.close(); } catch { /* remote lease expires automatically */ } }
 await Actor.exit({exit:false});
}
