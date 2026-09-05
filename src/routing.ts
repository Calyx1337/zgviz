import type {Coord,Graph} from './types';
export const meters=(a:Coord,b:Coord)=>Math.hypot((a[0]-b[0])*77600,(a[1]-b[1])*111195);
// Binary min heap keeps the bounded Dijkstra search interactive on the full city graph.
class Heap {
  a:[number,number][]=[];
  push(v:[number,number]){let i=this.a.length;this.a.push(v);while(i>0){const p=(i-1)>>1;if(this.a[p][0]<=v[0])break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
  pop(){const first=this.a[0],v=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][0]<this.a[c][0])c++;if(this.a[c][0]>=v[0])break;this.a[i]=this.a[c];i=c;}this.a[i]=v;}return first;}
}
export class WalkingGraph {
  adjacency:[number,number][][]; grid=new Map<string,number[]>();
  constructor(public data:Graph){
    this.adjacency=Array.from({length:data.nodes.length},()=>[]);
    for(const [a,b,w] of data.edges){this.adjacency[a].push([b,w]);this.adjacency[b].push([a,w]);}
    data.nodes.forEach((p,i)=>{const key=this.key(p);const cell=this.grid.get(key)||[];cell.push(i);this.grid.set(key,cell);});
  }
  key(p:Coord){return `${Math.floor(p[0]*1000)},${Math.floor(p[1]*1000)}`;}
  nearest(p:Coord,max=100){
    const x=Math.floor(p[0]*1000),y=Math.floor(p[1]*1000);let id=-1,d=max;
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(const i of this.grid.get(`${x+dx},${y+dy}`)||[]){const v=meters(p,this.data.nodes[i]);if(v<d){id=i;d=v;}}
    return {id,distance:d};
  }
  search(origin:Coord,budget:number){
    const start=this.nearest(origin);const distances=new Float64Array(this.data.nodes.length).fill(Infinity);const prev=new Int32Array(this.data.nodes.length).fill(-1);const reached:number[]=[];
    if(start.id<0)return {distances,prev,reached,start};
    const heap=new Heap();distances[start.id]=start.distance;heap.push([start.distance,start.id]);
    while(heap.a.length){const [d,u]=heap.pop();if(d!==distances[u]||d>budget)continue;reached.push(u);for(const [v,w] of this.adjacency[u]){const next=d+w;if(next<distances[v]&&next<=budget){distances[v]=next;prev[v]=u;heap.push([next,v]);}}}
    return {distances,prev,reached,start};
  }
}
export const projectStatus=(phase:string,raw:string)=>raw==='Zastoj'?'stalled':phase==='Završeni radovi'?'completed':['Radovi u tijeku','Izvođač uveden u posao'].includes(phase)?'active':'planned';
