import { randomUUID } from 'node:crypto';
import { emptyState } from './core.js';
export async function jsonFetch(url, options={}) {
 const r=await fetch(url,{...options,signal:AbortSignal.timeout(options.timeoutMs||120000)});
 if(!r.ok) throw new Error(`Falha HTTP ${r.status}`);
 const body=await r.text();
 return body ? JSON.parse(body) : {};
}
export async function cloudState({token,actorId,fetchJson=jsonFetch}) {
 if (!token || !actorId) throw new Error('Execute na Apify com APIFY_TOKEN e APIFY_ACTOR_ID.');
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const api=async(path,method='GET',body)=> (await fetchJson('https://api.apify.com/v2/'+path,{method,headers,timeoutMs:15000,...(body===undefined?{}:{body:JSON.stringify(body)})})).data;
 // Storage scope is fixed per Actor, never selected by untrusted input.
 const store=await api('key-value-stores?name='+encodeURIComponent(`eugencia-${actorId}-state`),'POST');
 const queue=await api('request-queues?name='+encodeURIComponent(`eugencia-${actorId}-mutex`),'POST');
 const clientKey=randomUUID().replaceAll('-','');
 const qpath=`request-queues/${queue.id}`;
 await api(qpath+'/requests','POST',{url:'https://mutex.invalid/eugencia',uniqueKey:'exclusive-state-gate-v1'});
 const started=Date.now();
 const head=await api(qpath+`/head/lock?clientKey=${clientKey}&lockSecs=300&limit=1`,'POST');
 const gate=head.items?.[0];
 if(!gate) return null;
 // Fail closed well before the remote lease expires. No automatic mutations after this deadline.
 const assertLease=()=>{if(Date.now()-started>210000) throw new Error('Trava expirada. Revise estado antes de continuar.');};
 const key=`key-value-stores/${store.id}/records/STATE`;
 return {
  async load(){assertLease();
   // get record separately to distinguish absent from API failure
   const r=await fetch('https://api.apify.com/v2/'+key,{headers,signal:AbortSignal.timeout(15000)});
   if(r.status===404) return emptyState();
   if(!r.ok) throw new Error('Falha ao carregar estado');
   const state=await r.json();assertLease();return state;
  },
  async save(s){assertLease();await api(key,'PUT',s);assertLease();},
  async close(){assertLease();await api(qpath+`/requests/${gate.id}/lock?clientKey=${clientKey}`,'DELETE');}
 };
}
