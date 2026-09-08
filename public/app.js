const $=id=>document.getElementById(id);
let state=null,selected='all',filter='all',detailId=null,poll=null,loading=false,knowledgeDirty=false,knowledgeVersion=0,activeView='office',requestId=null;
const statuses={all:'All',queued:'Queued',running:'Running',review:'Review',accepted:'Accepted',failed:'Failed'};
async function api(action,method='GET',data){
 const response=await fetch('/.netlify/functions/office?action='+action,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});
 let result;try{result=await response.json();}catch{throw new Error('Backend unavailable. Deploy the full package through GitHub or Netlify CLI, including Functions.');}
 if(!response.ok){if(response.status===401&&action!=='login')showLogin();throw new Error(result.error||'Request failed.');}return result;
}
function el(tag,text,cls){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;}
function notify(message){$('notice').textContent=message;$('notice').hidden=!message;}
function showLogin(){clearTimeout(poll);$('app').hidden=true;$('login').hidden=false;for(const d of document.querySelectorAll('dialog[open]'))d.close();}
function fresh(t){return ['running','queued'].includes(t.status)&&Date.now()-Date.parse(t.startedAt||t.createdAt)<14*60000;}
function displayStatus(t){return ['running','queued'].includes(t.status)&&!fresh(t)?'Interrupted / unconfirmed':statuses[t.status];}
async function refresh(){
 if(loading)return;loading=true;
 try{state=await api('state');$('login').hidden=true;$('app').hidden=false;render();$('sync-status').textContent='Synced '+new Date().toLocaleTimeString();}
 catch(e){if(!$('app').hidden){notify(e.message);$('sync-status').textContent='Sync interrupted — last saved view';}}
 finally{loading=false;clearTimeout(poll);if(!$('app').hidden)poll=setTimeout(refresh,10000);}
}
function chooseView(view){activeView=view;for(const n of ['office','knowledge','setup'])$(n+'-view').hidden=n!==view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===view));}
function render(){
 const live=state.tasks.filter(t=>t.status==='running'&&fresh(t));$('running-count').textContent=live.length;$('review-count').textContent=state.tasks.filter(t=>t.status==='review').length;
 const departments=$('departments');departments.replaceChildren();
 for(const a of state.agents){const ts=state.tasks.filter(t=>t.agent===a.id);const card=el('button',null,'dept'+(selected===a.id?' selected':''));card.style.setProperty('--c',a.color);const top=el('div',a.name,'deptname');const count=el('div',null,'number');count.append(el('b',ts.filter(t=>t.status==='running'&&fresh(t)).length),el('small','RUNNING'));
 const stats=el('div',null,'stats');for(const [label,status] of [['QUEUED','queued'],['REVIEW','review'],['ACCEPTED','accepted']])stats.append(el('span',label+' '+ts.filter(t=>t.status===status).length));card.append(top,count,stats);card.onclick=()=>{selected=selected===a.id?'all':a.id;render();};departments.append(card);}
 const options=$('agent');if(!options.children.length)for(const a of state.agents){const o=el('option',a.name);o.value=a.id;options.append(o);}
 $('queue-title').textContent=selected==='all'?'Whole company':state.agents.find(a=>a.id===selected).name;
 $('filters').replaceChildren();for(const [key,label] of Object.entries(statuses)){const b=el('button',label,'');b.classList.toggle('on',filter===key);b.onclick=()=>{filter=key;render();};$('filters').append(b);}
 const tasks=state.tasks.filter(t=>(selected==='all'||selected===t.agent)&&(filter==='all'||filter===t.status));$('tasks').replaceChildren();
 for(const t of tasks){const article=el('article');const button=el('button',null,'task-open');button.append(el('span',displayStatus(t),'badge '+t.status),el('h3',(t.displayPrompt||t.prompt).length>100?(t.displayPrompt||t.prompt).slice(0,100)+'…':(t.displayPrompt||t.prompt)),el('p',state.agents.find(a=>a.id===t.agent)?.name+' · '+new Date(t.createdAt).toLocaleString()));button.onclick=()=>{detailId=t.id;renderDetail();$('detail').showModal();};article.append(button);$('tasks').append(article);}
 if(!tasks.length)$('tasks').append(el('p','No assignments here yet. Choose Assign work to begin.','empty'));
 if(!knowledgeDirty){$('knowledge').value=state.knowledge;knowledgeVersion=state.knowledgeVersion;}
 const connections=$('connections');connections.replaceChildren();connections.append(el('p','OpenAI key: '+(state.checks.openai?'Configured (verified when a run succeeds)':'Not configured')),el('p','Model: '+state.model),el('p','Today: '+(state.budget.day===new Date().toISOString().slice(0,10)?state.budget.count:0)+' / '+state.dailyLimit+' assignments (UTC)'),el('p','Saved storage: connected · '+state.tasks.length+' / 500 assignments'),el('p','Email / CRM / accounting: not connected'));
 renderMap(live);if($('detail').open)renderDetail();chooseView(activeView);
}
const positions=[[18,24],[50,15],[82,24],[82,68],[50,81],[18,68]];
function renderMap(live){
 const svg=$('comms'),root=$('stations'),ns='http://www.w3.org/2000/svg';svg.replaceChildren();root.replaceChildren();$('map').classList.toggle('active',live.length>0);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 state.agents.forEach((a,i)=>{const [x,y]=positions[i],isLive=live.some(t=>t.agent===a.id),waiting=state.tasks.some(t=>t.agent===a.id&&t.status==='review');
  const line=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:50,y1:50,x2:x,y2:y}))line.setAttribute(k,v);svg.append(line);
  if(isLive&&!reduced){const circle=document.createElementNS(ns,'circle');circle.setAttribute('r','.6');circle.setAttribute('class','packet');const motion=document.createElementNS(ns,'animateMotion');motion.setAttribute('path',`M 50 50 L ${x} ${y}`);motion.setAttribute('dur',(3+i*.2)+'s');motion.setAttribute('repeatCount','indefinite');circle.append(motion);svg.append(circle);}
  const station=el('button',null,'station '+(isLive?'working':waiting?'waiting':'idle'));station.style.left=x+'%';station.style.top=y+'%';station.style.setProperty('--delay',i*-.25+'s');station.setAttribute('aria-label',a.name+': '+(isLive?'Running':waiting?'Review ready':'Idle'));
  const worker=el('div',null,'worker');worker.append(el('i',null,'head'),el('i',null,'body'));const desk=el('div',null,'desk');desk.append(el('i',null,'screen'),el('i',null,'keyboard'),el('i',null,'signal'));station.append(worker,desk,el('label',a.name),el('small',isLive?'Running':waiting?'Review ready':'Idle','desk-status'));station.onclick=()=>{selected=a.id;render();};root.append(station);
 });
}
function renderOutput(t,container){
 if(t.parts?.length){for(const part of t.parts){const p=el('div',null,'output');let cursor=0;const annotations=(part.annotations||[]).filter(a=>a.type==='url_citation'&&/^https?:\/\//.test(a.url)&&Number.isInteger(a.start_index)&&Number.isInteger(a.end_index)).sort((a,b)=>a.start_index-b.start_index);
 for(const a of annotations){if(a.start_index<cursor||a.end_index>part.text.length)continue;p.append(document.createTextNode(part.text.slice(cursor,a.start_index)));const link=el('a',part.text.slice(a.start_index,a.end_index)||a.title||'Source');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';p.append(link);cursor=a.end_index;}p.append(document.createTextNode(part.text.slice(cursor)));container.append(p);}}
 else container.append(el('div',t.output||'No output yet.','output'));
}
function renderDetail(){const t=state.tasks.find(t=>t.id===detailId);if(!t)return;const root=$('detail-body');root.replaceChildren();$('detail-title').textContent=state.agents.find(a=>a.id===t.agent)?.name||'Assignment';root.append(el('p',displayStatus(t),'badge '+t.status),el('h3',t.parentId?'Owner reply':'Assignment'),el('p',t.displayPrompt||t.prompt));
 if(t.parentId){const parent=state.tasks.find(x=>x.id===t.parentId);if(parent){const box=el('div',null,'thread-context');box.append(el('small','Previous agent result'),el('div',(parent.output||parent.error||'No saved result.').slice(-3500),'output'));root.append(box);}}
 if(t.error)root.append(el('p',t.error,'error'));
 if(!fresh(t)&&['queued','running'].includes(t.status))root.append(el('p','No completion was confirmed. Check Netlify function logs. A new run may incur additional usage. A queued run can be resumed without creating a new assignment.','error'));
 if(t.output){root.append(el('h3','Result'));renderOutput(t,root);}
 if(t.sources?.length){root.append(el('h3','Sources'));const list=el('ul');for(const s of t.sources){if(!/^https?:\/\//.test(s.url))continue;const li=el('li');const a=el('a',s.title);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';li.append(a);list.append(li);}root.append(list);}
 root.append(el('h3','Activity'));for(const s of t.steps)root.append(el('p',new Date(s.time).toLocaleTimeString()+' — '+s.text,'activity'));
 if(t.usage)root.append(el('p',`Model: ${t.model} · Input tokens: ${t.usage.input_tokens||0} · Output tokens: ${t.usage.output_tokens||0}. Token counts exclude separate web-search charges.`,'hint'));
 $('accept').hidden=t.status!=='review';$('resume').hidden=t.status!=='queued';$('download').hidden=!t.output;$('again').hidden=['queued','running'].includes(t.status)&&fresh(t);$('reply').hidden=!['review','accepted','failed'].includes(t.status);$('reply-box').hidden=true;$('reply-web-search').checked=!!t.webSearch;$('reply-message').value='';
}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function compose(task){requestId=crypto.randomUUID();$('prompt').value=task?.prompt||'';if(task)$('agent').value=task.agent;else if(selected!=='all')$('agent').value=selected;$('web-search').checked=task?.webSearch||false;$('compose').showModal();}
$('login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('login','POST',{password:$('password').value});$('password').value='';$('login-error').textContent='';await refresh();}catch(e){$('login-error').textContent=e.message;}finally{b.disabled=false;}};
$('logout').onclick=async()=>{try{await api('logout','POST',{});showLogin();state=null;$('knowledge').value='';$('tasks').replaceChildren();}catch(e){notify(e.message);}};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>chooseView(b.dataset.view));document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('assign').onclick=()=>compose();
$('task-form').onsubmit=async e=>{e.preventDefault();$('run').disabled=true;try{const result=await api('run','POST',{id:requestId,prompt:$('prompt').value,agent:$('agent').value,webSearch:$('web-search').checked});$('compose').close();notify(result.notice||'Assignment saved and dispatched. You can close this page once the worker starts.');filter='all';await refresh();}catch(e){alert(e.message);}finally{$('run').disabled=false;}};
$('knowledge').oninput=()=>knowledgeDirty=true;
$('knowledge-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const r=await api('knowledge','POST',{knowledge:$('knowledge').value,version:knowledgeVersion});knowledgeVersion=r.version;knowledgeDirty=false;notify('Company knowledge saved for new assignments.');await refresh();}catch(e){notify(e.message);}finally{e.submitter.disabled=false;}};
$('accept').onclick=async()=>{try{await api('accept','POST',{id:detailId});await refresh();}catch(e){notify(e.message);}};
$('resume').onclick=async()=>{try{const r=await api('dispatch','POST',{id:detailId});notify(r.notice||'Worker dispatch requested.');await refresh();}catch(e){notify(e.message);}};
$('again').onclick=()=>{const task=state.tasks.find(t=>t.id===detailId);$('detail').close();compose(task);};

$('reply').onclick=()=>{$('reply-box').hidden=false;$('reply-message').focus();};
document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{$('reply-box').hidden=false;$('reply-message').value=b.dataset.quick;$('reply-message').focus();});
$('reply-form').onsubmit=async e=>{e.preventDefault();const message=$('reply-message').value.trim();if(!message)return;const button=$('send-reply');button.disabled=true;try{const id=crypto.randomUUID();const result=await api('followup','POST',{id,parentId:detailId,message,webSearch:$('reply-web-search').checked});notify(result.notice||'Reply sent. The agent is continuing the work.');$('detail').close();filter='all';await refresh();detailId=result.id;renderDetail();$('detail').showModal();}catch(err){notify(err.message);}finally{button.disabled=false;}};
$('download').onclick=()=>{const t=state.tasks.find(t=>t.id===detailId);download('4D-Result-'+t.id+'.txt',t.prompt+'\n\n'+t.output+'\n\nSOURCES\n'+(t.sources||[]).map(s=>s.title+'\n'+s.url).join('\n\n'));};
$('export').onclick=()=>download('4D-Agent-Office-History.json',JSON.stringify(state,null,2),'application/json');
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('app').hidden)refresh();});
try{const {checks}=await api('setup');const missing=Object.entries(checks).filter(([,v])=>!v).map(([k])=>({password:'OFFICE_PASSWORD (16+ characters)',session:'SESSION_SECRET (32+ characters)',openai:'OPENAI_API_KEY'}[k]));if(missing.length)$('setup-checks').textContent='Netlify setup needed: '+missing.join(', ');await refresh();}catch(e){$('login-error').textContent=e.message;}
