import 'server-only';
import { unstable_cache } from 'next/cache';
import baseline from '../../reports/ai-visibility-2026-11-24.json';
import { getSupabaseAdmin } from './supabase';
import { getSiteOrigin } from './runtime-config';
import { summarizeAds, type IntegrationReport } from './integration-types';
import { hasOrganizationSchema, validateSearchSnapshot, type FundsSnapshot, type SearchSnapshot } from './developer-growth-policy';
import type { DeveloperAnalyticsSummary } from './developer-panel';

type Check={label:string;ok:boolean;url:string};
const publicChecks=unstable_cache(async(origin:string)=>{
  const paths=['/','/sitemap.xml','/robots.txt','/llms.txt'];
  const pages=await Promise.all(paths.map(async path=>{try{const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(6000)});return {ok:response.ok,text:response.ok?(await response.text()).slice(0,1500000):''};}catch{return {ok:false,text:''};}}));
  const home=pages[0];
  return {checkedAt:new Date().toISOString(),checks:[
    {label:'Homepage reachable',ok:home.ok,url:origin+'/'},
    {label:'Title and description present',ok:home.ok&&/<title>[^<]+<\/title>/i.test(home.text)&&/<meta[^>]+name=["']description["'][^>]+content=["'][^"']+/i.test(home.text),url:origin+'/'},
    {label:'Organization JSON-LD',ok:home.ok&&hasOrganizationSchema(home.text),url:origin+'/'},
    {label:'Canonical link present',ok:home.ok&&/<link[^>]+rel=["']canonical["'][^>]+href=/i.test(home.text),url:origin+'/'},
    {label:'XML sitemap accessible',ok:pages[1].ok&&/<(?:urlset|sitemapindex)\b/.test(pages[1].text),url:origin+'/sitemap.xml'},
    {label:'robots.txt accessible',ok:pages[2].ok&&/user-agent:/i.test(pages[2].text),url:origin+'/robots.txt'},
    {label:'AI page map accessible',ok:pages[3].ok&&/spectra/i.test(pages[3].text),url:origin+'/llms.txt'},
  ] as Check[]};
},['developer-public-seo-checks-v1'],{revalidate:900});

export async function getGrowthResources(){
  const [funds,health,search]=await Promise.all([
    getSupabaseAdmin().from('developer_funds_snapshots').select('provider,amount,currency,observed_at,recorded_at,recorded_by').limit(2),
    publicChecks(getSiteOrigin().replace(/\/$/,'')),
    getSupabaseAdmin().from('developer_search_snapshots').select('payload,recorded_at').eq('site_url','https://spectrapackmachines.com/').maybeSingle(),
  ]);
  let searchReport:SearchSnapshot|null=null;
  try{if(search.data?.payload)searchReport=validateSearchSnapshot(search.data.payload,Date.now(),true);}catch{/* Invalid reports stay unavailable instead of showing invented totals. */}
  return {fundsReady:!funds.error,funds:(funds.data||[]).map(row=>({...row,amount:Number(row.amount)})) as FundsSnapshot[],health,searchReady:!search.error,searchReport};
}

export function growthSummary(report:IntegrationReport|null,analytics:DeveloperAnalyticsSummary,resources:Awaited<ReturnType<typeof getGrowthResources>>){
  return {
    fundsReady:resources.fundsReady,
    ads:(['google','meta'] as const).map(provider=>{
      const configured=!!report?.connections.find(row=>row.name===provider)?.configured;
      const sync=report?.syncs.find(row=>row.provider===provider);
      const complete=!!report&&report.databaseReady&&sync?.status==='ok'&&sync.range_start<=report.since&&sync.range_end>=report.until;
      const fresh=complete&&Date.now()-Date.parse(sync!.completed_at)<48*3600000;
      const rows=report?.metrics.filter(row=>row.provider===provider)||[];
      const campaigns=report?.campaigns.filter(row=>row.provider===provider)||[];
      return {provider,configured,status:!configured?'Not connected':!sync?'Not synced':sync.status!=='ok'?'Sync needs attention':fresh?'Synced':'Report needs refresh',syncedAt:sync?.completed_at||null,since:report?.since||'',until:report?.until||'',complete,fresh,
        metrics:rows.length||complete?summarizeAds(rows):[],
        activeCampaigns:campaigns.filter(row=>['ACTIVE','ENABLED','ELIGIBLE','LIMITED_BY_BUDGET'].includes(row.status.toUpperCase())).length,
        pausedCampaigns:campaigns.filter(row=>row.status.toUpperCase()==='PAUSED').length,
        campaignCount:campaigns.length,
        accountSpend:report?.accountSpend.filter(row=>row.provider===provider)||[],
        funds:resources.funds.find(row=>row.provider===provider)||null,
        alerts:report?.alerts.filter(row=>row.provider===provider).slice(0,3)||[],
      };
    }),
    seo:{...resources.health,traffic:analytics.discovery,analyticsAvailable:analytics.status==='available',sampleLimited:analytics.sampleLimited,windowDays:analytics.windowDays,searchReady:resources.searchReady,searchReport:resources.searchReport},
    geo:{date:baseline.snapshot_dates[0],overall:baseline.overall,service:baseline.service_queries,brand:baseline.brand_queries,platforms:Object.entries(baseline.by_platform).map(([name,value])=>({name,responses:value.responses,mentions:value.mentions,rate:value.mention_rate_percent})),limitations:baseline.limitations.slice(0,2)},
  };
}
export type DeveloperGrowthSummary=ReturnType<typeof growthSummary>;
