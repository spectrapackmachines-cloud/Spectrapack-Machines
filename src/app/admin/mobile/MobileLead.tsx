'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CrmActivity, CrmLead, CrmWorkspace } from '@/lib/crm-types';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from '@/lib/lead-status';
import CrmCommunications from '../leads/CrmCommunications';
import styles from './mobile.module.css';
import QuickAssign from '@/components/admin/QuickAssign';
import { useMobileDialog } from './useMobileDialog';

const localDate = (value: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
export default function MobileLead({ lead, workspace, onUpdate, onClose, initialChannel, requestIds }: {
  lead: CrmLead; workspace: CrmWorkspace; onUpdate: (lead: CrmLead) => void; onClose: () => void;
  initialChannel?: 'call'|'whatsapp'|'email'; requestIds: Map<string,string>;
}) {
  const dialog = useMobileDialog();
  const [stage, setStage] = useState<LeadStatus>(lead.status), [followup,setFollowup] = useState(localDate(lead.nextFollowUpAt));
  const [note,setNote] = useState('');
  const [activities,setActivities] = useState<CrmActivity[]>([]), [saving,setSaving] = useState(false);
  useEffect(() => { let active = true; fetch(`/api/crm/leads/${lead.id}/activities`, { cache:'no-store' }).then(response => response.json()).then(data => { if (active && Array.isArray(data.activities)) setActivities(data.activities); }).catch(() => undefined); return () => { active = false; }; }, [lead.id]);
  const save = async () => {
    if (saving) return; setSaving(true);
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status:stage, nextFollowUpAt: followup ? new Date(followup).toISOString() : null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save changes.');
      onUpdate(data.lead); toast.success('Lead updated');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save changes.'); } finally { setSaving(false); }
  };
  const addNote = async () => {
    if (!note.trim() || saving) return; setSaving(true);
    try {
      const response = await fetch(`/api/crm/leads/${lead.id}/activities`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ activityType:'note',body:note,contactStatus:'not_applicable' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not save note.');
      setActivities(current => [data.activity,...current]); setNote(''); toast.success('Note added');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save note.'); } finally { setSaving(false); }
  };
  return <section ref={dialog} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="mobile-lead-title" data-crm-dialog>
    <header className={styles.sheetHeader}><button onClick={onClose} aria-label="Close lead"><ArrowLeft /></button><div><h2 id="mobile-lead-title">{lead.name}</h2><p>{lead.company || 'Customer enquiry'}</p></div></header>
    <div className={styles.sheetContent}>
      <section className={styles.panel}><span className={styles.stage} data-stage={lead.status}>{LEAD_STATUS_LABELS[lead.status]}</span><h3>{lead.machineInterest || 'Packaging requirement'}</h3><p className={styles.message}>{lead.message || 'Add notes after speaking with the customer.'}</p><small>{lead.phone}{lead.email ? ` · ${lead.email}` : ''}</small></section>
      <section className={styles.panel}><CrmCommunications mobile initialChannel={initialChannel} lead={lead} {...workspace.capabilities} requestIds={requestIds} onActivity={activity => setActivities(current => [activity,...current.filter(item => item.id !== activity.id)])} /></section>
      <section className={styles.panel}><h3>Next steps</h3><label>Lead stage<select value={stage} onChange={event => setStage(event.target.value as LeadStatus)}>{LEAD_STATUSES.map(value => <option key={value} value={value}>{LEAD_STATUS_LABELS[value]}</option>)}</select></label><label><span><CalendarDays size={15} /> Follow-up date and time</span><input type="datetime-local" value={followup} onChange={event => setFollowup(event.target.value)} /></label>{workspace.viewer.canManageTeam && <div><p className={styles.help}>Assigned employee · saves immediately</p><QuickAssign lead={lead} team={workspace.team} onAssigned={onUpdate} disabled={saving}/></div>}<button className={styles.primary} disabled={saving} onClick={() => void save()}><Save size={17} />{saving ? 'Saving…' : 'Save changes'}</button></section>
      <section className={styles.panel}><h3>Add a work note</h3><textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} placeholder="Requirement, conversation or next action" aria-label="Work note" /><button className={styles.primary} disabled={saving || !note.trim()} onClick={() => void addNote()}><Send size={17} />Save note</button></section>
      <section className={styles.panel}><h3>Lead history</h3><div className={styles.timeline}>{activities.map(activity => <div key={activity.id}><span className={styles.timelineDot} /><section><strong>{activity.actorName}</strong><p>{activity.body}</p><small>{new Date(activity.createdAt).toLocaleString('en-IN')}{activity.metadata?.source === 'employee_report' ? ' · Employee reported' : ''}</small></section></div>)}{!activities.length && <p>No work updates yet.</p>}</div></section>
    </div>
  </section>;
}
