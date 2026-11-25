import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {createClient} from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.CRM_TEST_URL||'http://localhost:3013';
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function login(email,password){
 assert(password,'Supply company test passwords through private environment variables.');
 const jar=new Map();
 async function request(path,options={}){
  const response=await fetch(base+path,{...options,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Cookie:Array.from(jar,([k,v])=>`${k}=${v}`).join('; '),Origin:base,...options.headers}});
  for(const raw of response.headers.getSetCookie()){const pair=raw.split(';')[0],at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return response;
 }
 const csrf=await(await request('/api/auth/csrf')).json();
 await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password,csrfToken:csrf.csrfToken,json:'true',callbackUrl:base+'/admin/leads'})});
 const session=await(await request('/api/auth/session')).json();assert(session.user?.id,'Test account login must succeed');
 return {request,id:session.user.id,json:(path,body,method='PATCH')=>request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})};
}
const [admin,one,two]=await Promise.all([
 login('admin_spectra@spectrapackmachines.com',process.env.CRM_ADMIN_PASSWORD),
 login('employee001@spectrapackmachines.com',process.env.CRM_EMPLOYEE1_PASSWORD),
 login('employee002@spectrapackmachines.com',process.env.CRM_EMPLOYEE2_PASSWORD),
]);
const name='Spectra assignment test — do not contact '+randomUUID().slice(0,8);
let id;
try{
 const created=await admin.json('/api/crm',{name,email:'info@spectrapackmachines.com',message:'Disposable internal assignment contract test. Do not contact.',source:'staff-other',assignedTo:one.id},'POST');
 assert.equal(created.status,201);id=(await created.json()).lead.id;
 const path='/api/crm/leads/'+id;
 assert((await(await one.request('/api/crm')).json()).leads.some(lead=>lead.id===id));
 assert.equal((await one.json(path,{assignedTo:two.id})).status,403,'Staff cannot reassign a lead');
 const assigned=await admin.json(path,{assignedTo:two.id});assert.equal(assigned.status,200);assert.equal((await assigned.json()).lead.assignedTo,two.id);
 assert(!(await(await one.request('/api/crm')).json()).leads.some(lead=>lead.id===id),'Old employee loses the lead');
 assert((await(await two.request('/api/crm')).json()).leads.some(lead=>lead.id===id),'New employee sees the lead');
 const edited=await admin.json(path,{priority:'high',company:'Internal test company'});assert.equal(edited.status,200);assert.equal((await edited.json()).lead.assignedTo,two.id,'Independent edits cannot revert assignment');
 const invalid=await admin.json(path,{assignedTo:randomUUID()});assert.equal(invalid.status,400);
 const cleared=await admin.json(path,{assignedTo:''});assert.equal(cleared.status,200);assert.equal((await cleared.json()).lead.assignedTo,'');
 for(const path of ['/api/admin/developer/funds','/api/admin/developer/search']){
  for(const actor of [admin,one,two])assert.equal((await actor.json(path,{},'POST')).status,403,'Growth edits stay developer-only');
  assert.equal((await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'})).status,403,'Anonymous growth edits are denied');
 }
 console.log('Passed: admin assignment/unassignment, employee scope transition, staff denial, invalid assignee rejection, independent-edit preservation and developer-only funds.');
}finally{
 if(id){const result=await db.from('leads').delete().eq('id',id).eq('name',name);assert.ifError(result.error);}
}
