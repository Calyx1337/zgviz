# Moj Zagreb

Interaktivni web prototip: **„Klikni gdje živiš. Vidi što ti je dostupno i što se u tvom kvartu mijenja.”**

## Pokretanje

```bash
npm ci
npm run dev
```

Otvoriti http://localhost:5173. Za produkcijski statički paket:

```bash
npm run build
npm run preview
```

Sadržaj `dist/` može posluživati obični web poslužitelj. HTTPS je potreban za geolokaciju izvan localhosta. WebGL je potreban za kartu. Nije potreban API ključ ni poslužiteljski servis za rutiranje. Aplikacija koristi TypeScript, Vite, Three.js i Web Worker za izračun po mreži. Fontovi i kartografske pločice zahtijevaju internet.

## Što radi

- Klik na zgradu koristi točku na stvarnom službenom tlocrtu, ističe zgradu i ponovno računa okolinu. Klik na tlo postavlja proizvoljno polazište.
- Dostupnost 5, 10 i 15 minuta računa se po pješačkoj mreži, brzinom 80 m/min. Kategorije otvaraju potpune popise i put do odabranog sadržaja.
- Lokalna pretraga ulica, četvrti i evidentiranih sadržaja. Nije potpuni adresni geokoder: kućni broj koji nije u evidenciji treba odabrati na karti.
- Pogledi „Svi sadržaji”, „Obitelj”, „Bez auta” i „Biciklist” mijenjaju prioritetne kategorije; svi računaju hodanje.
- Geolocirane komunalne aktivnosti, filtri faza, izvorna faza i status, objavljeni iznos, datum promjene, izvor. Kapitalni plan 2024. zasebna je isključiva arhiva.
- Aktivnosti koje navode cijelu gradsku četvrt prikazuju se u posebnom popisu, bez lažne precizne oznake na karti.
- Usporedba 17 četvrti: ilustrativni indeks dostupnosti na uzorku, broj sadržaja, radovi u tijeku i komunalne vrijednosti. Približavanje gradske karte ponovno otvara lokalni prikaz.
- 2D/3D, nagib i rotacija, slojevi, biciklističke staze, geolokacija uz dopuštenje preglednika, tipkovnički dostupna pretraga i dijalozi, mobilni bočni panel.
- Polazište i vrijeme ostaju u URL-u radi ponovnog otvaranja. Geolokaciju ne tražimo automatski.

## Podaci i granice interpretacije

Glavni izvor: [Portal otvorenih podataka Grada Zagreba](https://data.zagreb.hr/). Pojedinačni skupovi, točni URL-ovi resursa, datumi i dozvole spremljeni su u `public/data/sources.json` i dostupni kroz „O podacima”. Riječ je o lokalnoj snimci, ne automatski osvježavanim podacima.

### ZG3D

[ZG3D 2022 3D model Grada Zagreba](https://data.zagreb.hr/dataset/zg3d-2022-3d-model-gz): prikaz koristi **358.109 zapisa** preuzetih iz obrađenog skupa projekta zgvizveli, s GLB pločicama u tri razine detalja i detaljnim krovovima LoD 2.2. Broj zapisa nije broj jedinstvenih stambenih zgrada. Ranije pripremljeni tlocrti (357.683 zapisa, 691 datoteka) zadržani su za postojeći postupak uzorkovanja dostupnosti, ali se više ne iscrtavaju kao zgrade.

### Javne usluge

**4.083 evidentirane lokacije** iz službenih skupova za tramvajska i autobusna stajališta, vrtiće, osnovne škole, domove zdravlja i zdravstvene ustanove, kulturu, tržnice, sportska igrališta i objekte, parkirališta za bicikle, gradske vrtove i javne zdence, uz imenovane parkove iz OpenStreetMapa. Broj oznaka na karti ograničen je radi čitljivosti; popisi sadrže sve izračunate rezultate. Evidencija ne potvrđuje radno vrijeme, kapacitet, javnost svakog objekta, upisno područje ili pristupačan ulaz. Različiti zapisi na jednoj adresi nisu automatski spajani.

### Hodanje

Dopunski izvor: [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL. Preuzeta mreža ima **264.735 čvorova i 308.140 bridova**, unutar 15,75–16,25° E i 45,64–45,98° N. Dijkstra se izvršava u radnoj dretvi preglednika; nema poziva udaljenom servisu s polazištem.

Polazište i sadržaj spajaju se na najbliži čvor unutar 100 m; duljina spojeva ulazi u izračun. Ti spojevi nisu potvrđene pristupne staze i mogu prijeći prepreku koja nije modelirana. Za parkove je korištena točka unutar poligona, ne verificirani ulaz. Mostovi, povezanost i udaljenosti prate preuzetu mrežu, ali nema živih zatvaranja, vremena semafora, nagiba, provjere stepenica ili terenske validacije. Mreža nije prikladna za obećanje pristupačne rute osobama smanjene pokretljivosti.

**Plavi omotač nije precizna izokrona**: konveksna je ovojnica dosegnutih čvorova i može obuhvatiti nedostupne površine. Plave linije prikazuju dosegnutu mrežu. Sadržaji se broje isključivo prema izračunatom putu, ne prema omotaču. Vrijeme je zaokruženo naviše. Izvan dosega mreže nema izmišljenog izračuna.

### Projekti

[Plan komunalnih aktivnosti](https://data.zagreb.hr/dataset/komunalne_aktivnosti): **700 zapisa**. [Kapitalna ulaganja 2024](https://data.zagreb.hr/dataset/kapitalna-ulaganja-2024): **161 arhivski zapis**.

- `Gotovo` uz fazu `Ugovaranje` nije završen građevinski zahvat. Samo faza `Završeni radovi` daje oznaku „Završeno”. `Zastoj` ima vlastitu oznaku.
- **47 aktivnosti** s lokacijom „Gradska četvrt …” izdvojeno je na razinu četvrti. Druge točke iz izvora također nisu potvrđen obuhvat radova ili veza s katastarskom česticom.
- Iznosi su objavljene vrijednosti aktivnosti, ne stvarna potrošnja. Zbroj različitih aktivnosti može uključivati projektiranje, nadzor i radove. Ne predstavlja ukupan proračun četvrti.
- Nepostojeći zapisi za četvrt označeni su „Nema zapisa”, a ne dokazom da nema ulaganja.
- Datum promjene zapisa nije rok izvođenja. Nepostojeći rok prikazuje se kao „Nije objavljeno”. Arhivskim ulaganjima nije dodijeljen izmišljeni aktualni status.
- Lokalni filtar projekata koristi zračnu udaljenost 400/800/1200 m, što je posebno označeno; nije pješački filtar projekata.

### Eksperimentalni indeks

Za jednu lokaciju indeks je `100 × broj dostupnih kategorija / broj kategorija u pogledu`. Kategorije imaju jednaku težinu. Prekidači prikaza slojeva ne mijenjaju metodologiju osobnog pogleda.

Usporedba četvrti koristi prosjek tog indeksa na **20 deterministički uzorkovanih položaja iz ZG3D skupa** po četvrti (zapisi visine barem 2 m, reservoir sampling, seed 2022). Nije reprezentativna ocjena svih stanovnika, nema populacijskog ponderiranja i zapisi modela nisu jedinstvene kućne adrese. Nepovezani uzorci izuzeti su: Brezovica 18/20, Sesvete 19/20, ostale 20/20. Rezultati postoje za sva tri vremena i sva četiri osobna pogleda.

### Kartografska podloga

[OpenFreeMap Positron](https://openfreemap.org/quick_start/), OpenMapTiles i OpenStreetMap. Lokalna kopija stila je `public/basemap.json`, a pločice, znakovi i fontovi karte ostaju na OpenFreeMap poslužiteljima. Atribucija je u karti. Vanjski pružatelj podloge prima zahtjeve za pločicama vidljivog područja.

## Ponovna priprema podataka

U Python okruženju instalirati pakete iz `scripts/requirements.txt`, zatim:

```bash
python3 scripts/prepare_data.py --refresh
python3 scripts/compare_access.py
```

Bez `--refresh`, priprema koristi prethodno preuzete datoteke iz `/tmp` ili direktorija `ZAGREB_CACHE`. Parametar `--refresh` ponovno preuzima izvore i OSM mrežu. Nakon izmjene skupova treba pokrenuti oba koraka kako usporedba ne bi koristila staru snimku. Skup ZG3D ima približno 229 MB prije obrade. Osnovni podaci dostupnosti zauzimaju oko 123 MB; dodatni 3D skup približno 406 MB; ne učitavaju se svi odjednom.

## Provjere

```bash
npm test
npm run build
```

Testovi štite ponašanje na nepovezanoj mreži, granicu dosega, nedostupno polazište i razlikovanje završene faze ugovaranja od završenih radova. Build provjerava TypeScript i priprema statičke datoteke. Vizualna provjera i interakcije obavljaju se u stvarnom pregledniku; build sam po sebi nije dokaz ispravnog prikaza.

Za službenu javnu uslugu preostaju validacija pristupnih putova i ulaza, precizne mrežne izokrone, puniji obuhvat mreže, veći/populacijski ponderiran uzorak četvrti i dogovoreno automatsko osvježavanje izvora.

## Javna objava

Prototip je objavljen 5. rujna 2026. na https://calyx.hr/zgviz/ i provjeren u pregledniku, uključujući pomicanje i rotaciju karte.

- AWS profil: `calyx`; bucket: `calyx-hr`, regija `eu-west-1`; aplikacija zauzima samo prefiks `zgviz/`.
- CloudFront distribucija: `E13L8Q0E36E5O8`. Glavna stranica i zajednička konfiguracija nisu mijenjane.
- `npm run build:calyx` priprema `dist-calyx/` s baznom putanjom `/zgviz/`.
- Objavljene datoteke imaju gzip kompresiju i zaglavlje `Content-Encoding: gzip`, uz odgovarajući izvorni MIME tip. Predmemorija: 60 sekundi za HTML, 3600 sekundi za ostale datoteke.
- Pri ponovnoj objavi prvo prenijeti podatke i resurse, a `index.html` posljednji. Invalidirati samo `/zgviz` i `/zgviz/*`. Ne sinkronizirati korijen bucketa niti koristiti brisanje izvan prefiksa aplikacije.


## Preuzeti prikaz ZG3D i reljef

`src/zg3d/` preuzima module iz projekta `zgvizveli` (MIT licenca sačuvana u toj mapi). `public/zg3d/` sadrži pripremljene GLB pločice, manifest, visinsku mrežu i OSM slojeve. `src/scene-map.ts` povezuje njihovu scenu s dostupnošću, rutama, zahvatima i usporedbom četvrti. Sve se poslužuje statički pod istom baznom putanjom.

Zgrade koriste tri razine detalja, uključujući LoD 2.2 krovove pri približavanju. Reljef je aproksimacija iz Z_Min zgrada na mreži 200 m, a ne službeni DEM; osobito u šumama i neizgrađenim područjima može odstupati od stvarnosti. Visine nisu umjetno uvećane. Rute i oznake koriste isti lokalni koordinatni sustav i visinu terena; vrijeme hoda i dalje ne uključuje nagib.

Prečac Medvednica otvara panoramu bez promjene odabranog polazišta. Za osvježavanje 3D podataka pokrenuti pipeline u izvornom projektu i kopirati njegov `data/out/` u `public/zg3d/`, zatim izgraditi i provjeriti aplikaciju. Izvorni kod i podaci nisu mijenjani u projektu zgvizveli.

## Svakodnevno i planovi

Novi odjeljak u bočnom pregledu, dostupan i preko postavki slojeva, nudi javne WC-e, reciklažna dvorišta i spremnike, zatvorene prometnice, planiranu namjenu 2023. i brownfield površine. Prostorni slojevi učitavaju se na zahtjev; iscrtava se najviše 1800 obuhvata oko središta pogleda. Svaki izvor ima odvojeni datum preuzimanja i izmjene resursa/kataloga.

`python3 scripts/prepare_extras.py` osvježava osam datoteka `public/data/extra-*.json`. Vrste otpada filtriraju samo izričite potvrde prihvata u reciklažnim dvorištima. Za spremnike nije izvedena pretpostavka o sadržaju. WC-i i otpad imaju vlastiti pregled dostupnosti; ne mijenjaju postojeći indeks ni uzorkovane usporedbe četvrti. Zasebni put do usluge može prijeći odabranu zonu hoda (pretraga do 25 km); zona i indeks ostaju isti.

Prometnice se pri uključivanju i svake tri minute dok je sloj aktivan i kartica vidljiva dohvaćaju preko `/zgviz/live/closures.json`. CloudFront behavior za samo tu putanju koristi origin `data.zagreb.hr` i funkciju `zgviz-public-closures` koja putanju prepisuje na fiksni službeni JSON resurs. Ne prosljeđuju se korisnički upiti ni kolačići. Predmemorija je najmanje 60, najviše 180 sekundi. Osnovni behavior i S3 origin ostali su nepromijenjeni. Vite proxy omogućuje isti dohvat lokalno. Pri grešci ostaje označena zadnja uspješna snimka. Zatvaranja za vozila ne mijenjaju pješačku mrežu.

Planski podaci iz 2023. nisu potvrda aktualnih uvjeta gradnje. Brownfield evidencija ne označava automatski aktivno ulaganje. Metapodatak o izmjeni nije jamstvo aktualnosti sadržaja.
