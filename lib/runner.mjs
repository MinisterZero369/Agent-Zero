import {mutate,read,instructions,responseText,sources,fail} from './core.mjs';
export async function run(store,id,request=fetch,env=process.env){
 const {result:task}=await mutate(store,d=>{const t=d.tasks.find(t=>t.id===id);if(!t||t.status!=='queued')return null;t.status='running';t.startedAt=new Date().toISOString();t.steps.push({time:t.startedAt,text:t.webSearch?'Agent started with web search enabled.':'Agent started drafting from your company context.'});return structuredClone(t);});
 if(!task)return; // Platform retries or repeat dispatches cannot spend twice.
 let finished;
 try{
  const response=await request('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:task.model,instructions:instructions(task),input:task.prompt,max_output_tokens:3500,store:false,...(task.webSearch?{tools:[{type:'web_search',search_context_size:'low'}],max_tool_calls:3}:{})}),signal:AbortSignal.timeout(650000)});
  const data=await response.json();
  if(!response.ok){const messages={401:'OpenAI rejected the API key. Replace OPENAI_API_KEY in Netlify.',403:'This OpenAI project does not have access to the requested model or tool.',404:'Model unavailable. Check OPENAI_MODEL in Netlify.',429:'OpenAI quota or rate limit reached. Check API billing and usage, then submit a new run.'};throw fail(messages[response.status]||`OpenAI returned HTTP ${response.status}. Check the project and model settings.`);}
  if(data.status!=='completed')throw fail(`OpenAI response was ${data.status||'incomplete'}. ${data.incomplete_details?.reason==='max_output_tokens'?'Output limit reached; try a smaller assignment.':''}`);
  const output=responseText(data);if(!output)throw fail('OpenAI returned no text. Try a more specific assignment.');
  const parts=(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>({text:x.text,annotations:x.annotations||[]}));
  finished={status:'review',output,parts,sources:sources(data),usage:data.usage||{},responseId:data.id,completedAt:new Date().toISOString(),error:null};
 }catch(e){finished={status:'failed',error:e.name==='TimeoutError'?'Run exceeded the time limit. OpenAI may have billed partial processing; submit a smaller assignment.':e.status?e.message:'The OpenAI connection failed. A partial request may have been billed. Try again with a new run.',completedAt:new Date().toISOString()};}
 // Retrying storage is safe; never repeat the paid generation automatically.
 for(let attempt=0;attempt<3;attempt++){
  try{await mutate(store,d=>{const t=d.tasks.find(t=>t.id===id);if(t&&t.status==='running'){Object.assign(t,finished);t.steps.push({time:finished.completedAt,text:finished.status==='review'?'Output saved. Ready for owner review.':finished.error});}});return;}
  catch(e){if(attempt===2)throw e;}
 }
}
