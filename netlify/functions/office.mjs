import { getStore } from '@netlify/blobs';
import {AGENTS,body,json,fail,setup,secret,session,equal,requireAuth,sameOrigin,mutate,read,newTask,newFollowupTask,signature,limit} from '../../lib/core.mjs';
const storage=()=>getStore({name:'4d-agent-office-v1',consistency:'strong'});
export default async function handler(req,context){
 try {
  const action=new URL(req.url).searchParams.get('action')||'state';
  if(req.method==='GET'&&action==='setup')return json({checks:setup()});
  if(req.method==='POST')sameOrigin(req);
  if(req.method==='POST'&&action==='login'){
   secret();const input=await body(req);const ip=context?.ip||'unknown';const store=storage();
   // Atomic per-IP/minute attempts. Raw IP addresses are never stored.
   const key='login/'+signature(ip).slice(0,32);let allowed=false;
   for(let i=0;i<8;i++){const entry=await store.getWithMetadata(key,{type:'json'});const minute=Math.floor(Date.now()/60000);const n=entry?.data?.minute===minute?entry.data.count:0;if(n>=6)throw fail('Too many sign-in attempts. Wait one minute.',429);const w=await store.setJSON(key,{minute,count:n+1},entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true});if(w.modified){allowed=true;break;}}
   if(!allowed)throw fail('Please wait a moment and try again.',429);
   if(typeof input.password!=='string'||!equal(input.password,process.env.OFFICE_PASSWORD))throw fail('Incorrect office password.',401);
   return json({ok:true},200,{'Set-Cookie':`office_session=${session()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});
  }
  requireAuth(req);const store=storage();
  if(req.method==='POST'&&action==='logout')return json({ok:true},200,{'Set-Cookie':'office_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  if(req.method==='GET'&&action==='state'){
   const data=await read(store);return json({...data,tasks:data.tasks.map(({knowledge,...t})=>t),agents:AGENTS.map(({role,...a})=>a),checks:setup(),model:process.env.OPENAI_MODEL||'gpt-4.1-mini',dailyLimit:limit()});
  }
  if(req.method==='POST'&&action==='knowledge'){
   const b=await body(req);if(typeof b.knowledge!=='string'||b.knowledge.length>24000)throw fail('Company knowledge must be under 24,000 characters.');
   const {data}=await mutate(store,d=>{if(b.version!==d.knowledgeVersion)throw fail('Company knowledge changed on another device. Reload before saving.',409);d.knowledge=b.knowledge;d.knowledgeVersion++;});return json({version:data.knowledgeVersion});
  }
  if(req.method==='POST'&&action==='accept'){
   const b=await body(req);await mutate(store,d=>{const t=d.tasks.find(t=>t.id===b.id);if(!t)throw fail('Assignment not found.',404);if(t.status==='accepted')return;if(t.status!=='review')throw fail('Only finished work can be accepted.');t.status='accepted';t.steps.push({time:new Date().toISOString(),text:'Owner accepted this draft. No external action was performed.'});});return json({ok:true});
  }
  if(req.method==='POST'&&['run','followup','dispatch'].includes(action)){
   if(!setup().openai)throw fail('Add OPENAI_API_KEY in Netlify and redeploy.',503);
   const b=await body(req);let task;
   if(action==='run')({result:task}=await mutate(store,d=>newTask(d,b)));
   else if(action==='followup')({result:task}=await mutate(store,d=>newFollowupTask(d,b)));
   else {task=(await read(store)).tasks.find(t=>t.id===b.id);if(!task)throw fail('Assignment not found.',404);}
   if(task.status!=='queued')return json({id:task.id,status:task.status});
   // Only use the platform's canonical site origin; never a client-supplied destination.
   const origin=process.env.URL;if(!origin||!origin.startsWith('https://'))throw fail('Netlify site URL is unavailable. Deploy this package on Netlify.',503);
   const payload=JSON.stringify({id:task.id,exp:Date.now()+5*60000});
   try {const result=await fetch(new URL('/.netlify/functions/agent-background',origin),{method:'POST',headers:{'Content-Type':'application/json','X-Office-Signature':signature(payload)},body:payload,signal:AbortSignal.timeout(10000)});if(result.status!==202)throw new Error('dispatch');}
   catch{return json({id:task.id,status:'queued',notice:'Assignment saved. Worker dispatch was not confirmed. Use Resume queued if it stays queued.'},202);}
   return json({id:task.id,status:'queued'},202);
  }
  throw fail('Route not found.',404);
 }catch(e){return json({error:e.status?e.message:'Service unavailable. Check Netlify function logs and try again.'},e.status||503);}
}
