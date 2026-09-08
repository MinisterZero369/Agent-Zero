import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticated,session,initial,mutate,newTask,newFollowupTask,sameOrigin,sources} from '../lib/core.mjs';
import {run} from '../lib/runner.mjs';
class Store {
 value=null;etag=0;
 async get(){return this.value?structuredClone(this.value):null;}
 async getWithMetadata(){return this.value?{data:structuredClone(this.value),etag:String(this.etag)}:null;}
 async setJSON(key,value,options){if(options.onlyIfNew&&this.value||options.onlyIfMatch&&options.onlyIfMatch!==String(this.etag))return {modified:false};this.value=structuredClone(value);this.etag++;return {modified:true,etag:String(this.etag)};}
}
const env={OFFICE_PASSWORD:'test-password-long-enough',SESSION_SECRET:'test-secret-32-characters-or-longer',OPENAI_API_KEY:'unit-test-not-a-real-key',MAX_RUNS_PER_DAY:'2'};
test('signed cookie rejects tampering, expiry, password changes and missing login',()=>{
 const token=session(env,1000);const request=t=>new Request('https://office.example',{headers:{cookie:'office_session='+t}});
 assert.equal(authenticated(request(token),env,1001),true);
 assert.equal(authenticated(request(token+'x'),env,1001),false);
 assert.equal(authenticated(request(token),env,9*3600000),false);
 assert.equal(authenticated(request(token),{...env,OFFICE_PASSWORD:'different-long-password'},1001),false);
 assert.equal(authenticated(new Request('https://office.example'),env,1001),false);
});
test('cross-origin and missing-origin writes fail',()=>{assert.throws(()=>sameOrigin(new Request('https://office.example',{headers:{Origin:'https://evil.example'}})));assert.throws(()=>sameOrigin(new Request('https://office.example')));sameOrigin(new Request('https://office.example',{headers:{Origin:'https://office.example'}}));});
const input=n=>({id:`00000000-0000-4000-8000-00000000000${n}`,agent:'growth',prompt:'Research training prospects',webSearch:true});
test('idempotent creation, daily limit, agent validation and midnight reset',()=>{const d=initial();newTask(d,input(1),1000,env);newTask(d,input(1),1000,env);assert.equal(d.tasks.length,1);assert.equal(d.budget.count,1);newTask(d,input(2),1000,env);assert.throws(()=>newTask(d,input(3),1000,env),/Daily/);newTask(d,input(3),86400000,env);assert.equal(d.budget.count,1);assert.throws(()=>newTask(d,{...input(4),agent:'unknown'},86400000,env));});
test('atomic updates preserve simultaneous changes',async()=>{const s=new Store();await Promise.all([mutate(s,d=>d.knowledge+=' A'),mutate(s,d=>d.knowledge+=' B')]);assert.match(s.value.knowledge,/A/);assert.match(s.value.knowledge,/B/);});
test('duplicate workers make one paid call; save text, usage and citations',async()=>{
 const s=new Store();await mutate(s,d=>newTask(d,input(1),Date.now(),env));let calls=0;
 const mock=async(url,options)=>{calls++;const body=JSON.parse(options.body);assert.equal(body.tools[0].type,'web_search');assert.equal(body.store,false);return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:50,output_tokens:100},output:[{type:'message',content:[{type:'output_text',text:'Report [source]',annotations:[{type:'url_citation',url:'https://example.org',title:'Example',start_index:7,end_index:15}]}]}]});};
 await Promise.all([run(s,input(1).id,mock,env),run(s,input(1).id,mock,env)]);assert.equal(calls,1);assert.equal(s.value.tasks[0].status,'review');assert.equal(s.value.tasks[0].output,'Report [source]');assert.equal(s.value.tasks[0].sources.length,1);assert.equal(s.value.tasks[0].parts[0].annotations.length,1);
});
test('quota failure stays failed and worker retries do not spend again',async()=>{const s=new Store();await mutate(s,d=>newTask(d,input(1),Date.now(),env));let calls=0;const mock=async()=>{calls++;return Response.json({error:{message:'internal provider detail'}},{status:429});};await run(s,input(1).id,mock,env);await run(s,input(1).id,mock,env);assert.equal(calls,1);assert.equal(s.value.tasks[0].status,'failed');assert.match(s.value.tasks[0].error,/quota/);});
test('incomplete output is never labeled completed',async()=>{const s=new Store();await mutate(s,d=>newTask(d,input(1),Date.now(),env));await run(s,input(1).id,async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}),env);assert.equal(s.value.tasks[0].status,'failed');assert.match(s.value.tasks[0].error,/smaller assignment/);});
test('unsafe source URLs excluded',()=>assert.deepEqual(sources({output:[{content:[{annotations:[{type:'url_citation',url:'javascript:alert(1)'}]}]}]}),[]));

test('owner reply creates a linked continuation with previous result context',()=>{const d=initial();const e={...env,MAX_RUNS_PER_DAY:'5'};const parent=newTask(d,input(1),1000,e);parent.status='review';parent.output='The agent recommends building the prospect list next.';const child=newFollowupTask(d,{id:input(2).id,parentId:parent.id,message:'Yes, proceed and build the list.',webSearch:true},2000,e);assert.equal(child.parentId,parent.id);assert.equal(child.ownerReply,'Yes, proceed and build the list.');assert.match(child.prompt,/previous agent result/i);assert.match(child.prompt,/building the prospect list next/i);assert.equal(child.status,'queued');assert.equal(d.tasks.length,2);});
