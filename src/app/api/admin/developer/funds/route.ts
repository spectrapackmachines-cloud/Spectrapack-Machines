import {getServerSession} from 'next-auth';
import {NextRequest,NextResponse} from 'next/server';
import {authOptions} from '@/lib/auth-options';
import {getDeveloperAccess} from '@/lib/developer-access';
import {getDeveloperPinState,isDeveloperPinUnlocked} from '@/lib/developer-pin';
import {getSupabaseAdmin} from '@/lib/supabase';
import {validateFundsSnapshot} from '@/lib/developer-growth-policy';
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
  let snapshot;
  try{snapshot=validateFundsSnapshot(await readCrmInput(req));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid billing snapshot.'},{status:400,headers:CRM_PRIVATE_HEADERS});}
  const result=await getSupabaseAdmin().from('developer_funds_snapshots').upsert({...snapshot,recorded_at:new Date().toISOString(),recorded_by:session!.user!.id},{onConflict:'provider'});
  if(result.error)return NextResponse.json({error:'Billing snapshot storage is unavailable. Apply the developer funds migration.'},{status:503,headers:CRM_PRIVATE_HEADERS});
  return NextResponse.json({saved:true},{headers:CRM_PRIVATE_HEADERS});
}
