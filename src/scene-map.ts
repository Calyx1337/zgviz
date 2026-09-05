import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MapControls} from 'three/examples/jsm/controls/MapControls.js';
import {TileManager} from './zg3d/tiles';
import {loadTerrain, type Terrain} from './zg3d/terrain';
import {loadRoads,loadGreen} from './zg3d/overlays';
import {loadWater} from './zg3d/water';
import {setOrigin,toLocal,fromLocal} from './zg3d/proj';
import type {Manifest} from './zg3d/types';
import {booleanPointInPolygon,point} from '@turf/turf';
import type {FeatureCollection} from 'geojson';
type Coord=[number,number];
type View={center?:Coord;zoom?:number;pitch?:number;bearing?:number;duration?:number};
const rad=Math.PI/180;
const distanceForZoom=(z:number)=>1400*Math.pow(2,15.35-z);
const dispose=(g:T.Group)=>g.traverse(o=>{const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();if(m.material){for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.dispose();}});

/** Application map backed by the ZG3D viewer. All overlays use the same metre/elevation frame. */
export class SceneMap {
 readonly scene=new T.Scene();readonly camera=new T.PerspectiveCamera(50,1,2,100000);
 readonly renderer=new T.WebGLRenderer({antialias:true});readonly controls:MapControls;
 readonly markers=new Set<SceneMarker>();readonly container:HTMLElement;
 terrain!:Terrain;tiles!:TileManager;buildingsVisible=true;
 private listeners=new Map<string,((e:any)=>void)[]>();private layers=new Map<string,{group:T.Group;data:any;kind:string;color:string;visible:boolean;opacity:number}>();
 private sourceData=new Map<string,any>();private pendingView:View;private changedAt=0;private moving=false;
 private flight:{start:number;duration:number;from:T.Vector3;target:T.Vector3;to:T.Vector3;toTarget:T.Vector3}|null=null;
 private ray=new T.Raycaster();private lastHit:any=null;private districts:FeatureCollection|null=null;private investment=false;
 private light=new T.DirectionalLight('#fff5df',2);private stats:HTMLElement;
 constructor(container:string,view:View){
  this.container=document.getElementById(container)!;this.pendingView=view;
  this.container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','3D Zagreb: zgrade i reljef');
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.5:2));this.renderer.shadowMap.enabled=innerWidth>=700;this.renderer.shadowMap.type=T.PCFShadowMap;
  this.scene.background=new T.Color('#dce3e5');this.scene.fog=new T.Fog('#dce3e5',16000,55000);
  this.controls=new MapControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.screenSpacePanning=false;this.controls.maxPolarAngle=82*rad;this.controls.minDistance=50;this.controls.maxDistance=65000;this.controls.zoomToCursor=true;
  this.controls.addEventListener('start',()=>{this.flight=null;});this.controls.addEventListener('change',()=>{this.changedAt=performance.now();this.moving=true;});
  this.light.castShadow=this.renderer.shadowMap.enabled;this.light.shadow.mapSize.set(2048,2048);this.light.shadow.bias=-.0006;this.light.shadow.normalBias=.6;
  this.scene.add(this.light,this.light.target,new T.HemisphereLight('#d8e9ff','#827666',1.4));
  this.stats=document.createElement('div');this.stats.className='scene-attribution';this.stats.innerHTML='ZG3D · Grad Zagreb · © OpenStreetMap';this.container.append(this.stats);
  const resize=()=>{const w=this.container.clientWidth,h=this.container.clientHeight;this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);};new ResizeObserver(resize).observe(this.container);resize();
  let down:{x:number;y:number}|null=null;this.renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
  this.renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;down=null;const r=this.container.getBoundingClientRect();this.ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),this.camera);const hit=this.buildingsVisible?this.tiles?.pick(this.ray):null;this.lastHit=hit;const p=hit?.point||this.ray.intersectObject(this.terrain.mesh)[0]?.point;if(!p)return;const [lng,lat]=fromLocal(p.x,-p.z);this.emit('click',{lngLat:{lng,lat},point:{x:e.clientX-r.left,y:e.clientY-r.top}});if(hit)this.tiles.setSelected({key:hit.tile.node.key,id:hit.id});});
  this.init().catch(error=>{console.error(error);this.emit('error',error);});
 }
 private async init(){const url=import.meta.env.BASE_URL+'zg3d/';const res=await fetch(url+'manifest.json');if(!res.ok)throw Error('ZG3D manifest nije dostupan');const m:Manifest=await res.json();setOrigin(m.crs.origin);const terrain=await loadTerrain(url,m);if(!terrain)throw Error('3D teren nije dostupan');this.terrain=terrain;this.scene.add(terrain.mesh);
  this.tiles=new TileManager(this.scene,m,{baseUrl:url,maxLoaded:innerWidth<700?64:180,refineDist:[3400,1150],maxDist:35000,concurrency:6});this.tiles.heightAt=terrain.heightAt;this.tiles.castShadow=this.renderer.shadowMap.enabled;
  this.tiles.setMode({id:'neutral',label:'Neutralno',short:'Neutralno',kind:'ramp',column:'zdelta',domain:[0,100],ramp:[[187,185,175],[211,207,192]],opis:'ZG3D'});
  await Promise.all([loadRoads(url,terrain.heightAt).then(g=>{if(g)this.scene.add(g);}),loadGreen(url,terrain.heightAt).then(g=>{if(g)this.scene.add(g.group);}),loadWater(url,terrain.heightAt).then(g=>{if(g)this.scene.add(g.group);})]);
  this.applyView(this.pendingView);this.renderer.setAnimationLoop(()=>this.frame());this.emit('load',{manifest:m});
 }
 on(name:string,fn:(e:any)=>void){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn]);}
 private emit(name:string,e:any){for(const fn of this.listeners.get(name)||[])fn(e);}
 private frame(){const now=performance.now();if(this.flight){const f=this.flight,k=Math.min(1,(now-f.start)/f.duration),s=k*k*(3-2*k);this.camera.position.lerpVectors(f.from,f.to,s);this.controls.target.lerpVectors(f.target,f.toTarget,s);if(k===1)this.flight=null;}
  const h=this.terrain.heightAt(this.controls.target.x,-this.controls.target.z);if(!this.flight){const dy=(h-this.controls.target.y)*.15;this.controls.target.y+=dy;this.camera.position.y+=dy;}this.controls.update();this.camera.position.y=Math.max(this.camera.position.y,this.terrain.heightAt(this.camera.position.x,-this.camera.position.z)+10);this.camera.updateMatrixWorld();
  const distance=this.camera.position.distanceTo(this.controls.target);const fog=this.scene.fog as T.Fog;fog.near=distance+16000;fog.far=distance+55000;this.tiles.update(this.camera);this.scene.traverse(o=>{if(/^\d+\/\d+\/\d+$/.test(o.name))o.visible=o.visible&&this.buildingsVisible;});
  const r=Math.min(3000,Math.max(300,this.camera.position.distanceTo(this.controls.target)));this.light.position.copy(this.controls.target).add(new T.Vector3(-r,r*2,r));this.light.target.position.copy(this.controls.target);const c=this.light.shadow.camera;c.left=c.bottom=-r;c.right=c.top=r;c.near=10;c.far=r*6;c.updateProjectionMatrix();
  for(const m of this.markers)m.update();this.renderer.render(this.scene,this.camera);
  if(this.moving&&now-this.changedAt>150&&!this.flight){this.moving=false;this.emit('moveend',{});this.emit('pitchend',{});}
  this.container.dataset.pitch=String(this.getPitch());this.container.dataset.zoom=String(this.getZoom());this.container.dataset.visibleTiles=String(this.tiles.stats.visible);this.container.dataset.terrainMax=String(this.terrain.max);
 }
 private position(c:Coord,offset=1){const [x,y]=toLocal(...c);return new T.Vector3(x,this.terrain.heightAt(x,y)+offset,-y);}
 project(c:Coord){const world=this.position(c,2);let occluded=false;for(let i=1;i<32;i++){const p=this.camera.position.clone().lerp(world,i/32);if(p.y<this.terrain.heightAt(p.x,-p.z)){occluded=true;break;}}const p=world.project(this.camera);return {x:(p.x+1)*this.container.clientWidth/2,y:(1-p.y)*this.container.clientHeight/2,visible:!occluded&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1};}
 getCenter(){const [lng,lat]=fromLocal(this.controls.target.x,-this.controls.target.z);return {lng,lat};}
 getZoom(){return 15.35-Math.log2(this.camera.position.distanceTo(this.controls.target)/1400);}
 getPitch(){return Math.acos(Math.min(1,(this.camera.position.y-this.controls.target.y)/this.camera.position.distanceTo(this.controls.target)))/rad;}
 private bearing(){const d=this.camera.position.clone().sub(this.controls.target);return Math.atan2(-d.x,d.z)/rad;}
 private applyView(v:View){const c=this.getCenter(),target=this.position(v.center||[c.lng,c.lat],0),dist=distanceForZoom(v.zoom??this.getZoom()),p=Math.max(.01,v.pitch??this.getPitch())*rad,b=(v.bearing??this.bearing())*rad;const pos=target.clone().add(new T.Vector3(-Math.sin(b)*Math.sin(p)*dist,Math.cos(p)*dist,Math.cos(b)*Math.sin(p)*dist));if(v.duration){this.flight={start:performance.now(),duration:v.duration,from:this.camera.position.clone(),target:this.controls.target.clone(),to:pos,toTarget:target};}else{this.camera.position.copy(pos);this.controls.target.copy(target);this.controls.update();}}
 flyTo(v:View){this.applyView(v);}easeTo(v:View){this.applyView(v);}zoomIn(){this.easeTo({zoom:this.getZoom()+.7,duration:350});}zoomOut(){this.easeTo({zoom:this.getZoom()-.7,duration:350});}
 fitBounds(b:number[],v:View&{padding?:number}){const a=toLocal(b[0],b[1]),c=toLocal(b[2],b[3]);const d=Math.max(Math.abs(c[1]-a[1]),Math.abs(c[0]-a[0])/this.camera.aspect)*1.4;this.applyView({...v,center:[(b[0]+b[2])/2,(b[1]+b[3])/2],zoom:15.35-Math.log2(d/1400)});}
 getBounds(){return {contains:(c:Coord)=>this.project(c).visible};}
 getLayer(id:string){return id==='buildings'||id==='selected-building'||this.layers.has(id);}
 setFilter(_id:string,_filter:any){this.tiles?.setSelected(null);}
 setLayoutProperty(id:string,_prop:string,value:string){if(id==='buildings'){this.buildingsVisible=value!=='none';return;}const l=this.layers.get(id);if(l){l.visible=value!=='none';l.group.visible=l.visible;}}
 getSource(id:string){return {setData:(data:any)=>{this.sourceData.set(id,data);if(id==='districts')this.districts=data;for(const [key,l]of this.layers)if(l.data===id)this.draw(key);}};}
 addSource(id:string,s:{data:any;type?:string}){if(typeof s.data==='string')fetch(s.data).then(r=>{if(!r.ok)throw Error(id);return r.json();}).then(d=>this.getSource(id).setData(d)).catch(e=>this.emit('error',e));else this.getSource(id).setData(s.data);}
 addLayer(l:any){this.layers.set(l.id,{group:new T.Group(),data:l.source,kind:l.type,color:(l.type==='line'?l.paint?.['line-color']:l.paint?.['fill-color'])||'#6895f7',visible:l.layout?.visibility!=='none',opacity:l.paint?.['fill-opacity']??.13});this.draw(l.id);}
 setPaintProperty(id:string,_prop:string,value:any){this.investment=JSON.stringify(value).includes('plannedValue');this.draw(id);}
 queryRenderedFeatures(_p:any,opts:{layers:string[]}):any[]{if(opts.layers.includes('buildings')&&this.lastHit){const h=this.lastHit;const c=fromLocal(h.point.x,-h.point.z);return [{type:'Feature',geometry:{type:'Point',coordinates:c},properties:{id:h.building.oid}}];}if(opts.layers.includes('district-fill')){const c=this.ray.intersectObject(this.terrain.mesh)[0]?.point;if(c){const ll=fromLocal(c.x,-c.z);return this.districts?.features.filter(f=>booleanPointInPolygon(point(ll),f as any))||[];}}return [];}
 private draw(id:string){const l=this.layers.get(id)!;this.scene.remove(l.group);dispose(l.group);l.group=new T.Group();l.group.visible=l.visible;l.group.renderOrder=6;const data=this.sourceData.get(l.data);const features=data?.type==='FeatureCollection'?data.features:data?.type==='Feature'?[data]:[];
  for(const f of features){const g=f.geometry;if(!g)continue;let color=id==='extra-landuse'?f.properties.displayColor||l.color:l.color;if(id==='district-fill'){const v=this.investment?f.properties.plannedValue/5000000:f.properties.accessDisplay/100;color=this.investment&&!f.properties.projects?'#d8dde3':'#'+new T.Color('#d9e6f6').lerp(new T.Color('#2457c8'),Math.min(1,v||0)).getHexString();}
   const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
   if(l.kind==='line'){const vertices:number[]=[];for(const line of lines)for(let i=1;i<line.length;i++){const a=this.position(line[i-1]),b=this.position(line[i]),n=Math.max(1,Math.ceil(a.distanceTo(b)/30));for(let j=0;j<n;j++){for(const k of [j/n,(j+1)/n]){const p=a.clone().lerp(b,k);p.y=this.terrain.heightAt(p.x,-p.z)+2;vertices.push(p.x,p.y,p.z);}}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));let mesh:T.Mesh|T.LineSegments;
    if(id==='extra-closures'||id==='extra-selected'){const triangles:number[]=[];for(let i=0;i<vertices.length;i+=6){const a=new T.Vector3(...vertices.slice(i,i+3) as [number,number,number]),b=new T.Vector3(...vertices.slice(i+3,i+6) as [number,number,number]);const normal=new T.Vector3(-(b.z-a.z),0,b.x-a.x).normalize().multiplyScalar(2);for(const p of [a.clone().add(normal),a.clone().sub(normal),b.clone().add(normal),b.clone().add(normal),a.clone().sub(normal),b.clone().sub(normal)])triangles.push(p.x,p.y,p.z);}geo.setAttribute('position',new T.Float32BufferAttribute(triangles,3));mesh=new T.Mesh(geo,new T.MeshBasicMaterial({color,side:T.DoubleSide,depthWrite:false}));}
    else mesh=new T.LineSegments(geo,new T.LineBasicMaterial({color,transparent:true,opacity:id==='walk-lines'?.65:1,depthWrite:false,depthTest:true}));mesh.renderOrder=7;l.group.add(mesh);
   }else if(l.kind==='fill'){const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];for(const rings of polys){const contour=rings.map((ring:number[][])=>ring.slice(0,-1).map(c=>{const [x,y]=toLocal(c[0],c[1]);return new T.Vector2(x,y);}));const indices=T.ShapeUtils.triangulateShape(contour[0],contour.slice(1));const coords:T.Vector2[]=contour.flat();const verts:number[]=[];for(const tri of indices){const [a,b,c]=tri.map(i=>coords[i]);const n=Math.min(80,Math.max(1,Math.ceil(Math.max(a.distanceTo(b),a.distanceTo(c),b.distanceTo(c))/150)));for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){const at=(u:number,v:number)=>a.clone().addScaledVector(b.clone().sub(a),u/n).addScaledVector(c.clone().sub(a),v/n);const put=(p:T.Vector2)=>verts.push(p.x,this.terrain.heightAt(p.x,p.y)+1,-p.y);[at(i,j),at(i+1,j),at(i,j+1)].forEach(put);if(i+j<n-1)[at(i+1,j),at(i+1,j+1),at(i,j+1)].forEach(put);}}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));const mesh=new T.Mesh(geo,new T.MeshBasicMaterial({color,transparent:true,opacity:id==='district-fill'?.55:l.opacity,side:T.DoubleSide,depthWrite:false}));mesh.renderOrder=6;l.group.add(mesh);}}
  }
  // Combine equal-material overlay geometry so thousands of planning polygons do not require thousands of draw calls.
  const buckets=new Map<string,(T.Mesh|T.LineSegments)[]>();
  for(const object of l.group.children){const mesh=object as T.Mesh;const material=mesh.material as T.MeshBasicMaterial;const key=object.type+material.color.getHexString()+material.opacity;const bucket=buckets.get(key)||[];bucket.push(mesh);buckets.set(key,bucket);}
  for(const bucket of buckets.values()){if(bucket.length<2)continue;const merged=mergeGeometries(bucket.map(m=>m.geometry));if(!merged)continue;const first=bucket[0];const combined=first instanceof T.LineSegments?new T.LineSegments(merged,first.material):new T.Mesh(merged,first.material);combined.renderOrder=first.renderOrder;for(const object of bucket){l.group.remove(object);object.geometry.dispose();if(object!==first)(object.material as T.Material).dispose();}l.group.add(combined);}
  this.scene.add(l.group);
 }
}
export class SceneMarker {
 private coord:Coord=[0,0];private map?:SceneMap;private el:HTMLElement;
 constructor(options:{element:HTMLElement;[key:string]:unknown}){this.el=options.element;this.el.classList.add('maplibregl-marker');this.el.style.position='absolute';}
 setLngLat(c:Coord){this.coord=c;this.update();return this;}addTo(map:SceneMap){this.map=map;map.markers.add(this);map.container.append(this.el);this.update();return this;}
 remove(){this.map?.markers.delete(this);this.el.remove();}
 update(){if(!this.map?.terrain)return;const p=this.map.project(this.coord);this.el.style.display=p.visible?'':'none';this.el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;}
}
