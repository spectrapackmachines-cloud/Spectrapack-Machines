'use client';
import {useState} from 'react';
import {ArrowUpRight,CheckCircle2,RefreshCw,Search,Sparkles,Wallet,XCircle} from 'lucide-react';
import type {DeveloperGrowthSummary} from '@/lib/developer-growth';
import {parseSearchConsoleDates} from '@/lib/developer-growth-policy';
import styles from './GrowthOverview.module.css';

const count=(value:number)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(value);
const money=(amount:number,currency:string)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(amount);
const date=(value:string)=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
const localNow=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);

export default function GrowthOverview({data,onRefresh}:{data:DeveloperGrowthSummary;onRefresh:()=>Promise<void>}){
  const [editing,setEditing]=useState<'google'|'meta'|null>(null),[amount,setAmount]=useState(''),[currency,setCurrency]=useState('INR'),[observed,setObserved]=useState(localNow);
  const [saving,setSaving]=useState(false),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const search=data.seo.searchReport;
  const sync=async()=>{
    setSyncing(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/crm/integrations',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sync'}),signal:AbortSignal.timeout(65000)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'Ads sync failed.');
      const failed=(result.results||[]).filter((item:{status:string})=>item.status!=='ok');
      setNotice(failed.length?'Sync finished with connection issues. Previous reports remain visible.':'Ads reports updated.');await onRefresh();
    }catch(error){setError(error instanceof Error?error.message:'Sync is unavailable. Refresh the saved report before retrying.');}finally{setSyncing(false);}
  };
  return <section className={styles.overview} aria-labelledby="growth-title">
    <header className={styles.header}><div><span className={styles.eyebrow}>BUSINESS OVERVIEW</span><h2 id="growth-title">Ads, funds & search visibility</h2><p>One view for advertising, recorded billing funds, SEO and AI visibility.</p></div><button onClick={()=>void sync()} disabled={syncing||saving}><RefreshCw size={16} className={syncing?styles.spin:''}/>{syncing?'Syncing ads…':'Sync ads'}</button></header>
    <nav className={styles.jump} aria-label="Business overview sections"><a href="#overview-ads">Ads & funds</a><a href="#overview-seo">SEO</a><a href="#overview-geo">GEO / AI visibility</a><a href="#workforce-heading">Team activity</a></nav>
    {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.ads} id="overview-ads">{data.ads.map(ad=>{
      const name=ad.provider==='google'?'Google Ads':'Meta Ads',snapshot=ad.funds,stale=!!snapshot&&Date.now()-Date.parse(snapshot.observed_at)>86400000;
      const billing=ad.provider==='google'?'https://ads.google.com/aw/billing/summary':'https://business.facebook.com/billing_hub';
      return <article className={styles.ad} key={ad.provider}><div className={styles.title}><h3>{name}</h3><span data-good={ad.fresh}>{ad.status}</span></div>
        <div className={styles.funds}><div><span><Wallet size={15}/>Last recorded available funds</span><strong>{snapshot?money(snapshot.amount,snapshot.currency):'Not recorded'}</strong><small>{snapshot?`${stale?'Needs update · ':''}Billing snapshot · ${date(snapshot.observed_at)}`:'Record the available amount shown in this account’s billing page.'}</small></div><button disabled={!data.fundsReady||saving} onClick={()=>{setEditing(editing===ad.provider?null:ad.provider);setAmount(snapshot?String(snapshot.amount):'');setCurrency(snapshot?.currency||ad.metrics[0]?.currency||'INR');setObserved(localNow());setError('');}}>Update funds</button></div>
        {editing===ad.provider&&<form className={styles.form} onSubmit={async event=>{
          event.preventDefault();setSaving(true);setError('');
          try{const response=await fetch('/api/admin/developer/funds',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:ad.provider,amount:Number(amount),currency:currency.toUpperCase(),observedAt:new Date(observed).toISOString()})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save the funds snapshot.');await onRefresh();setEditing(null);setNotice('Billing snapshot saved. This records funds; it does not add money or change an ad budget.');}
          catch(error){setError(error instanceof Error?error.message:'Could not save snapshot.');}finally{setSaving(false);}
        }}><p>Read available funds in {name} billing, then record that amount and time here.</p><label>Available amount<input type="number" min="0" max="1000000000000" step="0.01" required value={amount} onChange={event=>setAmount(event.target.value)} disabled={saving}/></label><label>Currency<input maxLength={3} pattern="[A-Za-z]{3}" required value={currency} onChange={event=>setCurrency(event.target.value.toUpperCase())} disabled={saving}/></label><label>Observed at<input type="datetime-local" required value={observed} onChange={event=>setObserved(event.target.value)} disabled={saving}/></label><button disabled={saving}>{saving?'Saving…':'Save billing snapshot'}</button><button type="button" disabled={saving} onClick={()=>setEditing(null)}>Cancel</button></form>}
        <p className={styles.caption}>Funds are developer-recorded billing observations. API spend and spending caps are separate figures.</p>
        <div className={styles.metrics}>{ad.metrics.map(metric=><div key={metric.currency}><strong>{money(metric.spend,metric.currency)}</strong><span>Campaign spend · {metric.currency}</span><small>{count(metric.impressions)} impressions · {count(metric.clicks)} clicks · {count(metric.conversions)} platform conversions</small></div>)}{!ad.metrics.length&&<p>{ad.complete?'No campaign performance rows returned for this period.':'A complete performance report is not available yet.'}</p>}</div>
        <p className={styles.caption}>{ad.since&&`${ad.since} – ${ad.until}. `}{ad.syncedAt?`Last sync ${date(ad.syncedAt)}.`:'No completed sync recorded.'}{!ad.fresh&&' Saved data may be stale or incomplete.'}</p>
        <p>{ad.activeCampaigns} active · {ad.pausedCampaigns} paused · {ad.campaignCount} stored campaigns</p>
        {ad.accountSpend.filter(account=>account.currency==='INR').map(account=><div className={styles.billing} key={account.account_id}><span>Meta bill due <b>{money(account.balance_due/100,'INR')}</b></span><span>Spending-cap remaining <b>{account.spend_cap>0?money(Math.max(0,account.spend_cap-account.amount_spent)/100,'INR'):'No cap recorded'}</b></span><small>Account billing snapshot: {date(account.synced_at)}. Bill due and cap remaining do not measure prepaid funds.</small></div>)}
        {ad.alerts.map(alert=><p className={styles.alert} key={alert.id}>{alert.message}</p>)}
        <a className={styles.external} href={billing} target="_blank" rel="noreferrer">Open {name} billing <ArrowUpRight size={15}/></a>
      </article>;
    })}</div>
    {!data.fundsReady&&<p className={styles.error}>Private billing snapshot storage needs activation. Ads reports remain available.</p>}
    <div className={styles.discovery}>
      <article id="overview-seo"><header><Search size={22}/><div><h3>SEO · search discovery</h3><p>Technical checks and consented website traffic</p></div></header>
        {search&&<><div className={styles.stats}><div><strong>{count(search.clicks)}</strong><span>Google search clicks</span></div><div><strong>{count(search.impressions)}</strong><span>Search impressions</span></div><div><strong>{search.position===null?'—':search.position.toFixed(1)}</strong><span>Avg position · daily export</span></div></div><p className={styles.caption}>Search Console CSV · {search.since} – {search.until} · {search.impressions?((search.clicks/search.impressions)*100).toFixed(2):'0'}% CTR. Imported {date(search.observedAt)}. Position is impression-weighted from daily export values.</p></>}
        <div className={styles.stats}><div><strong>{data.seo.analyticsAvailable?count(data.seo.traffic.organicVisitors):'—'}</strong><span>Organic visitors</span></div><div><strong>{data.seo.analyticsAvailable?count(data.seo.traffic.organicLeads):'—'}</strong><span>Organic enquiries</span></div><div><strong>{data.seo.checks.filter(check=>check.ok).length}/{data.seo.checks.length}</strong><span>Technical checks passed</span></div></div>
        <p className={styles.caption}>Last {data.seo.windowDays} days of captured analytics{data.seo.sampleLimited?' · latest-event sample':''}. Visits are not search impressions or Google rankings.</p>
        <ul className={styles.checks}>{data.seo.checks.map(check=><li key={check.label}>{check.ok?<CheckCircle2 size={16}/>:<XCircle size={16}/>}<a href={check.url} target="_blank" rel="noreferrer">{check.label}</a><span>{check.ok?'Passed':'Needs review'}</span></li>)}</ul>
        <p className={styles.caption}>Public pages checked {date(data.seo.checkedAt)}; results refresh about every 15 minutes. Search Console performance uses an imported daily CSV snapshot, not an automatic API connection.</p>
        <label className={styles.import}> {saving?'Importing…':'Import Search Console Chart.csv'}<input type="file" accept=".csv,text/csv" disabled={saving||!data.seo.searchReady} onChange={async event=>{
          const file=event.target.files?.[0];event.target.value='';if(!file)return;
          setSaving(true);setError('');
          try{if(file.size>2000000)throw new Error('Choose the daily Chart.csv file, up to 2 MB.');const payload=parseSearchConsoleDates(await file.text());const response=await fetch('/api/admin/developer/search',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Search report import failed.');await onRefresh();setNotice('Search Console daily report imported.');}
          catch(error){setError(error instanceof Error?error.message:'Import failed.');}finally{setSaving(false);}
        }}/></label><p className={styles.caption}>In Search Console choose a date range → Export → Download CSV, then unzip and choose Chart.csv. Query exports exclude anonymised searches and are not accepted as site totals.</p><a className={styles.external} href="https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fspectrapackmachines.com%2F" target="_blank" rel="noreferrer">Open Search Console <ArrowUpRight size={15}/></a>
      </article>
      <article id="overview-geo"><header><Sparkles size={22}/><div><h3>GEO · AI visibility</h3><p>Uploaded audit baseline · {data.geo.date}</p></div></header>
        <div className={styles.stats}><div><strong>{data.geo.overall.mention_rate_percent}%</strong><span>Overall mention rate</span></div><div><strong>{data.geo.service.mention_rate_percent}%</strong><span>Service query mentions</span></div><div><strong>{data.seo.analyticsAvailable?count(data.seo.traffic.aiVisitors):'—'}</strong><span>Captured AI referrals</span></div></div>
        <p className={styles.caption}>{data.geo.overall.mentions} mentions across {data.geo.overall.responses} audit responses; service queries {data.geo.service.mentions}/{data.geo.service.responses}. AI referrals use the current {data.seo.windowDays}-day website analytics window.</p>
        <div className={styles.platforms}>{data.geo.platforms.map(platform=><div key={platform.name}><strong>{platform.name}</strong><span>{platform.mentions}/{platform.responses} mentions</span><b>{platform.rate}%</b></div>)}</div>
        <p className={styles.caption}>Historical exported observations, not a live AI ranking check. Repeated prompts and brand mentions do not prove service ranking gains. Run another audit in your AI visibility tool to measure change.</p>
      </article>
    </div>
  </section>;
}
