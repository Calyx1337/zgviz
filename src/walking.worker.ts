import {WalkingGraph} from './routing';
import type {Amenity,Coord,Graph} from './types';
const asset=(path:string)=>import.meta.env.BASE_URL+path;
let graph:WalkingGraph;let amenities:Amenity[]=[];let snaps:{id:number;distance:number}[]=[];
let last:ReturnType<WalkingGraph['search']>;let origin:Coord;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const [g,a,extra]=await Promise.all([fetch(asset('data/walking-graph.json')).then(r=>{if(!r.ok)throw Error('Mreža nije dostupna');return r.json() as Promise<Graph>;}),fetch(asset('data/amenities.json')).then(r=>r.json()),fetch(asset('data/extra-services.json')).then(r=>{if(!r.ok)throw Error('Dodatne usluge nisu dostupne');return r.json();})]);
   graph=new WalkingGraph(g);amenities=[...a,...extra];snaps=amenities.map(p=>graph.nearest(p.coordinates));self.postMessage({type:'ready'});
  } else if(data.type==='calculate'){
   origin=data.origin;const budget=data.minutes*80;last=graph.search(origin,budget);const distances:Record<string,number>={};
   amenities.forEach((p,i)=>{const s=snaps[i];const d=s.id>=0?last.distances[s.id]+s.distance:Infinity;if(d<=budget)distances[p.id]=Math.max(1,Math.ceil(d/80));});
   const lines:Coord[][]=[];
   for(const u of last.reached){for(const [v,w] of graph.adjacency[u]){if(u<v&&last.distances[v]<=budget)lines.push([graph.data.nodes[u],graph.data.nodes[v]]);else if(last.distances[v]>budget){const fraction=Math.min(1,(budget-last.distances[u])/w);if(fraction>0){const a=graph.data.nodes[u],b=graph.data.nodes[v];lines.push([a,[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction]]);}}}}
   const b=graph.data.bounds;const boundary=origin[0]-budget/77600<b[0]||origin[0]+budget/77600>b[2]||origin[1]-budget/111195<b[1]||origin[1]+budget/111195>b[3];
   self.postMessage({type:'result',id:data.id,distances,lines,hull:last.reached.map(i=>graph.data.nodes[i]),connected:last.start.id>=0,snapped:last.start.distance,boundary});
  } else if(data.type==='route'){
   const i=amenities.findIndex(a=>a.id===data.amenity);if(i<0||!last)return;
   const search=data.extended?graph.search(origin,25000):last;
   let n=snaps[i].id;const route:Coord[]=[amenities[i].coordinates];
   if(n<0||!Number.isFinite(search.distances[n])){self.postMessage({type:'routeError',id:data.id,message:'Nema povezanog pješačkog puta u preuzetoj mreži do 25 km.'});return;}
   const duration=Math.ceil((search.distances[n]+snaps[i].distance)/80);
   while(n>=0){route.push(graph.data.nodes[n]);n=search.prev[n];}route.push(origin);self.postMessage({type:'route',coordinates:route.reverse(),id:data.id,minutes:duration,extended:!!data.extended});
  }
 }catch(error){self.postMessage({type:'error',message:String(error)});}
};
