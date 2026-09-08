import {getStore} from '@netlify/blobs';
import {equal,signature} from '../../lib/core.mjs';
import {run} from '../../lib/runner.mjs';
export default async function handler(req){
 if(req.method!=='POST')return;
 const payload=await req.text();if(payload.length>512)return;
 let input;try{if(!equal(req.headers.get('X-Office-Signature')||'',signature(payload)))return;input=JSON.parse(payload);if(!Number.isFinite(input.exp)||input.exp<Date.now()||input.exp>Date.now()+6*60000||!/^[-a-f0-9]{36}$/i.test(input.id))return;}catch{return;}
 await run(getStore({name:'4d-agent-office-v1',consistency:'strong'}),input.id);
}
export const config={background:true};
