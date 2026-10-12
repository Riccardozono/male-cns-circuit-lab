# MAL-E CNS / Circuit Lab — Windows 5.6.0

Distribuzione corrente in `dist-landscape-v560/`: paesaggio NASA SRTM,
aree ed edifici OSM, boschi Sketchfab più densi a Monza e fascia Le Mans
estesa a 2 km. In **Vista 3D → Inquadra** usa **Bosco** o **Paesaggio**;
rimangono la mappa 2D, l'inseguimento, la panoramica e l'atlante del cervello.
Posizioni, architettura e registrazione geografica sono dichiarate stimate.
[Guida 5.6.0](PAESAGGIO-v560.md) · [Verifica](VERIFICA-v560.md).

Fisica, sensori, reti, ricompense e apprendimento della 5.5.0 sono conservati.
I nuovi salvataggi richiedono esattamente **5.6.0**; i progressi 5.5.0 si
usano con la vecchia app. Nessuna migrazione automatica, cancellazione o
riscrittura dei progressi. Le vecchie distribuzioni rimangono disponibili.

## Distribuzione precedente 5.5.0

Distribuzione 5.5.0 in `dist-facilities-v550/`: tribune 3D con sedute,
gradoni, scale, parapetti e coperture; box, cabine, portale di partenza e
cartelli di frenata illustrativi. In **Vista 3D → Inquadra → Tribune e box**
puoi ispezionare le strutture. **Dettagli: sì/no** controlla tutta la scenografia.
Le zone delle tribune fanno riferimento a mappe ufficiali 2026; geometrie,
dimensioni e raccordo con i tracciati sono stimati, non CAD certificati.
Le sedute vicine usano dettaglio adattivo, con tre batch condivisi al massimo.
Fisica e apprendimento della 5.4.0 sono conservati, senza nuove collisioni o
ingressi sensoriali. Salvataggi nuovi solo **5.5.0**; le vecchie app e i loro
progressi restano separati. [Guida e fonti](TRIBUNE-v550.md) ·
[Verifiche](VERIFICA-v550.md).

## Distribuzione precedente 5.4.0

Distribuzione 5.4.0 in `dist-assets-v540/`: entrambi gli alberi forniti nello
ZIP con texture originale; edifici Sketchfab a Monaco e case a Le Mans, con
texture incorporate, instancing e due LOD. Posizioni e scale illustrative,
licenze CC BY 4.0 e attribuzioni nei [crediti](assets/ENVIRONMENT-CREDITS.md).
**Dettagli: sì/no** controlla anche case e verde. La 2D e l'atlante restano.
Fisica, sensori, ricompense, apprendimento e carreggiata sono identici alla 5.3.0;
nessuna collisione con questi asset. I salvataggi nuovi richiedono **5.4.0**;
quelli 5.3.0 richiedono la vecchia app, preservata. Nessuna migrazione automatica.
[Guida e limiti](ASSET-AMBIENTE-v540.md) · [Verifiche](VERIFICA-v540.md).

## Distribuzione precedente 5.3.0

Distribuzione 5.3.0 in `dist-terrain-v530/`: vegetazione procedurale 3D e
profili altimetrici stimati, con **pendenza e curvatura attive nella fisica**.
Salite/discese modificano accelerazione, frenata e carico normale delle gomme.
Strada, auto, bordi, cordoli e camera campionano la stessa superficie. Il
Laboratorio resta piano; Monza, Monaco e Le Mans hanno ancoraggi locali stimati,
non una mappa altimetrica rilevata. Gli alberi e i cespugli sono fuori dalla
carreggiata e dalle vie di fuga; **Dettagli: sì/no** li nasconde insieme alle
protezioni, senza disattivare il terreno fisico.

Anatomia, policy, ricompense, algoritmi di apprendimento e carreggiata XY sono
conservati. I nuovi carichi fisici possono cambiare le prove di guida. Le auto
rimangono ghost car; il modello è vincolato al suolo, senza salti o volo libero.
I nuovi salvataggi richiedono **5.3.0**; quelli 5.2.0 si usano con la vecchia
app, preservata. [Guida e fonti](TERRENO-v530.md) · [Verifiche](VERIFICA-v530.md).

## Distribuzione precedente 5.2.0

Distribuzione 5.2.0 in `dist-scenery-v520/`: guardrail, muri, recinzioni,
banchine e vie di fuga visuali nella vista 3D. Sei zone a Monza, tre a Monaco,
nove a Le Mans; il Laboratorio usa protezioni sintetiche. **Dettagli: sì/no**
nasconde o mostra tutta la nuova scenografia, anche in pausa. Non sono presenti
strade o accessi di servizio. Posizioni, superfici, estensioni e altezze sono
stime dichiarate, non una ricostruzione certificata delle protezioni reali.

Fisica, dati dei circuiti, sensori, reti, ricompense e apprendimento restano
invariati. I nuovi salvataggi richiedono **5.2.0**; quelli 5.1.0 richiedono la
vecchia app, conservata insieme alle precedenti distribuzioni.
[Guida e fonti](AMBIENTE-3D-v520.md) · [Verifiche 5.2.0](VERIFICA-v520.md).

## Distribuzione precedente 5.1.0

Distribuzione 5.1.0 con livrea ripristinata: portable e installer in
`dist-textures-v510/`. La precedente `dist-learning-3d-v510/` resta intatta.
La vista del circuito offre **Inseguimento dell'auto** e **Panoramica del
circuito** in 3D, mantenendo la mappa 2D e l'atlante del cervello. Il modello
Porsche 992 fornito dall'utente usa texture locali, ruote animate e tre livelli
di dettaglio condivisi. La livrea originale gialla/nera numero 91 dello ZIP è
ora collegata alla carrozzeria e incorporata nel modello, senza download.
Questa correzione visiva conserva versione e salvataggi **5.1.0** e non modifica
IA o fisica. [Correzione texture](TEXTURE-v510.md).
Crediti e modifiche: [PORSCHE-3D-CREDITS.md](assets/PORSCHE-3D-CREDITS.md).

L'obiettivo di apprendimento `progress-3` corregge il costo sproporzionato del
tempo durante l'esplorazione iniziale. L'evoluzione mantiene nuovi agenti da
zero, variazioni locali dei parametri e un raggio di ricerca che aumenta quando
non cresce il progresso fisico. Nell'interfaccia, distanza/giri/tempi sono
distinti dai punti. Non sono aggiunti un percorso o un pilota guida.

I nuovi file di progresso richiedono esattamente **5.1.0**; quelli 5.0.0 si usano
con la relativa app. Le distribuzioni e i salvataggi precedenti sono preservati.
Prove, limiti e confronto misurato: [VERIFICA-v510.md](VERIFICA-v510.md).

Le sezioni seguenti sono la documentazione storica delle versioni precedenti.

**Distribuzione precedente 5.0.0 con accesso visibile al test:** portable e installer in `dist-test-access-v500/`.
La versione rimane 5.0.0 e i modelli non cambiano. Il pacchetto esclude cache,
test unitari, screenshot e report storici. La pulizia precedente ha rimosso le
vecchie build e i temporanei su richiesta dell’utente; i progressi restano al loro
posto. I portable precedenti in `dist-model-ui-v500/` e `dist-test-mode-v500/`
rimangono intatti.
Le sezioni storiche sotto descrivono i risultati al momento delle rispettive
versioni, non la presenza attuale delle vecchie build. [Dettagli della pulizia](PULIZIA-v500.md).

Simulatore locale con apprendimento per ricompense sulla struttura reale del connectoma MaleCNS. Fisica libera, sensori sui bordi effettivi, nessuna collisione fra auto. Laboratorio, Monza, Monaco e Le Mans, con mappa e atlante neurale interattivi.

## Modalità test: 2 giri per V2, V3, V4 e V5

Premi **Apri test modelli** nella barra superiore per aprire il pannello sopra
la mappa e raggiungere i comandi. Aprire non avvia il test. Il confronto parte da
zero, in sequenza, con uguali impostazioni e risultati misurati. I progressi
normali rimangono separati e in pausa durante il test. Uso, criteri di successo
e limiti: [TEST-MODELLI-v500.md](TEST-MODELLI-v500.md).

## Aggiornamento UI 5.0.0 — confronto dei modelli

Sotto il selettore apri **Differenze V2 · V3 · V4 · V5**. Due tabelle mostrano
neuroni, connessioni, slot elaborabili, passaggi ricorrenti, decoder e parametri
apprendibili; la versione scelta è evidenziata. Le note spiegano gruppi sinaptici,
sensori comuni e supporto CPU/GPU. V4 e V5 hanno la stessa anatomia: cambia la
capacità di elaborazione, non il numero dei neuroni nel dataset. Nessuna promessa
di apprendimento più rapido. Il confronto resta chiuso fino a quando lo apri.

La versione app e dei salvataggi resta **5.0.0**: questo intervento non modifica
IA, fisica, ricompense o formato dei file di progresso. I nuovi eseguibili sono
in `dist-model-ui-v500/`; quelli precedenti in `dist-model-v500/` restano intatti.
[Prove del confronto UI](VERIFICA-MODELLI-UI-v500.md).

## Novità 5.0.0 — modello V5 esteso

Il selettore contiene ora **MaleCNS V5 esteso**, oltre a V2, V3 e V4. Il dataset
ha già 166.700 neuroni anatomici annotati: V5 non ne inventa altri, ma ne elabora
molti di più per passo. Capacità sparsa da 8.192 a 32.768 slot per agente,
4 passaggi ricorrenti anziché 2, soglie di attività/contributo dimezzate,
128 neuroni discendenti nel decoder invece di 64, 32 gruppi di guadagno
sinaptico invece di 16: **346 parametri appresi**, contro 202 nel V4.
Sessantaquattro letture sono ora neuroni reali raggiungibili fuori dal nucleo V4.

Stessi 166.700 neuroni e 6.242.118 connessioni anatomiche, condivisi in memoria
tra i profili: il file originale resta identico. I nuovi pesi/slot/passaggi sono
scelte artificiali del simulatore, non nuove proprietà biologiche misurate.
Nessun percorso o pilota preimpostato; senza attività ricorrente reale il
decoder non muove l'auto. Ricompense, fisica Porsche, geometria, sensori e
atlante sono conservati. WebGPU esegue la rete; fisica/ES rimangono CPU.
Fino a 100 auto, un worker ibrido predefinito per i modelli completi.

**Più capacità non garantisce apprendimento più rapido.** Nei test brevi V5
usa realmente più di 8.192 slot, ma costa più calcolo. L'interfaccia distingue
neuroni anatomici e capacità elaborata. V5 è il valore iniziale di un nuovo
profilo; la preferenza del modello già salvata non viene sostituita.

I file `.malecns-save` della **5.0.0 richiedono esattamente la 5.0.0**. V4 e V5
non condividono genomi/decoder/salvataggi incompatibili, anche se l'anatomia è
la stessa. La 4.8.0, i suoi eseguibili e i suoi salvataggi rimangono intatti.
Portable/installer in `dist-model-v500/`; l'installer non viene installato
automaticamente. [Profilo e limiti](MODELLO-V5.md) · [Verifica](VERIFICA-v500.md).

Le sezioni seguenti sono note storiche delle relative release.

## Novità 4.8.0 — obiettivo episodico rifatto

**La selezione usa davvero ricompense meno penalità**, prima di giri, tempi e
distanza (questi ultimi risolvono solo parità esatte). Il vecchio ordine per
giri/progresso poteva promuovere un agente anche con un saldo molto negativo.
L'ottimizzatore ES usa questa nuova graduatoria; non legge direttamente le
magnitudini dei punti. Gli élite e i genitori locali seguono la stessa regola,
senza una corsia preferenziale per il leader grezzo della distanza.

Premi: soltanto progresso nuovo e continuo, checkpoint ordinati e giri validi,
con bonus per il ritmo. Penalità: tempo trascorso, retromarcia, rischio di urto,
slip eccessivo, incidenti, uscita, stallo, ritmo inefficace, nessun giro e
regressione rispetto alla generazione precedente. Il terminale è contabilizzato
subito, una sola volta, non soltanto quando si evolve. I pesi sono normalizzati
per frazione di giro e durata di riferimento, così Le Mans non riceve punti
extra solo perché è più lunga. Sono tarature del simulatore, non dati biologici
o tempi Porsche verificati. [Formule e limiti](RICOMPENSE-v480.md).

Il record storico/globale esclude **soltanto** la penalità comparativa variabile;
la selezione della generazione la include sempre. Un genoma storico immigrato
viene rivalutato, non riceve un voto vecchio come se avesse appena corso.
Nel pannello Auto → Tempi, ricompense e sensori → Voci del punteggio si leggono
le componenti vere dell'auto selezionata, i checkpoint e i due riferimenti.

Decoder, anatomia, sensori, leggi della vettura, mappe e kernel GPU sono
preservati. Non viene aggiunto un pilota automatico o una traiettoria assistita.
Due giri per episodio, nessun limite generale di tempo; gli agenti immobili o
inefficaci possono terminare prima. I salvataggi creati dalla **4.8.0 si aprono
solo nella 4.8.0**; la 4.7.0 e i suoi file restano utilizzabili con il vecchio
pacchetto. Portable/installer: `dist-rewards-v480/`.
[Verifiche](VERIFICA-v480.md). Le sezioni seguenti descrivono le release storiche,
non tutti i criteri correnti.

## Novità 4.7.0 — scala metrica e carreggiata variabile

Monza è calibrata a **5.793 m**, Monaco a **3.337 m** e Le Mans a **13.626 m**.
Le coordinate dei circuiti reali sono ora in metri: la Porsche conserva il
proprio ingombro fisico di 4,619 × 2,050 m, senza la distorsione precedente fra
mappe di diversa scala. Forme, proporzioni, numero e ordine dei punti delle
mezzerie originali sono preservati con una sola trasformazione uniforme.

La larghezza non è più uguale lungo tutta la pista: **61 ancoraggi nominati**
(19 Monza, 20 Monaco, 22 Le Mans) definiscono un profilo raccordato su ogni
segmento, inclusa la chiusura del giro. Intervalli del **modello stimato**:
Monza 10–12 m, Monaco 7–11 m, Le Mans 8–12 m. A Monza l’intervallo complessivo
10–12 m è pubblicato dall’autodromo; la sua distribuzione nei singoli tratti
resta stimata. A Monaco e Le Mans non sono state verificate quote locali:
non vengono presentate come larghezze reali misurate.

**Inquadra** include tutti i tratti del profilo, con la larghezza stimata.
Sotto il titolo della mappa si vedono dimensioni complessive e larghezza locale
dell’auto osservata, oppure del tratto scelto. Zoom, pan, selezione auto e
atlante 3D restano disponibili. La barra in metri usa la medesima scala fisica.

I poligoni di carreggiata sono condivisi da disegno, raggi sensoriali,
collisioni e uscita di pista. La verifica di uscita usa il poligono effettivo,
non la vecchia distanza dalla mezzeria con larghezza unica. I 19 tratti di
cordoli documentati sono registrati sui nuovi bordi; non vengono inventate
nuove zone. Restano approssimazioni cartografiche piane: **non laser scan,
non raggi di curva rilevati, non altimetria o barriere geospaziali**.

Nessuna traiettoria assistita: i profili di larghezza e i nomi dei tratti sono
metadati di osservazione, non input di sterzo/pedali. Anatomia, decoder,
ottimizzatore, worker, kernel GPU, leggi della vettura e coefficienti delle
ricompense non sono cambiati. Le osservazioni e il progresso cambiano
intenzionalmente insieme alla geometria, quindi l’apprendimento non è
numericamente identico alla vecchia versione.

Pacchetti x64: `dist-metric-v470/`. **I salvataggi 4.7.0 richiedono la 4.7.0**.
I salvataggi precedenti continuano a richiedere la versione che li ha creati;
vecchi pacchetti, campioni e file non sono cancellati o migrati.
[Fonti e profili](CIRCUITI.md) · [Verifiche della nuova versione](VERIFICA-v470.md).

## Novità 4.6.3 — selezione automatica dell’auto migliore

Nel pannello **Auto**, **Auto: migliore** è attivo dalla partenza. Seleziona
la migliore auto ancora attiva della popolazione mostrata; sensori, telemetria,
anteprima e atlante seguono lo stesso agente. Con la camera **Segui auto** anche
la mappa segue quell’auto, mentre **Panoramica** rimane una panoramica.

Usa il criterio già presente nella simulazione: prima i giri completati, poi
il miglior tempo; prima del primo giro, progresso e punteggio secondo lo stesso
comparatore. Se l’auto osservata diventa inattiva passa alla migliore ancora
attiva; se sono tutte inattive mostra la migliore finale. Una parità esatta
mantiene l’auto attuale. Non seleziona un campione storico o un’altra isola CPU.

Scegli un’altra auto nel selettore oppure cliccala sulla mappa per passare alla
selezione manuale: non verrà sovrascritta quando cambia il leader. Premi
**Auto: disattivata** per riattivare la selezione automatica. La scelta riguarda
soltanto l’osservazione: non cambia sterzo/pedali, ricompense, fisica o algoritmo
di apprendimento. Con V4 il campione neurale completo può arrivare al tick
successivo; in pausa, se un calcolo GPU è stato invalidato, l’atlante indica
esplicitamente l’attesa e la necessità di riprendere, senza inventare attività.

Pacchetti x64: `dist-selection-v463/`. **Un file progressi della 4.6.3 si apre
solo con la 4.6.3; i file della 4.6.2 richiedono ancora la 4.6.2**, conservata
in `dist-progress-v462/`. Non viene eseguita alcuna migrazione o cancellazione.
[Verifiche della selezione e dell’app](VERIFICA-v463.md).

## Novità 4.6.2 — file progressi condivisibili e bloccati per versione

In **Controlli → Progressi di questa prova**, **Salva file…** apre la finestra
Windows per scegliere nome e cartella. Produce un solo file `.malecns-save`,
condivisibile come allegato o copiabile su un altro PC. **Carica file…** sceglie
il file, lo verifica e chiede conferma prima di sostituire la prova corrente.

Il file creato dalla **4.6.2 funziona soltanto con l’app 4.6.2**, non con 4.6.1,
4.6.3 o altre versioni. Ogni futura release deve aggiornare il numero dell’app.
Modello V2/V3/V4 e circuito vengono selezionati automaticamente dal file:
non è necessario sceglierli prima. Conserva la popolazione completa di tutti
i worker, pesi dei genomi, media/varianza di esplorazione dell’ottimizzatore,
contatori di apprendimento, generazione, campioni, archivio, ultimi 100 elementi
di storico, seed/stato casuale, popolazione, mutazione e velocità richiesta.
I dati anatomici restano nel bundle dell’app: non occorre allegarli al file.

**Ripresa dalla partenza della generazione salvata, in pausa.** Premi Riprendi
per continuare. Lo stato fisico a metà giro e l’attività neurale/GPU transitoria
non sono salvati; tempi/ricompense parziali di quell’episodio ripartono da zero.
I giri e i risultati già registrati nello storico restano. I worker sono isole
asincrone: ciascuno conserva la propria generazione e il proprio apprendimento.
La ripresa non promette una traiettoria GPU bit-identica o un miglioramento delle
prestazioni. Il numero di worker del file non viene tagliato automaticamente;
su un PC più lento può richiedere più risorse.

La verifica controlla versione esatta, schema, modello, circuito, revisione della
fisica, dimensioni/valori dei parametri e SHA-256 del contenuto. Il checksum rileva
corruzione/modifiche accidentali, **non è una firma né una protezione contro chi
riscrive intenzionalmente il file**. Dimensione massima 16 MiB, massimo 32 worker.
Un file non valido o un annullamento non modifica la prova. Scrittura tramite
file temporaneo nella cartella scelta e sostituzione finale del file selezionato.

Il campione automatico locale è ora separato anche per versione dell’app;
i vecchi campioni e le precedenti app restano intatti. Il campione automatico
non sostituisce il file progressi e non contiene l’intero ottimizzatore/storico.
Il salvataggio progressi è disponibile in modalità apprendimento, non nei test
“cervello spento”/“dritta”. Nel browser c’è un download/import per un solo worker;
per conservare un file multi-worker usa l’app Windows. Lo slider della mutazione
ora invia correttamente il comando già previsto ai worker e conserva il valore
richiesto fino alla loro conferma.

Pacchetti x64: `dist-progress-v462/` (portable e installer, non installato
automaticamente). Le release precedenti sono conservate.
[Formato e limiti del file](SALVATAGGI-v462.md) · [verifiche della release](VERIFICA-v462.md).

## Novità 4.6.1 — modello visivo dell'auto

La Porsche usa una nuova sprite dettagliata dall'alto: carrozzeria scolpita,
abitacolo, fari, sfoghi d'aria, componenti carbonio e alettone. Livrea nel colore
dell'agente, ruote anteriori che leggono lo sterzo fisico e luci di frenata che
leggono il comando reale. Nel pannello Auto trovi l'anteprima e **Vedi da vicino**,
che attiva il Segui auto alla massima vicinanza della camera esistente. Rotella,
zoom e Centra mantengono le loro funzioni. Da lontano le auto restano punti colorati.

È un'illustrazione raster generata, **non** un modello 3D ufficiale Porsche,
un mesh CAD o una ricostruzione fotogrammetrica. La forma è illustrativa; il
disegno usa il rapporto dimensionale della fisica già presente. [Asset trasparente](assets/porsche-992-gt3r-top-v1.png),
[prompt completo e provenienza](assets/car-visual-provenance-v1.json), [riferimento Porsche](https://racing.porsche.com/en-US/cars/911-gt3-r-2026).

Fino a 8 materiali/livree e 3 risoluzioni preparate; 5.195.776 byte di pixel
cache (circa 4,96 MiB, non RAM totale). Nessuna decodifica o ricolorazione per auto
a ogni frame; l'anteprima si aggiorna solo quando cambiano stato/colore/dimensioni.
Se manca l'immagine, viene mostrata la sagoma di riserva con avviso.
Fisica, IA, circuiti, penalità, sensori e campioni 4.6.0 non cambiano.
[Verifica grafica e della nuova app](VERIFICA-v461.md).

## Novità 4.6.0 — Porsche 911 GT3 R (992)

La vettura è il modello da gara **GT3 R 2026**, non la GT3 stradale o la Cup. Il motore fisico usa unità SI e quattro pneumatici rotanti: forze longitudinali/laterali combinate, velocità del corpo e imbardata, trasferimenti di carico, inerzia, beccheggio/rollio su piano, aero, differenziale autobloccante, temperature/usura/pressioni, carburante e massa. Cambio sequenziale a sei rapporti con taglio di coppia, limitatore, folle, retromarcia e protezione dalla scalata fuori giri; ABS e TC sono algoritmi stimati del simulatore. Il cambio automatico usa esclusivamente i giri motore, non la mappa.

Specifiche pubblicate: boxer posteriore 4.194 cm³, circa 416 kW, 9.250 rpm, trazione posteriore, passo 2,507 m, serbatoio 117 L, massa base circa 1.265 kg dipendente dal BoP. Fonte: [scheda tecnica Porsche 2026](https://newsroom.porsche.com/dam/jcr%3A3b5e8287-01fb-481f-9d5c-2add88364f30/250808e_Technical%20Data%20911%20GT3%20R26.pdf), [pagina Porsche](https://racing.porsche.com/en-US/cars/911-gt3-r-2026). Rapporti, curva di coppia, grip, aerodinamica e tarature sono **stime dichiarate**, non coefficienti forniti da Porsche/Michelin né fisica WEC validata. [Provenienza e parametri](vehicle-992-provenance.json).

La telemetria mantiene la UI leggera e la mappa interattiva: km/h, marcia e RPM sempre visibili; gomme, freni e trasmissione in un pannello espandibile. Le modifiche manuali a cambio/ABS/TC sono diagnostiche: escludono quel singolo episodio dall'apprendimento e dai campioni, senza alterare le altre auto. Ogni nuova auto riparte con assistenze standard. La 4.6.0 usava una sagoma vettoriale; la 4.6.1 sostituisce solo la grafica con la sprite descritta sopra.

I sei sensori aggiunti misurano RPM, marcia, slip delle ruote anteriori/posteriori, temperatura gomme e freni: **28 sensori e 202 parametri appresi**. La rete/azioni restano a 10 Hz, il tick a 60 Hz, la dinamica delle ruote a 240 Hz. I 166.700 neuroni e il budget sparso non cambiano. Nuovo namespace dei campioni `malecns-circuit-v46-992-gt3r-si-1-…`: i vecchi salvataggi restano intatti, ma non vengono riutilizzati con una fisica diversa.

La lunghezza del giro viene convertita in metri: Monza 5.793 m, Monaco 3.337 m, Le Mans 13.626 m, con riferimenti ufficiali nel manifest. Poligoni e cordoli documentati sono conservati; larghezze, raggi locali e altimetria **non sono rilievi metrici**. Non vengono simulati sospensioni 3D complete, urti deformabili, cordoli in elevazione, meteo, danni, scie o contatti tra auto. Un urto sul bordo termina la prova.

Prova V2 aggiornata da zero: 32 auto, seed 7717, mutazione 16%, due giri nel Laboratorio alla generazione 11; miglior giro 48,167 s alla generazione 12. [Storico nuovo](physics-992-learning.json). Questo non conferma giri su ogni pista/modello. Il criterio di stallo richiede ora 5 m di nuovo progresso entro 5 s, per evitare generazioni bloccate da un'auto che procede quasi ferma. Nessun limite globale alla durata della simulazione. [Verifiche 4.6.0](VERIFICA-v460.md).

## Storico 4.5.0

Fino a **100 auto per generazione e worker**, con 16 come valore iniziale; trasporto dell'attività neurale solo dell'auto ispezionata, lettura GPU più compatta, niente lavoro continuo dei worker in pausa e nessun cambiamento ai kernel neurali, alle ricompense o ai bordi fisici. La mappa mantiene zoom/pan e l'atlante 3D; i cordoli delle piste reali sono ora zone esplicite documentate, non generati dalla curva. Copertura parziale e registrazione approssimata, con fonti/date visibili. [Verifica completa, misure e limiti](VERIFICA-v450.md).

I tempi GPU delle prove brevi non sono uniformemente migliori; la riduzione di trasferimenti e duplicazioni non dimostra 30x effettivi o migliore apprendimento. I risultati di apprendimento nelle sezioni seguenti sono quelli già documentati per la 4.4, non nuovi giri completati nella 4.5.

## Correzione rispetto alla 4.3

La 4.3 non seguiva una traiettoria memorizzata, ma aveva una legge di sterzo/velocità programmata dopo una ricostruzione dei sensori. La miscela motoria della ricorrenza completa partiva da zero. Era una guida assistita, non l'apprendimento richiesto dall'utente. Quel ramo è stato rimosso.

Il vecchio risultato 12/12 riguarda solo quel controller assistito. È conservato in [benchmark-assisted-v43.md](benchmark-assisted-v43.md) e [README-v43-assisted.md](README-v43-assisted.md), **non dimostra l'apprendimento della 4.4 o della 4.6**. I salvataggi attuali richiedono la revisione fisica `992-gt3r-si-1`; i vecchi campioni non vengono caricati automaticamente né cancellati.

## Come viene appresa la guida

`28 sensori → iniezione appresa → sinapsi MaleCNS → attività ricorrente → 64 neuroni discendenti reali → lettura appresa → sterzo e pedali`

La rete non riceve coordinate dell'auto, punti del circuito, mezzeria, curvatura della mappa, azioni corrette o velocità-obiettivo. I canali di anticipazione stradale derivano dalle intersezioni dei raggi con i muri: sono misure, non sterzate. La posizione lungo la pista serve a **valutare il risultato**, non entra nella policy.

I pesi motori iniziali sono casuali, senza campione addestrato o calibrazione di guida. A fine generazione una strategia evolutiva aggiorna media e varianze diagonali dei parametri dal rango delle prove. Conserva elite, esplora altri parametri con campioni gaussiani anche a coppie speculari. È ottimizzazione tramite ricompense episodiche, non apprendimento supervisionato da un pilota automatico. La famiglia delle evolution strategies applicate al reinforcement learning è discussa in [Salimans et al., 2017](https://arxiv.org/abs/1703.03864); il codice locale non pretende di riprodurre esattamente quell'algoritmo.

| Parametri appresi | Numero | Effetto |
| --- | ---: | --- |
| Pesi/bias dei 28 canali sensoriali | 56 | Modificano l'iniezione nella rete |
| Guadagni sinaptici condivisi | 16 | Modulano connessioni anatomiche esistenti |
| Pesi di lettura su 64 neuroni discendenti | 128 | Apprendono sterzo e azione longitudinale |
| Bias delle due azioni | 2 | Appresi; non agiscono senza attività neurale |
| Totale | 202 | Nessuna formula di guida preimpostata |

Non vengono aggiunti archi casuali. I 16 guadagni raggruppano i neuroni per ID: **non significa addestrare individualmente milioni di pesi**. Ricorrenza e azioni lavorano a 10 Hz, tick a 60 Hz e ruote a 240 Hz. Gas/freno sono metà opposte dell'azione longitudinale e non vengono applicati insieme. Codice: [neural-learning.js](neural-learning.js), [simulation.js](simulation.js), [vehicle-992.js](vehicle-992.js); [provenienza anatomica](data/provenance.json), [provenienza fisica](vehicle-992-provenance.json). Il metadato anatomico `sensorCount:22` descrive l'export originale, non i 28 canali del runtime attuale.

## Risultati e limiti

Report 4.4 storico: [benchmark-all-results.md](benchmark-all-results.md), [JSON](benchmark-all-results.json). Non dimostra il risultato con la nuova fisica Porsche. Report attuale: [VERIFICA-v460.md](VERIFICA-v460.md) e [prova V2 Lab](physics-992-learning.json). Incidenti e stalli iniziali sono possibili: non c'è un controller che faccia già chiudere il giro nella generazione 1.

Nella vecchia 4.4 V2 aveva completato due giri sul Laboratorio alla generazione 61: 32 auto, seed 7717, mutazione 16%, miglior giro 72,8333 s simulati. [Storico completo](benchmark-rl-v44-v2-lab-7717.json). La scala e la dinamica sono diverse: **non è un confronto controllato di velocità di apprendimento** con la 4.6.

V3 e V4 hanno migliorato la distanza percorsa prima dell'incidente, senza un giro nelle finestre documentate. Non posso confermare che tutti i dodici abbinamenti della 4.4 abbiano completato un giro. Protocollo e limiti: [VERIFICA.md](VERIFICA.md).

## Avvio Windows

I pacchetti x64 4.6.2 sono in `dist-progress-v462/`: portable e installer NSIS. La portable non richiede Node.js né installazione. L'installer non viene eseguito automaticamente. Le versioni precedenti, inclusa la 4.6.1 in `dist-car-visual-v461/` e la 4.6.0 in `dist-physics-v460/`, sono conservate nelle loro cartelle. I pacchetti non hanno firma Authenticode; Windows può mostrare un avviso. Usare il nuovo eseguibile: una vecchia app già aperta non si aggiorna da sola.

Per sviluppo:

```powershell
npm install
npm start
npm test
```

Per costruire:

```powershell
npm exec -- electron-builder --win portable nsis --config.directories.output=dist-car-visual-v461 --publish never
```

V4 usa normalmente un worker ibrido: ricorrenza su WebGPU, sensori/fisica/ricompense/ottimizzatore su CPU. V2/V3 usano popolazioni CPU indipendenti con migrazione dei migliori. Non è CUDA. Se WebGPU fallisce viene usato il solver CPU. La GPU viene dichiarata attiva dopo un calcolo reale, non dalla sola configurazione.

## Controlli

- Reset: nuova popolazione casuale riproducibile, seed 7717; azzera storico e ottimizzatore della prova.
- Mutazione: controlla l'esplorazione; a zero non vengono aggiornati i parametri.
- Riprendi campione: checkpoint compatibile per modello/circuito, riallineando la media dell'ottimizzatore. Non avviene automaticamente.
- Circuito/controller: cambia prova, con salvataggi separati. V4 completo, V3 storico, V2 compatto ricostruito sono grafi distinti.
- Clic sulla mappa, selettore auto, Segui migliore: cambiano l'agente osservato; restano vista completa e segui auto.
- Velocità: 0,5×–30× richiesto, non garantito effettivo; dipende da modello, popolazione e carico del PC.
- Test cervello spento: comandi zero. Test sterzo zero: gas fisso per verificare la fisica, non per allenare la policy.
- Evolvi ora: conclusione manuale anticipata, non necessaria per l'avanzamento naturale.
- Gomme, freni e trasmissione: apre la telemetria della Porsche; cambio manuale +/− passa anche per folle/retromarcia, con taglio di coppia e protezione fuori giri. In pausa i comandi si registrano ma il tempo della cambiata resta congelato. Cambio, ABS e TC modificati a mano escludono il singolo episodio dall'allenamento.

Ogni auto termina dopo due giri. La generazione finisce quando tutte hanno concluso, urtato, lasciato la pista o raggiunto lo stallo. Nessun limite globale di tempo. L'allenamento non prosegue a app chiusa; salvare un campione per conservarlo. Molte generazioni possono non migliorare: non c'è una promessa di convergenza.

La selezione privilegia giri, poi tempo; prima del primo giro considera il progresso, con ricompense meno penalità come criterio secondario. Il grafico dei punti può scendere al primo giro lento per le penalità severe: leggere anche giri, progresso e tempo.

## Fisica e penalità

La dinamica della Porsche usa SI, `g=9,80665 m/s²` e substep fissi 1/240 s. Lunghezza 4,619 m, larghezza massima 2,050 m e passo 2,507 m derivano dalla scheda Porsche. Quattro patch di contatto ruotano e condividono l'aderenza fra sterzo e accelerazione/frenata; velocità e imbardata non vengono proiettate sul percorso. La scatola orientata della vettura viene confrontata con i bordi reali del poligono, non con altre auto. Gli urti sono terminali, non una simulazione di deformazione. La conversione mappa/metri è uniforme e dipende dalla lunghezza ufficiale, senza alterare il contorno. La soglia numerica 120 m/s serve al controllo di plausibilità del punteggio, **non governa la velocità della macchina**. Le velocità-obiettivo dei giri sono riferimenti stimati per il punteggio, non input dei pedali. Profili/limiti: [CIRCUITI.md](CIRCUITI.md).

Restano costo 5 pt/s, giro oltre riferimento 90 pt/s aggiuntivi, zero giri 1.000 pt, regressione rispetto al miglior giro precedente 120 pt/s di differenza, urto 400 pt, uscita 500 pt, stallo 240 pt. Non sono state alleggerite per ottenere il risultato del banco.

## Dati e confine scientifico

V4 carica 166.700 neuroni annotati e 6.242.118 archi diretti con almeno cinque sinapsi, pari a 89.860.280 sinapsi anatomiche conteggiate. Binario 54.437.864 byte, SHA-256 `eec3fe23c3395caeba64e08751fd587a546be6edd86d3662e1676e3a4a0b14d9`. [Manifest V4](data/connectome-full.json). V3: 7.721 neuroni / 242.486 archi. V2: 1.121 / 32.351, riduzione ricostruita, non copia byte-per-byte storica.

Solver V4 sparso e approssimato: due passaggi, soglia 0,001, budget 8.192 slot per auto, nucleo 7.721 prioritario. Uno slot riservato può avere attività zero. **Caricare il grafo non significa aggiornare simultaneamente tutti i 166.700 neuroni.** Leggere 64 neuroni discendenti non riduce a 64 il dataset caricato.

Il pacchetto R `natverse/malecns` non viene eseguito: si usano export offline con provenienza/checksum. Identità, annotazioni e connessioni sono reali; dinamica a tassi, normalizzazione, ingressi e apprendimento sono artificiali. Non vengono simulati spike, recettori, neurotrasmettitori o fisiologia validata. Non è un cervello biologico completo che guida un'auto.

## Riprodurre le prove

```powershell
node work/benchmark-connectome-rl.cjs --model v2 --circuit lab --population 32 --generations 120 --seed 7717
node work/benchmark-connectome-rl.cjs --model v3 --circuit lab --population 32 --generations 24 --seed 7717
node work/benchmark-992.cjs
node work/check-992-learning.cjs
node work/run-tests-v460.cjs
npm exec -- electron . --learning-test --learning-generations=20 --user-data-dir=work/learning-rl-clean
npm exec -- electron . --benchmark-all --benchmark-timeout-ms=180000 --user-data-dir=work/benchmark-rl-clean
```

Il banco CPU non forza le generazioni; il guardrail genera un errore se non terminano. Le 120 generazioni sono il limite diagnostico, non una scadenza nell'app. Si ferma al primo risultato con due giri, salvo `--all-generations`. La matrice Electron si ferma invece al primo giro e può riportare zero generazioni già concluse: protocolli diversi.

Electron scrive in `%TEMP%/male-cns-all-benchmark.json` e `%TEMP%/male-cns-circuit-lab-smoke.json`. Usare profili diagnostici separati. Sviluppo browser: `node work/serve.mjs`, `http://127.0.0.1:5173/`; `file://` non supportato. Salvataggi browser e desktop sono separati.

## Attribuzione

Dati MaleCNS v1.0, CC-BY-4.0; fonti/crediti/date nei manifest. Il gioco Steam è un riferimento funzionale, non codice o asset copiati. I documenti 4.2/4.3 sono storici, non prove dell'apprendimento corrente.

