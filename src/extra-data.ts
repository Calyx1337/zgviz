import type {Coord} from './types';
export const wasteTypes:Record<string,string>={PAPIR:'Papir',PLASTIKA:'Plastika',STAKLO:'Staklo',METALNA_AM:'Metalna ambalaža',STARE_BATE:'Baterije',BIOOTPAD:'Biootpad',OTPAD_GUME:'Gume',OTPAD_MU:'Motorna ulja',GRADJ_OTPA:'Građevinski otpad',ELEK_OTPAD:'Elektronički otpad'};
export function accepts(value:unknown){return ['da','yes','1','true'].includes(String(value??'').trim().toLowerCase());}
export function closureFeature(row:any,index:number){
 const values=String(row.polyline||'').trim().split(/\s+/).map(Number);const coordinates:Coord[]=[];
 if(values.length<4||values.length%2)return null;
 for(let i=0;i<values.length;i+=2){const lat=values[i],lon=values[i+1];if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<45||lat>47||lon<15||lon>17)return null;coordinates.push([lon,lat]);}
 return {type:'Feature' as const,geometry:{type:'LineString' as const,coordinates},properties:{...row,id:index}};
}
export function safeSourceUrl(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}}
