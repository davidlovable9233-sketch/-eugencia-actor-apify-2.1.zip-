import test from 'node:test';import assert from 'node:assert/strict';
import {cloudState,jsonFetch} from './cloud.js';
test('busy lease does not initialize or mutate state',async()=>{
 const calls=[];const store=await cloudState({token:'test-token',actorId:'testactor',fetchJson:async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('key-value-stores?')) return {data:{id:'store'}};
  if(url.includes('request-queues?')) return {data:{id:'queue'}};
  if(url.includes('/head/lock?')) return {data:{items:[]}};
  return {data:{requestId:'gate'}};
 }});
 assert.equal(store,null);assert.ok(calls.every(x=>!x.url.includes('/records/')));
 assert.ok(calls.some(x=>x.url.includes('name=eugencia-testactor-state')));
});
test('empty successful response is supported',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response(null,{status:204});
 try{assert.deepEqual(await jsonFetch('https://example.invalid'),{});}finally{globalThis.fetch=old;}
});
