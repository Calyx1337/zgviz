import {test} from 'node:test';import assert from 'node:assert/strict';import {WalkingGraph,projectStatus} from './routing';
test('walking uses connected paths and never crosses a disconnected barrier',()=>{const g=new WalkingGraph({nodes:[[16,45.8],[16.001,45.8],[16.001,45.801],[16,45.8002]],edges:[[0,1,78],[1,2,111]],bounds:[]});const r=g.search([16,45.8],250);assert.equal(r.distances[2],189);assert.equal(r.distances[3],Infinity);assert.equal(g.search([16,45.8],100).distances[2],Infinity);});
test('an origin far from the network has no invented route',()=>{const g=new WalkingGraph({nodes:[[16,45.8]],edges:[],bounds:[]});assert.equal(g.search([16.1,45.8],1200).start.id,-1);});
test('a finished procurement phase is not a completed construction project',()=>{assert.equal(projectStatus('Ugovaranje','Gotovo'),'planned');assert.equal(projectStatus('Završeni radovi','Gotovo'),'completed');assert.equal(projectStatus('Radovi u tijeku','U tijeku'),'active');assert.equal(projectStatus('Radovi u tijeku','Zastoj'),'stalled');});

import {readFileSync} from 'node:fs';
const read=(name:string)=>JSON.parse(readFileSync(new URL('../public/data/'+name+'.json',import.meta.url),'utf8'));
test('published project status preserves phase semantics and district precision',()=>{
 const projects=read('projects');
 assert.equal(new Set(projects.map((p:any)=>p.id)).size,projects.length);
 for(const p of projects){if(p.source==='komunalne_aktivnosti')assert.equal(p.status,projectStatus(p.phase,p.rawStatus));if((p.address||'').toLowerCase().startsWith('gradska četvrt'))assert.equal(p.locationPrecision,'district');if(p.year===2024)assert.equal(p.status,'unknown');}
});
test('district accessibility is bounded, monotone with time, and reports sample coverage',()=>{
 const d=read('districts').features;assert.equal(d.length,17);
 for(const {properties:p} of d){assert.equal(p.sampleSize,20);assert.ok(p.connectedSamples>0&&p.connectedSamples<=p.sampleSize);for(const profile of ['all','family','carfree','bike']){const a=p.access[profile];assert.ok(a['5']>=0&&a['5']<=a['10']&&a['10']<=a['15']&&a['15']<=100);}}
});
test('bundled walking graph has valid nodes and nonnegative finite edges',()=>{
 const graph=read('walking-graph');for(const [a,b,d] of graph.edges){assert.ok(a>=0&&b>=0&&a<graph.nodes.length&&b<graph.nodes.length);assert.ok(Number.isFinite(d)&&d>=0);}assert.ok(graph.nodes.length>200000);
});
