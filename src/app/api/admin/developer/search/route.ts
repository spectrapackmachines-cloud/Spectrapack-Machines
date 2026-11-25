import {getServerSession} from 'next-auth';
import {NextRequest,NextResponse} from 'next/server';
import {authOptions} from '@/lib/auth-options';
import {getDeveloperAccess} from '@/lib/developer-access';
import {getDeveloperPinState,isDeveloperPinUnlocked} from '@/lib/developer-pin';
import {getSupabaseAdmin} from '@/lib/supabase';
import {validateSearchSnapshot} from '@/lib/developer-growth-policy';
import {CRM_PRIVATE_HEADERS,isTrustedCrmMutation,readCrmInput,crmOriginResponse} from '@/lib/crm-http';
import {enforceMappedRateLimit} from '@/lib/rate-limit';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
  const session=await getServerSession(authOptions);
  if(!(await getDeveloperAccess(session)).allowed)return NextResponse.json({error:'Developer access required.'},{status:403,headers:CRM_PRIVATE_HEADERS});
  const pin=await getDeveloperPinState();
  if(!pin.available||!pin.configured||!(await isDeveloperPinUnlocked(String(session?.user?.id||''),pin)))return NextResponse.json({error:'Unlock the developer PIN first.'},{status:423,headers:CRM_PRIVATE_HEADERS});
  if(!isTrustedCrmMutation(req))return crmOriginResponse();
  const quota=await enforceMappedRateLimit(req,'adminWrites');if(quota.limitedResponse)return quota.limitedResponse;
  let payload;
  try{payload=validateSearchSnapshot(await readCrmInput(req));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid search report.'},{status:400,headers:CRM_PRIVATE_HEADERS});}
  const result=await getSupabaseAdmin().from('developer_search_snapshots').upsert({site_url:'https://spectrapackmachines.com/',payload,recorded_at:new Date().toISOString(),recorded_by:session!.user!.id},{onConflict:'site_url'});
  if(result.error)return NextResponse.json({error:'Private search report storage is unavailable.'},{status:503,headers:CRM_PRIVATE_HEADERS});
  return NextResponse.json({saved:true},{headers:CRM_PRIVATE_HEADERS});
}
