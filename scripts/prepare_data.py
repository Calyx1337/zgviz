"""Build browser snapshots from Zagreb CKAN + a supplemental OSM walking network.
Requires: pip install shapely pyshp pyproj. Download cache defaults to /tmp.
Never invent project status, cost, dates, coordinates, or building heights.
"""
import json, os, math, html, urllib.request, pathlib, zipfile, collections, datetime, sys
from shapely.geometry import shape, mapping, Point
from shapely.ops import transform
from pyproj import Transformer
import shapefile
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data'
OUT.mkdir(parents=True, exist_ok=True)
CACHE = pathlib.Path(os.environ.get('ZAGREB_CACHE', '/tmp'))
def download(url, path):
    if not path.exists() or '--refresh' in sys.argv:
        print('Downloading', url, flush=True)
        urllib.request.urlretrieve(url, path)
    return path
catalog=json.load(open(download('https://data.zagreb.hr/api/3/action/package_search?rows=250',CACHE/'zagreb-catalog.json')))['result']['results']
cat={d['name']:d for d in catalog}
sources={}
def source(key):
    d=cat[key]
    sources[key]={'title':d['title'],'url':'https://data.zagreb.hr/dataset/'+key,'modified':d['metadata_modified'],'license':d.get('license_title'),'resources':[{'format':r['format'],'url':r['url'],'modified':r.get('last_modified')} for r in d['resources']]}
    return d

def load(key):
    d=source(key)
    r=next(r for r in d['resources'] if r['format'].lower() in ('geojson','json'))
    # Portal labels this nursery resource GeoJSON but the URL mistakenly requests FGDB.
    u=r['url'].replace('format=fgdb','format=geojson')
    sources[key]['usedResource']=u
    return json.load(open(download(u,CACHE/(key+'.json'))))

def write(name,data):
    (OUT/name).parent.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
def fc(features):return {'type':'FeatureCollection','features':features}
def clean(s):return html.unescape(str(s or '')).strip()
def roundcoords(c):
    if isinstance(c[0],(int,float)):return [round(c[0],7),round(c[1],7)]
    return [roundcoords(v) for v in c]
def feature(g,p,id=None):
    f={'type':'Feature','geometry':g,'properties':p}
    if id is not None:f['id']=id
    return f

# Official district geometry (HTRS96 / Croatia TM -> WGS84).
key='gradske-cetvrti-prostorna-jedinica-mjesne-samouprave-za-podrucje-grada-zagreba'
d=source(key);sources[key]['usedResource']=d['resources'][0]['url']
z=download(d['resources'][0]['url'],CACHE/(key+'.json'))
folder=CACHE/'zg-districts';folder.mkdir(exist_ok=True)
with zipfile.ZipFile(z) as f:f.extractall(folder)
r=shapefile.Reader(str(folder/'RPJ_GC'),encoding='cp1250')
tx=Transformer.from_crs(3765,4326,always_xy=True).transform
districts=[];shapes=[]
for rec in r.shapeRecords():
    g=transform(tx,shape(rec.shape.__geo_interface__)).simplify(.000015,preserve_topology=True)
    p={'id':rec.record['JMS_MB'],'name':rec.record['JMS_IME'],'areaKm2':round(rec.record['Shape_Area']/1e6,2)}
    p['center']=list(g.representative_point().coords)[0]
    districts.append(feature(mapping(g),p,p['id']));shapes.append((g,p))
def district(lng,lat):
    p=Point(lng,lat)
    return next((x['id'] for g,x in shapes if g.covers(p)),None)

# Public amenities; keep only useful public fields and source provenance.
pois=[]
sets={'geoportal-tramvajska-stajalista-zet':'transport','autobusna-stajalista-zet':'transport','geoportal-djecji-vrtici':'nursery','geoportal-osnovne-skole':'school','geoportal-domovi-zdravlja':'health','geoportal-zdravstvene-ustanove':'health','geoportal-kulturne-ustanove':'culture','geoportal-gradske-trznice':'market','geoportal-javna-igralista':'sport','geoportal-sportski-objekti':'sport','geoportal-javna-parkiralista-za-bicikle':'bike','geoportal-gradski-vrt':'park','geoportal_javni_zdenci':'water'}
for key,category in sets.items():
    data=load(key)
    for i,f in enumerate(data['features']):
        if not f.get('geometry'):continue
        g=shape(f['geometry']);p=f['properties'];pos=g if g.geom_type=='Point' else g.representative_point()
        coord=[round(pos.x,7),round(pos.y,7)]
        name=clean(p.get('naziv') or p.get('Naziv_stajališta') or p.get('Domovi_zdravlja_naziv') or p.get('Vrsta_objekta') or ('Javni zdenac' if category=='water' else None) or p.get('lokacija'))
        if category=='nursery':name='Dječji vrtić '+name.title()
        if name.isupper():name=name.capitalize()
        address=clean(p.get('adresa') or p.get('Domovi_zdravlja_adresa') or p.get('lokacija'))
        pois.append({'id':key+':'+str(i),'name':name,'address':address,'category':category,'coordinates':coord,'district':district(*coord),'source':key,'detail':clean(p.get('Linije') or p.get('sportovi') or p.get('vr_vrtica'))})

projects=[]
for p in load('komunalne_aktivnosti'):
    q={k:clean(v) for k,v in p.items()}
    try:coord=[float(q['Y_Koordinata']),float(q['X_Koordinata'])]
    except ValueError:coord=None
    if coord and not (15.6<coord[0]<16.5 and 45.5<coord[1]<46.1):coord=None
    phase=q['FazaAkcije'];raw=q['StatusAktivnosti']
    # "Gotovo" applies to the current phase; only finished works mean completed.
    status='stalled' if raw=='Zastoj' else 'completed' if phase=='Završeni radovi' else 'active' if phase in ('Radovi u tijeku','Izvođač uveden u posao') else 'planned'
    try:value=float(q['Iznos'].replace(',','.'))
    except ValueError:value=None
    projects.append({'id':q['ID'],'name':q['Aktivnost'],'address':q['Lokacija'],'phase':phase,'rawStatus':raw,'status':status,'value':value,'updated':q['ZadnjaPromjena'] or None,'period':None,'coordinates':coord,'district':district(*coord) if coord else None,'source':'komunalne_aktivnosti','year':None,'locationPrecision':'district' if q['Lokacija'].lower().startswith('gradska četvrt') else 'point'})
for i,f in enumerate(load('kapitalna-ulaganja-2024')['features']):
    p=f['properties'];coord=f['geometry']['coordinates'] if f.get('geometry') else None
    projects.append({'id':'capital2024:'+str(i),'name':p.get('naziv'),'address':p.get('Adresa'),'phase':p.get('Opis_radova'),'rawStatus':None,'status':'unknown','value':p.get('plan24'),'updated':None,'period':'Plan za 2024.','coordinates':coord,'district':district(*coord) if coord else None,'source':'kapitalna-ulaganja-2024','year':2024,'locationPrecision':'point'})

# Buildings: genuine official footprints and Z_Delta, simplified extrusion (not roof meshes).
d=source('zg3d-2022-3d-model-gz');u=next(r['url'] for r in d['resources'] if r['format']=='GeoJSON');sources[d['name']]['usedResource']=u
buildings=json.load(open(download(u,CACHE/'zg3d-all.json')))
cells=collections.defaultdict(list)
for f in buildings['features']:
    if not f.get('geometry'):continue
    p=f['properties'];h=p.get('Z_Delta')
    if h is None:continue
    g=shape(f['geometry']);g=g.simplify(.000002,preserve_topology=True)
    if g.is_empty:continue
    c=g.centroid;x,y=math.floor(c.x*100),math.floor(c.y*100)
    geom=mapping(g);geom['coordinates']=roundcoords(geom['coordinates'])
    cells[f'{x}_{y}'].append(feature(geom,{'height':round(max(0,float(h)),2),'year':p.get('Godina_izv'),'id':f.get('id',p['OBJECTID'])},f.get('id',p['OBJECTID'])))
manifest=[]
for key,features in cells.items():
    x,y=map(int,key.split('_'));write('buildings/'+key+'.json',fc(features));manifest.append({'key':key,'bounds':[x/100,y/100,(x+1)/100,(y+1)/100],'count':len(features)})
write('buildings-index.json',manifest)
print('Buildings',sum(x['count'] for x in manifest),'cells',len(manifest),flush=True)

# Supplemental OSM walking network. No routing service, tracking, or API key in the browser.
osmfile=CACHE/'zagreb-osm.json'
if not osmfile.exists() or '--refresh' in sys.argv:
    query='[out:json][timeout:120];(way["highway"]["highway"!~"motorway|trunk|construction|proposed|raceway"]["access"!~"private|no"]["foot"!="no"](45.64,15.75,45.98,16.25);way["leisure"="park"](45.64,15.75,45.98,16.25););out geom;'
    import urllib.parse
    req=urllib.request.Request('https://overpass-api.de/api/interpreter',data=urllib.parse.urlencode({'data':query}).encode())
    osmfile.write_bytes(urllib.request.urlopen(req,timeout=180).read())
osm=json.load(open(osmfile));ways=[];parks=[];streets={};counts=collections.Counter()
for e in osm['elements']:
    t=e.get('tags',{});g=e.get('geometry',[])
    if len(g)<2:continue
    coords=[[p['lon'],p['lat']] for p in g]
    if t.get('leisure')=='park' and len(g)>3 and coords[0]==coords[-1]:
        geom={'type':'Polygon','coordinates':[coords]};parks.append(feature(geom,{'name':t.get('name','Zelena površina')}))
        if t.get('name'):
            point=shape(geom).representative_point();c=[point.x,point.y]
            pois.append({'id':'osm:'+str(e['id']),'name':t['name'],'address':'Park · OpenStreetMap','category':'park','coordinates':c,'district':district(*c),'source':'osm','detail':'Položaj unutar parka; ulaz nije potvrđen.'})
    if not t.get('highway'):continue
    if t['highway'] in ('cycleway','bridleway') and t.get('foot') not in ('yes','designated','permissive'):continue
    if t['highway'] in ('planned','platform','services','road'):continue
    ways.append(e);counts.update(set(e['nodes']))
    if t.get('name') and t['name'] not in streets:
        c=coords[len(coords)//2];streets[t['name']]={'name':t['name'],'coordinates':c,'district':district(*c),'type':'Ulica'}
nodeids={};nodes=[];edges=[]
def node(id,c):
    if id not in nodeids:nodeids[id]=len(nodes);nodes.append([round(c['lon'],7),round(c['lat'],7)])
    return nodeids[id]
def dist(a,b):
    return math.hypot((a['lon']-b['lon'])*77600,(a['lat']-b['lat'])*111195)
for e in ways:
    ids=e['nodes'];geo=e['geometry'];last=node(ids[0],geo[0]);length=0
    for i in range(1,len(ids)):
        length+=dist(geo[i-1],geo[i])
        if counts[ids[i]]>1 or i==len(ids)-1 or length>=35:
            n=node(ids[i],geo[i])
            if n!=last and length>0:edges.append([last,n,round(length,1)])
            last=n;length=0
write('walking-graph.json',{'nodes':nodes,'edges':edges,'bounds':[15.75,45.64,16.25,45.98]})
write('parks.json',fc(parks))
write('cycleways.json',load('geoportal-biciklisticke-staze'))
write('search.json',list(streets.values()))
write('amenities.json',pois);write('projects.json',projects)
for f in districts:
    p=f['properties'];id=p['id'];pp=[x for x in projects if x['district']==id and x['source']=='komunalne_aktivnosti'];aa=[x for x in pois if x['district']==id]
    p['amenities']=len(aa);p['categories']=len(set(x['category'] for x in aa));p['projects']=len(pp);p['activeProjects']=sum(x['status']=='active' for x in pp)
    p['plannedValue']=round(sum(x['value'] or 0 for x in pp if x['status'] in ('planned','active','stalled')),2)
write('districts.json',fc(districts))
sources['osm']={'title':'OpenStreetMap · pješačka mreža i parkovi','url':'https://www.openstreetmap.org/copyright','license':'ODbL','modified':osm.get('osm3s',{}).get('timestamp_osm_base')}
write('sources.json',{'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':sources,'buildings':sum(x['count'] for x in manifest),'amenities':len(pois),'projects':len(projects),'graphNodes':len(nodes),'graphEdges':len(edges),'unlocatedProjects':sum(not x['coordinates'] for x in projects),'districtLevelProjects':sum(x['locationPrecision']=='district' for x in projects)})
print('Done',len(pois),'amenities',len(projects),'projects',len(nodes),'walking nodes',len(edges),'edges',flush=True)
