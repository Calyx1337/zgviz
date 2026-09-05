"""Snapshot official services/planning layers; keep source dates distinct from retrieval time."""
import json, urllib.request, datetime, pathlib, concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]/'public/data'
NAMES={'closures':'prometnice','recycling':'reciklazna-dvorista-grada-zagreba1','underground':'geoportal_podzemni_spremnik','semiburied':'polupodzemni_spremnik','toilets':'javni-wc-i','landuse':'geoportal-planirana-namjena-2023','brownfield':'brownfield-povrsine'}
def read(url):
 with urllib.request.urlopen(url,timeout=90) as r:return json.load(r)
def fetch(item):
 key,name=item;p=read('https://data.zagreb.hr/api/3/action/package_show?id='+name)['result'];r=next(r for r in p['resources'] if r['format'].lower() in ('geojson','json'));data=read(r['url'])
 return key,{'title':p['title'],'url':'https://data.zagreb.hr/dataset/'+name,'resource':r['url'],'resourceModified':r.get('last_modified'),'catalogModified':p['metadata_modified'],'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'data':data}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:layers=dict(pool.map(fetch,NAMES.items()))
 for key,value in layers.items():
  (ROOT/('extra-'+key+'.json')).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')))
  print(key,len(value['data'].get('features',[])) if isinstance(value['data'],dict) else len(value['data']))
 services=[]
 for key in ['toilets','recycling','underground','semiburied']:
  for i,f in enumerate(layers[key]['data']['features']):
   c=f['geometry']['coordinates'];assert 15<c[0]<17 and 45<c[1]<47,c
   p=f['properties'];services.append({'id':f'extra:{key}:{i}','coordinates':c,'name':p.get('naziv') or p.get('NAZIV') or p.get('adrese') or p.get('Spremnik') or 'Spremnik','kind':key,'properties':p})
 (ROOT/'extra-services.json').write_text(json.dumps(services,ensure_ascii=False,separators=(',',':')))
