'use client';
import { useRef, useState } from 'react';
import { Check, LoaderCircle, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { isCrmStaffRole, type CrmLead, type CrmTeamMember } from '@/lib/crm-types';
import styles from './QuickAssign.module.css';

export default function QuickAssign({lead,team,onAssigned,disabled=false}:{lead:CrmLead;team:CrmTeamMember[];onAssigned:(lead:CrmLead)=>void;disabled?:boolean}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const pending=useRef(false);
  const employees=team.filter(member=>member.active&&isCrmStaffRole(member.role));
  const assignedEmployee=employees.some(member=>member.userId===lead.assignedTo);
  return <div className={styles.assign} onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
    <label className={styles.control}>
      {busy?<LoaderCircle size={15} className={styles.spin}/>:saved?<Check size={15}/>:<UserRound size={15}/>}
      <select aria-label={`Assign ${lead.name} to employee`} value={lead.assignedTo} disabled={busy||disabled} onChange={async event=>{
        const assignedTo=event.target.value;
        if(pending.current||assignedTo===lead.assignedTo)return;
        pending.current=true;setBusy(true);setError('');setSaved(false);
        try {
          const response=await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}`,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignedTo})});
          const result=await response.json();
          if(!response.ok)throw new Error(result.error||'Assignment could not be saved.');
          onAssigned(result.lead);setSaved(true);toast.success(assignedTo?'Lead assigned':'Lead unassigned');
        } catch(error){setError(error instanceof Error?error.message:'Assignment could not be saved.');}
        finally{pending.current=false;setBusy(false);}
      }}>
        <option value="">Assign employee</option>
        {lead.assignedTo&&!assignedEmployee&&<option value={lead.assignedTo} disabled>{lead.assigneeName} (current)</option>}
        {employees.map(member=><option key={member.userId} value={member.userId}>{member.displayName} · {member.email.split('@')[0]}</option>)}
      </select>
    </label>
    {busy&&<small role="status">Saving assignment…</small>}
    {error&&<small className={styles.error} role="alert">{error} Select again to retry.</small>}
    {!employees.length&&<small>No active employees. Add one in Team.</small>}
  </div>;
}
