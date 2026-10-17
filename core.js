export const MODEL = 'gpt-5.6-luna';
const blocked = new Set(['generating','sending','unknown','active']);
const text = (x, name, max) => {
 if (typeof x !== 'string' || !x.trim() || x.length > max) throw new Error(`Campo inválido: ${name}`);
 return x;
};
export const emptyState = () => ({ version: 1, jobs: [] });
export function summary(s) {
 return { model: MODEL, jobs: s.jobs.map(({id,state,taskId,taskUrl,usage,execution}) => ({id,state,taskId,taskUrl,usage,execution})) };
}
export async function operate(input, { load, save, openai, manus, now = () => new Date() }) {
 const s = await load();
 if (!s || s.version !== 1 || !Array.isArray(s.jobs)) throw new Error('Estado persistente inválido. Não reinicializado.');
 const action = input.action || 'status';
 if (action === 'status') return summary(s);
 if (action === 'generate' || action === 'enqueue') {
  const id = text(input.requestId,'requestId',100);
  if (s.jobs.some(j => j.id === id)) return { state: 'duplicate', ...summary(s) };
  if (s.jobs.some(j => blocked.has(j.state))) return { state:'blocked', reason:'Existe operação ativa ou incerta.', ...summary(s) };
  if (s.jobs.length >= 1000) throw new Error('Histórico atingiu 1000 pedidos; arquivamento administrativo necessário.');
  const job = { id, state: action === 'generate' ? 'generating' : 'queued' };
  if (action === 'enqueue') job.execution = text(input.execution,'execution',12000);
  else text(input.prompt,'prompt',12000);
  const knowledge = input.knowledge || '';
  if (typeof knowledge !== 'string' || knowledge.length > 50000) throw new Error('Conhecimento deve ter até 50000 caracteres.');
  s.jobs.push(job); await save(s); // persist intention before any paid request
  if (action === 'generate') {
   try {
    const r = await openai({ model:MODEL,store:false,max_output_tokens:6000,
     instructions:'Prepare código pronto para o Manus Lite executar. Retorne SOMENTE JSON com execution (string de até 12000 caracteres, com arquivos completos, comandos e teste). Não inclua segredos. Não amplie escopo nem publique sem instrução. Evite dependências e loops de reparo. Meta experimental: 30 créditos, sem garantia de custo. Skills adicionais:\n'+knowledge,
     input: input.prompt });
    if (r.status !== 'completed') throw new Error('Geração incompleta');
    const output = (r.output || []).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
    job.execution = text(JSON.parse(output).execution,'execution gerada',12000);
    job.state='queued'; await save(s);
   } catch {
    job.state='unknown'; await save(s);
    return {state:'unknown',reason:'Geração falhou ou ficou incerta. Não repetida automaticamente.',...summary(s)};
   }
  }
  return {state:'queued',...summary(s)};
 }
 if (action === 'sync') {
  const active=s.jobs.find(j=>j.state==='active');
  if (!active) return summary(s);
  const r = await manus(`task.detail?task_id=${encodeURIComponent(active.taskId)}`);
  if (!r.ok || !r.task) throw new Error('Resposta Manus inválida');
  const t=r.task;
  const valid=typeof t.credit_usage==='number' && Number.isFinite(t.credit_usage) && t.credit_usage>=0;
  if (valid) active.usage=Math.max(active.usage||0,t.credit_usage);
  if (valid && ['stopped','error'].includes(t.status) && t.has_running_background_jobs===false) active.state='done';
  await save(s); return summary(s);
 }
 if (action !== 'dispatch') throw new Error('Ação desconhecida');
 if (s.jobs.some(j=>blocked.has(j.state))) return {state:'blocked',reason:'Execução ativa ou envio incerto.',...summary(s)};
 const job=s.jobs.find(j=>j.state==='queued');
 if (!job) return {state:'empty'};
 const cycle=text(input.cycle,'cycle',80);
 const day=now().toISOString().slice(0,10);
 const daily=input.dailyAvailable, monthly=input.cycleAvailable;
 if (![daily,monthly].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0) || daily>300 || monthly>1500) throw new Error('Saldos inválidos');
 const spent=s.jobs.filter(j=>j.day===day).reduce((a,j)=>a+(j.usage||0),0);
 const spentCycle=s.jobs.filter(j=>j.cycle===cycle).reduce((a,j)=>a+(j.usage||0),0);
 if (Math.min(daily,monthly,300-spent,1500-spentCycle)<60) return {state:'blocked',reason:'Saldo insuficiente para meta de 30 mais reserva de 30.'};
 const payload={ agent_profile:'lite',share_visibility:'private',clear_connectors:true,interactive_mode:true,title:job.id,
  message:{content:'Execute apenas este pacote. Meta de economia: 30 créditos, não uma trava técnica. Não amplie escopo. Não use tarefas recorrentes ou processos em segundo plano. Se falhar, relate sem ciclos de reparo. Entregue os arquivos e o resultado do teste.\n'+job.execution} };
 if (input.live!==true) return {state:'simulation',jobId:job.id,payload};
 job.state='sending';job.day=day;job.cycle=cycle;await save(s);
 try {
  const r=await manus('task.create',payload);
  if (!r.ok || !r.task_id) throw new Error('Sem task_id');
  job.taskId=r.task_id;job.taskUrl=r.task_url;job.state='active';await save(s);
  return {state:'active',taskId:job.taskId,taskUrl:job.taskUrl};
 } catch {
  job.state='unknown';await save(s);
  return {state:'unknown',reason:'Envio incerto. Confira no Manus antes de reconciliar. Não reenviado.'};
 }
}
