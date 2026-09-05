import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setOrigin,toLocal,fromLocal} from './zg3d/proj';
const manifest=JSON.parse(readFileSync('public/zg3d/manifest.json','utf8'));
setOrigin(manifest.crs.origin);
test('ZG3D frame round-trips the city and Medvednica',()=>{for(const [lon,lat] of [[15.977,45.813],[15.948,45.899],[16.11,45.82]]){const [x,y]=toLocal(lon,lat);const [a,b]=fromLocal(x,y);assert.ok(Math.abs(a-lon)<1e-6);assert.ok(Math.abs(b-lat)<1e-6);}});
test('Terrain places Medvednica above central Zagreb in the same metre frame',()=>{const t=manifest.reljef;const data=readFileSync('public/zg3d/'+t.file);assert.equal(data.length,t.nx*t.ny*2);const sample=(lon:number,lat:number)=>{const [x,y]=toLocal(lon,lat);const i=Math.round((x-t.x0)/t.cell),j=Math.round((y-t.y0)/t.cell);return data.readUInt16LE((j*t.nx+i)*2)*t.scale;};assert.ok(sample(15.948,45.899)>sample(15.977,45.813)+500);});
test('Detailed roof tiles exist for every district in the copied manifest',()=>{assert.equal(manifest.cetvrti.length,17);assert.ok(manifest.cetvrti.every((d:any)=>d.faza_b));assert.ok(manifest.levels.some((l:any)=>l.mode==='roofs'&&l.tiles.length>0));});
