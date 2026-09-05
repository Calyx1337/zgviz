"""Illustrative district accessibility: deterministic sample of 20 ZG3D positions.
No population weighting. Missing network connections are reported, not scored zero.
Run after prepare_data.py. Dependencies: shapely.
"""
import json, pathlib, math, random, heapq, collections
from shapely.geometry import shape,Point
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1];DATA=ROOT/'public/data'
read=lambda n:json.load(open(DATA/n))
districts=read('districts.json');features=districts['features'];tree=STRtree([shape(f['geometry']) for f in features])
samples=[[] for _ in features];counts=[0]*len(features);rng=random.Random(2022)
for file in sorted((DATA/'buildings').glob('*.json')):
 for f in json.load(open(file))['features']:
  if f['properties']['height']<2:continue
  g=shape(f['geometry']);p=g.representative_point()
  ix=tree.query(p,predicate='within')
  if not len(ix):continue
  i=int(ix[0]);counts[i]+=1;coords=[p.x,p.y]
  if len(samples[i])<20:samples[i].append(coords)
  else:
   j=rng.randrange(counts[i])
   if j<20:samples[i][j]=coords
print('Sampled 20 ZG3D positions per district',flush=True)
g=read('walking-graph.json');nodes=g['nodes'];adj=[[] for _ in nodes];grid=collections.defaultdict(list)
for a,b,w in g['edges']:adj[a].append((b,w));adj[b].append((a,w))
for i,p in enumerate(nodes):grid[(math.floor(p[0]*1000),math.floor(p[1]*1000))].append(i)
def dist(a,b):return math.hypot((a[0]-b[0])*77600,(a[1]-b[1])*111195)
def nearest(p):
 x,y=math.floor(p[0]*1000),math.floor(p[1]*1000);best=-1;d=100
 for dx in range(-2,3):
  for dy in range(-2,3):
   for i in grid[(x+dx,y+dy)]:
    v=dist(p,nodes[i])
    if v<d:best,d=i,v
 return best,d
pois=read('amenities.json');targets=collections.defaultdict(list)
for a in pois:
 n,d=nearest(a['coordinates'])
 if n>=0:targets[n].append((a['category'],d))
profiles={'all':['transport','nursery','school','health','park','sport','culture','market','bike','water'],'family':['nursery','school','health','park','sport'],'carfree':['transport','health','market','culture'],'bike':['bike','park','sport','water']}
for i,f in enumerate(features):
 observations=[]
 for p in samples[i]:
  n,start=nearest(p)
  if n<0:continue
  best={n:start};queue=[(start,n)];cats={}
  while queue:
   d,u=heapq.heappop(queue)
   if d!=best[u]:continue
   for cat,extra in targets[u]:
    v=d+extra
    if v<=1200:cats[cat]=min(cats.get(cat,math.inf),v)
   for v,w in adj[u]:
    dd=d+w
    if dd<=1200 and dd<best.get(v,math.inf):best[v]=dd;heapq.heappush(queue,(dd,v))
  observations.append(cats)
 p=f['properties'];p['sampleSize']=len(samples[i]);p['connectedSamples']=len(observations);p['access']={}
 for name,categories in profiles.items():
  p['access'][name]={str(t):round(sum(sum(1 for c in categories if o.get(c,math.inf)<=t*80)/len(categories)*100 for o in observations)/len(observations)) if observations else None for t in (5,10,15)}
 print(p['name'],p['connectedSamples'],p['access']['all'],flush=True)
(DATA/'districts.json').write_text(json.dumps(districts,ensure_ascii=False,separators=(',',':')))
