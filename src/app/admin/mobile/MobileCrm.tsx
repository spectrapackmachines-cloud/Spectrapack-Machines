'use client';
import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Activity, CalendarDays, ChevronRight, Inbox, Mail, MessageCircle, Phone, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CrmLead, CrmWorkspace } from '@/lib/crm-types';
import { LEAD_STATUS_LABELS } from '@/lib/lead-status';
import { useWorkTracking, WorkTrackingStatus } from '@/components/admin/WorkTracking';
import MobileLead from './MobileLead';
import NewLead from './NewLead';
import styles from './mobile.module.css';
import QuickAssign from '@/components/admin/QuickAssign';

const finalStages = ['won','lost','spam'];
export default function MobileCrm() {
  const [data, setData] = useState<CrmWorkspace | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'leads'|'today'|'activity'|'profile'>('leads');
  const [filter, setFilter] = useState('all'); const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase()); const [limit, setLimit] = useState(20);
  const [selection, setSelection] = useState<{ id: string; channel?: 'call'|'whatsapp'|'email' } | null>(null);
  const [adding, setAdding] = useState(false);
  const work = useWorkTracking(); const workRef = useRef(work); workRef.current = work;
  const requestIds = useRef(new Map<string,string>());
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/crm', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) { location.assign('/admin/login?callbackUrl=/admin/mobile'); return; }
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load your leads.');
      setData(result); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Check your connection.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelection(null); setAdding(false); } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  useEffect(() => { setLimit(20); }, [query, tab, filter]);
  useEffect(() => { const back = (event: Event) => { if (selection || adding) { event.preventDefault(); setSelection(null); setAdding(false); } else if (tab !== 'leads') { event.preventDefault(); setTab('leads'); } }; window.addEventListener('spectra-native-back', back); return () => window.removeEventListener('spectra-native-back', back); }, [selection, adding, tab]);
  useEffect(() => { if (data && !selection) { const id = new URLSearchParams(location.search).get('lead'); if (id && data.leads.some(lead => lead.id === id)) { setSelection({ id }); history.replaceState({}, '', '/admin/mobile'); } } }, [data, selection]);
  const open = (lead: CrmLead, channel?: 'call'|'whatsapp'|'email') => { setSelection({ id: lead.id, channel }); void workRef.current.event({ eventType: 'lead_open', leadId: lead.id }); };
  const update = (lead: CrmLead) => setData(current => current ? { ...current, leads: current.leads.map(item => item.id === lead.id ? lead : item) } : current);
  const leads = data?.leads || [];
  const due = (lead: CrmLead) => !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < new Date().setHours(23,59,59,999) && !finalStages.includes(lead.status);
  const matches = leads.filter(lead => (tab !== 'today' || due(lead)) && (tab === 'today' || filter !== 'new' || lead.status === 'new') && (tab === 'today' || filter !== 'mine' || lead.assignedTo === data?.viewer.userId)
    && (!query || [lead.name,lead.company,lead.phone,lead.email,lead.machineInterest].join(' ').toLowerCase().includes(query)));
  if (tab === 'today') matches.sort((a,b) => String(a.nextFollowUpAt).localeCompare(String(b.nextFollowUpAt)));
  const selected = selection ? leads.find(lead => lead.id === selection.id) : null;
  return <main className={styles.app}>
    <header className={styles.header}><div><span>SPECTRA CRM</span><h1>{tab === 'today' ? 'Your follow-ups' : tab === 'activity' ? 'Work history' : tab === 'profile' ? 'Your workspace' : 'Let’s move work forward'}</h1><p>{data?.viewer.displayName || 'Loading your workspace'}{data ? ` · ${data.viewer.canManageTeam ? 'Admin' : 'Employee'}` : ''}</p></div><button aria-label="Refresh CRM" disabled={busy} onClick={() => void refresh()}><RefreshCw size={21} className={busy ? styles.spinning : ''} /></button></header>
    <div className={styles.trackingBar}><span>CRM activity recorded</span><button onClick={() => setTab('profile')}>{work.native && work.consent && work.native.location === 'on' ? 'Location on' : 'Location off'}</button></div>
    <div className={styles.content}>
      {error && <div className={styles.error} role="alert">{error}<button onClick={() => void refresh()}>Retry</button></div>}
      {!data && !error && <div className={styles.skeleton} aria-label="Loading your leads" aria-busy="true"><div /><div /><div /></div>}
      {data && (tab === 'leads' || tab === 'today') && <>
        <div className={styles.summary}><button onClick={() => { setFilter('new'); setTab('leads'); }}><strong>{leads.filter(lead => lead.status === 'new').length}</strong><span>New leads</span></button><button onClick={() => setTab('today')}><strong>{leads.filter(due).length}</strong><span>Follow-ups due</span></button><button onClick={() => { setFilter('all'); setTab('leads'); }}><strong>{data.totalLeadCount}</strong><span>{data.viewer.canViewAllLeads ? 'Total leads' : 'My leads'}</span></button></div>
        <div className={styles.search}><Search size={20} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, company or phone" aria-label="Search leads" /><button aria-label="Add lead" onClick={() => setAdding(true)}><Plus size={22} /></button></div>
        {tab === 'leads' && <div className={styles.filters}>{[['all','All leads'],['new','New'],['mine','Assigned to me']].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}
        <div className={styles.list}>{matches.slice(0,limit).map(lead => <article className={styles.card} key={lead.id}>
          <button className={styles.openCard} onClick={() => open(lead)}><div><span className={styles.stage} data-stage={lead.status}>{LEAD_STATUS_LABELS[lead.status]}</span><h2>{lead.name}</h2><p>{lead.company || 'Customer enquiry'}</p><strong>{lead.machineInterest || 'Discuss packaging requirement'}</strong>{lead.nextFollowUpAt && <small className={due(lead) ? styles.due : ''}><CalendarDays size={13} />{new Date(lead.nextFollowUpAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small>}</div><ChevronRight size={19} /></button>
          {data.viewer.canManageTeam && <div className={styles.assignment}><QuickAssign lead={lead} team={data.team} onAssigned={update}/></div>}
          <div className={styles.cardActions}><button disabled={!lead.phone} onClick={() => open(lead,'call')}><Phone size={17} />Call</button><button disabled={!lead.phone} onClick={() => open(lead,'whatsapp')}><MessageCircle size={17} />WhatsApp</button><button disabled={!lead.email} onClick={() => open(lead,'email')}><Mail size={17} />Email</button></div>
        </article>)}</div>
        {!matches.length && <div className={styles.empty}><Inbox size={34} /><h2>{tab === 'today' ? 'You’re up to date' : 'No leads here yet'}</h2><p>{tab === 'today' ? 'Your scheduled follow-ups will appear here.' : data.viewer.canViewAllLeads ? 'Try another search or add a customer enquiry.' : 'Your assigned leads will appear here. You can also add a phone or WhatsApp enquiry.'}</p><button onClick={() => setAdding(true)}>Add a lead</button></div>}
        {matches.length > limit && <button className={styles.loadMore} onClick={() => setLimit(limit + 20)}>Show more leads</button>}
        {data.hasMoreLeads && <p className={styles.help}>Showing the latest {data.leads.length} leads. Use the full workspace for older records.</p>}
      </>}
      {data && tab === 'activity' && <><p className={styles.help}>Lead changes, messages and employee-reported outcomes. An app launch alone does not confirm contact.</p><div className={styles.timeline}>{data.recentActivities.map(activity => <button key={activity.id} onClick={() => { const lead = leads.find(item => item.id === activity.leadId); if (lead) open(lead); }}><span className={styles.timelineDot} /><div><strong>{activity.actorName}</strong><p>{activity.body}</p><small>{activity.leadName} · {new Date(activity.createdAt).toLocaleString('en-IN')}</small></div></button>)}{!data.recentActivities.length && <p>No work updates yet. Calls, notes and outcomes will appear here.</p>}</div></>}
      {data && tab === 'profile' && <><section className={styles.profile}><div className={styles.avatar}>{data.viewer.displayName.slice(0,2).toUpperCase()}</div><h2>{data.viewer.displayName}</h2><p>{data.viewer.email}</p><span>{data.viewer.canManageTeam ? 'Admin workspace' : 'Employee workspace'}</span></section><section className={styles.panel}><h2>Work visibility</h2><WorkTrackingStatus detailed /></section>{data.viewer.canManageTeam && <section className={styles.panel}><h2>Your team</h2>{data.team.map(member => <div className={styles.member} key={member.userId}><div><strong>{member.displayName}</strong><small>{member.email}</small></div><span>{member.active ? 'Active' : 'Disabled'}</span></div>)}</section>}<a className={styles.loadMore} href="/admin/leads">Open full CRM workspace</a><button className={styles.signOut} onClick={() => { window.SpectraCRM?.request({ type: 'location_stop' }).catch(() => undefined); void signOut({ callbackUrl: '/admin/login' }); }}>Sign out</button></>}
    </div>
    <nav className={styles.tabs} aria-label="CRM navigation">{([{ value:'leads',label:'Leads',icon:Inbox },{value:'today',label:'Follow-ups',icon:CalendarDays},{value:'activity',label:'Activity',icon:Activity},{value:'profile',label:'Profile',icon:UserRound}] as const).map(({value,label,icon:Icon}) => <button key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}><Icon size={22} /><span>{label}</span></button>)}</nav>
    {selected && data && <MobileLead key={`${selected.id}:${selection?.channel || ''}`} lead={selected} workspace={data} initialChannel={selection?.channel} requestIds={requestIds.current} onUpdate={update} onClose={() => { setSelection(null); void refresh(); }} />}
    {adding && <NewLead onClose={() => setAdding(false)} onAdded={lead => { setAdding(false); setData(current => current ? { ...current, leads: [lead,...current.leads], totalLeadCount: current.totalLeadCount + 1 } : current); toast.success('Lead added'); open(lead); }} />}
  </main>;
}
