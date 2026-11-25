export type FundsSnapshot = {provider:'google'|'meta';amount:number;currency:string;observed_at:string;recorded_at:string;recorded_by:string};
export type SearchSnapshot={since:string;until:string;clicks:number;impressions:number;position:number|null;observedAt:string;days:number};
export function validateSearchSnapshot(input:Record<string,unknown>,now=Date.now(),allowHistorical=false):SearchSnapshot{
  const since=String(input.since||''),until=String(input.until||'');
  for(const value of [since,until])if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('Use valid report dates.');
  const length=(Date.parse(until)-Date.parse(since))/86400000;
  if(length<0||length>365||Date.parse(until)>now)throw new Error('Use a past report period of up to one year.');
  for(const value of [input.clicks,input.impressions])if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1e12)throw new Error('Search counts must be non-negative integers.');
  if(input.position!==null&&(typeof input.position!=='number'||!Number.isFinite(input.position)||input.position<0||input.position>10000))throw new Error('Average position is invalid.');
  const observed=typeof input.observedAt==='string'?Date.parse(input.observedAt):NaN;
  if(!Number.isFinite(observed)||observed>now+60000||(!allowHistorical&&now-observed>30*86400000))throw new Error('Use a recent report observation time.');
  if(typeof input.days!=='number'||!Number.isInteger(input.days)||input.days<1||input.days>length+1)throw new Error('The report row count is invalid.');
  return {since,until,clicks:input.clicks as number,impressions:input.impressions as number,position:input.position as number|null,observedAt:new Date(observed).toISOString(),days:input.days};
}

/** Search Console Chart.csv only: query exports omit anonymised queries. */
export function parseSearchConsoleDates(csv:string,now=Date.now()):SearchSnapshot{
  if(csv.length>2000000)throw new Error('The daily report is too large.');
  const records:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let index=0;index<csv.length;index++){
    const char=csv[index];
    if(char==='"'){if(quoted&&csv[index+1]==='"'){field+='"';index++;}else if(quoted||field==='')quoted=!quoted;else throw new Error('Malformed CSV quotes.');}
    else if(char===','&&!quoted){row.push(field);field='';}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&csv[index+1]==='\n')index++;row.push(field);if(row.some(Boolean))records.push(row);row=[];field='';}
    else field+=char;
  }
  if(quoted)throw new Error('Malformed CSV quotes.');row.push(field);if(row.some(Boolean))records.push(row);
  const header=records.shift()?.map(value=>value.replace(/^\uFEFF/,'').trim().toLowerCase())||[];
  const indexes=['date','clicks','impressions','position'].map(key=>header.indexOf(key));
  if(indexes.some(index=>index<0))throw new Error('Choose Chart.csv (daily dates), not a queries or pages export.');
  if(!records.length||records.length>366)throw new Error('Use a daily report of up to one year.');
  const seen=new Set<string>();let clicks=0,impressions=0,weighted=0;
  for(const record of records){
    const date=record[indexes[0]]?.trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||seen.has(date))throw new Error('Report dates must be unique valid YYYY-MM-DD values.');seen.add(date);
    const clickText=record[indexes[1]]?.replace(/,/g,'').trim(),impressionText=record[indexes[2]]?.replace(/,/g,'').trim(),positionText=record[indexes[3]]?.trim();
    if(!/^\d+$/.test(clickText||'')||!/^\d+$/.test(impressionText||'')||!/^\d+(?:\.\d+)?$/.test(positionText||''))throw new Error('Use the English daily Search Console CSV with numeric counts and positions.');
    const rowClicks=Number(clickText),rowImpressions=Number(impressionText),position=Number(positionText);
    if(!Number.isSafeInteger(rowClicks)||!Number.isSafeInteger(rowImpressions)||position>10000)throw new Error('Invalid search metrics.');
    clicks+=rowClicks;impressions+=rowImpressions;weighted+=position*rowImpressions;
  }
  const dates=Array.from(seen).sort();
  return validateSearchSnapshot({since:dates[0],until:dates[dates.length-1],clicks,impressions,position:impressions?Math.round(weighted/impressions*100)/100:null,observedAt:new Date(now).toISOString(),days:records.length},now);
}
export function validateFundsSnapshot(input:Record<string,unknown>,now=Date.now()) {
  if(input.provider!=='google'&&input.provider!=='meta')throw new Error('Choose Google Ads or Meta.');
  if(typeof input.amount!=='number'||!Number.isFinite(input.amount)||input.amount<0||input.amount>1e12)throw new Error('Enter a valid available-funds amount.');
  if(typeof input.currency!=='string'||!/^[A-Z]{3}$/.test(input.currency))throw new Error('Enter a three-letter currency code.');
  const date=typeof input.observedAt==='string'?Date.parse(input.observedAt):NaN;
  if(!Number.isFinite(date)||date>now+60000||now-date>30*86400000)throw new Error('Use the billing observation time from the last 30 days.');
  return {provider:input.provider,amount:Math.round(input.amount*100)/100,currency:input.currency,observed_at:new Date(date).toISOString()};
}

export const discoveryChannel=(source:string,medium:string,paid:boolean):'organic'|'ai'|null=>{
  if(paid)return null;
  const value=source.toLowerCase().trim().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if(/^(chatgpt(?:\.com)?|chat\.openai\.com|perplexity(?:\.ai)?|claude(?:\.ai)?|gemini\.google\.com|copilot\.microsoft\.com)$/.test(value))return 'ai';
  if(medium.toLowerCase()==='organic'||/^(google(?:\.[a-z.]+)?|bing(?:\.com)?|yahoo(?:\.com)?|duckduckgo(?:\.com)?)$/.test(value))return 'organic';
  return null;
};

export function hasOrganizationSchema(html:string):boolean {
  const visit=(value:unknown):boolean=>{
    if(!value||typeof value!=='object')return false;
    if(Array.isArray(value))return value.some(visit);
    const object=value as Record<string,unknown>,types=Array.isArray(object['@type'])?object['@type']:[object['@type']];
    return types.some(type=>['Organization','LocalBusiness','Corporation','ManufacturingBusiness'].includes(String(type)))||visit(object['@graph']);
  };
  for(const match of Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))) {
    if(!/type\s*=\s*["']application\/ld\+json["']/i.test(match[1]))continue;
    try{if(visit(JSON.parse(match[2])))return true;}catch{/* Invalid JSON is not a passed schema check. */}
  }
  return false;
}
