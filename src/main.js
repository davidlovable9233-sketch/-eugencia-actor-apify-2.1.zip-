import { Actor } from 'apify';
import { operate } from './core.js';
import { cloudState, jsonFetch } from './cloud.js';
await Actor.init();
let storage;
let stage='read_input';
try {
 const input=await Actor.getInput() || {};
 stage='validate_credentials';
 const openaiKey=process.env.OPENAI_API_KEY || input.openaiApiKey;
 const manusKey=process.env.MANUS_API_KEY || input.manusApiKey;
 if(input.action==='generate' && !openaiKey) throw new Error('Cadastre o segredo OpenAI.');
 if((input.action==='sync'||(input.action==='dispatch'&&input.live))&&!manusKey) throw new Error('Cadastre o segredo Manus.');
 stage='open_persistent_storage';
 storage=await cloudState({token:process.env.APIFY_TOKEN,actorId:process.env.APIFY_ACTOR_ID});
 let result;
 if(!storage) result={state:'busy',reason:'Outra execução possui a trava. Consulte novamente depois.'};
 else {
 stage='process_action';
 result=await operate(input,{
  load:async()=>{stage='load_state';const s=await storage.load();stage='validate_action_and_budget';return s;},
  save:async s=>{stage='save_state';await storage.save(s);stage='process_action';},
  openai:payload=>jsonFetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)}),
  manus:(endpoint,payload)=>jsonFetch('https://api.manus.ai/v2/'+endpoint,{method:payload?'POST':'GET',headers:{'x-manus-api-key':manusKey,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})})
 });
 }
 stage='write_output';
 await Actor.setValue('OUTPUT',result);
 // Do not copy prompts, code, inputs or secrets into datasets/logs.
 console.log('Operação finalizada. Consulte OUTPUT.');
} catch (error) {
 const message=error instanceof Error ? error.message : '';
 // Only messages created by our own validation are safe to return verbatim.
 const known=new Set(['Cadastre o segredo OpenAI.','Cadastre o segredo Manus.','Saldos inválidos','Ação desconhecida','Estado persistente inválido. Não reinicializado.','Falha ao carregar estado','Trava expirada. Revise estado antes de continuar.','Execute na Apify com APIFY_TOKEN e APIFY_ACTOR_ID.']);
 const safe=known.has(message)||/^Campo inválido: (requestId|cycle|execution|prompt|execution gerada)$/.test(message)||/^Falha HTTP [1-5][0-9]{2}$/.test(message);
 const reason=safe ? message : 'Falha nesta etapa; detalhes externos foram omitidos para proteger credenciais.';
 console.error(`Operação interrompida na etapa ${stage}: ${reason}`);
 await Actor.setValue('OUTPUT',{state:'error',stage,reason,nextStep:'Não envie novamente tarefas incertas. Corrija a configuração e confira o estado antes de continuar.'});
 process.exitCode=1;
} finally {
 if(storage) { try { await storage.close(); } catch { /* remote lease expires automatically */ } }
 await Actor.exit({exit:false});
}
