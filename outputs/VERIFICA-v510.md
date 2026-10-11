# Verifica app Windows 5.1.0

Questo report descrive la prima distribuzione in `dist-learning-3d-v510/`,
conservata senza modifiche. Per la successiva correzione visiva, anch'essa
5.1.0, in `dist-textures-v510/`, vedere [TEXTURE-v510.md](TEXTURE-v510.md).
I risultati di apprendimento sotto sono quelli della prova originaria, non
una nuova misura effettuata per la correzione della livrea.

## Funzioni e limiti

App locale con inseguimento e panoramica del circuito in 3D, mappa 2D e atlante
del cervello. Modello 3D derivato dallo ZIP Porsche fornito dall'utente. Le
superfici stradali 3D corrispondono ai poligoni fisici; altimetria ed edifici
reali non sono disponibili e non vengono dichiarati ricostruiti.
La fisica, i dati neurali e i circuiti esistenti sono preservati.

Il sistema di ricompense `progress-3` riduce il costo del tempo durante la prima
esplorazione (120 punti per durata di riferimento, da 3.000), i costi continui di
rischio/slip e la componente legata alla velocità d'impatto. Restano le penalità
per urti, uscita, mancato giro, giro lento e regressione sul tempo precedente;
massimo due giri per agente. Un movimento utile più lungo, a pari tipo di urto,
non deve diventare meno conveniente prima del primo checkpoint.

L'ottimizzatore mantiene nuovi agenti da zero (almeno l'8%, 16% in stallo),
mutazioni locali di un blocco funzionale e un raggio minimo di ricerca. Dopo
tre generazioni senza progresso fisico aumenta l'esplorazione. Gli archi
anatomici rimangono fissi: nessuna traiettoria o azione del pilota viene fornita
agli agenti. Le scelte dinamiche restano artificiali, non biologia validata.

## Apprendimento misurato

Prove Monza: partenze da zero, seme 7717, 16 agenti, mutazione 0,16, un worker,
velocità richiesta 30x, limite della **prova** di 60 generazioni naturali o
90 secondi reali per modello. Nessun limite di tempo aggiunto alla simulazione
normale. Non è stato importato un campione e non è stata forzata l'evoluzione.

| Modello | Mediana metri, ultime 5 gen. 5.0.0 | Mediana metri, ultime 5 gen. 5.1.0 | Gen. 5.1.0 osservate | Giri completi 5.1.0 |
|---|---:|---:|---:|---:|
| V2 | 4,83 | 802,88 | 38 | 0 |
| V3 | 7,76 | 801,12 | 5 | 0 |
| V4 | 3,43 | 800,29 | 16 | 0 |
| V5 | 4,61 | 801,37 | 8 | 0 |

La 5.0.0 era stata misurata il 9 ottobre; la 5.1.0 l'11 ottobre. Sono uguali
impostazioni nominali e circuito, non il numero di generazioni concluse. Per V3
sono state osservate solo cinque generazioni: le finestre iniziale e finale
coincidono. Alcuni controlli e la preparazione grafica erano in esecuzione in
parallelo alla prova nuova: i tempi non certificano un aumento della velocità
di calcolo. Tutti i modelli hanno superato il vecchio collasso del progresso
iniziale in questi avvii; **nessuno ha completato un giro**. Non è dimostrata
la convergenza ai due giri o l'efficacia su tutti i circuiti/semi.

Fonte precedente: `learning-diagnosis-v500/diagnosis.json`.
Fonte corrente: `learning-verification-v510/final/diagnosis.json`, con hash del
codice, storie naturali e backend effettivi (V2/V3 CPU; V4/V5 WebGPU + CPU).
L'adattatore WebGPU ha riportato NVIDIA Lovelace. Il sistema locale ha riportato
AMD Ryzen 5 5600G e NVIDIA GeForce RTX 4060, oltre alla Radeon integrata.

Controllo aggiuntivo V2 sul Laboratorio, 32 agenti, stessi semi e 12 generazioni
naturali prima/dopo. Distanza massima nella dodicesima generazione:

| Seme | 5.0.0 | 5.1.0 |
|---|---:|---:|
| 7717 | 1.255,41 m | 1.435,16 m |
| 1089 | 1.221,94 m | 1.429,09 m |
| 9029 | 1.429,00 m | 1.203,17 m |

Due avvii migliorano e uno peggiora: è un risultato misto, non una garanzia.
Tutte queste prove hanno zero giri. I dati e gli hash prima/dopo sono nei file
`learning-verification-v510/lab-*.json`. Il caso 7717 è anche il controllo di
regressione automatico, senza modificarne la soglia.

## Verifiche sorgenti eseguite

- Suite completa: **284/284** test superati, compresa la regressione naturale
  V2 di dodici generazioni. Due ulteriori test del GLB fornito: **2/2** superati.
- Controlli mirati della geometria e della camera finale: **7/7** superati,
  compreso l'ingombro proiettato della carreggiata nei formati ampi e stretti.
- Triangolazione di tutte e quattro le piste, area e vertici del corridoio
  fisico; inquadratura a rapporto ampio e stretto; 100 stati visivi osservati
  senza modificare fisica, genomi, ottimizzatore o casualità.
- App nativa: **25/25** controlli della vista 3D, GLB locale con texture e LOD,
  entrambe le telecamere, tutti i circuiti, 100 agenti con comandi finiti,
  mappa 2D, atlas e accesso al test. Report:
  `verification-v510/review-fixes/ui-smoke.json` (ricattura dopo le correzioni
  richieste dalla revisione: inquadratura, formato stretto, etichette).
- Salvataggi: **49/49** controlli nativi su V2/V3/V4/V5, compresa conservazione
  di tutti i worker, pesi, storie e ripristino in pausa. Versione diversa e
  file danneggiati rifiutati senza alterare la prova. Report:
  `verification-v510/source-progress/progress-smoke.json`.
- Modalità test: confronto reale, quattro backend, impostazioni uguali,
  isolamento dello stato normale, zoom 2D/atlante, stop ed esportazione;
  `verification-v510/source-model-test-confirmed/model-test-smoke.json`.

Le catture nativamente prodotte comprendono inseguimento, panoramiche Monza,
Monaco e Le Mans, desktop completo, finestra stretta e vista affiancata.
Nella ricattura finale il rendering campionato nell'app in pausa ha richiesto
mediana 1,7 ms, massimo 2,8 ms per 25 invii: è tempo CPU per inviare il disegno,
**non FPS, tempo totale
GPU o accelerazione della simulazione**. Il dettaglio segue la distanza, con
texture/geometrie condivise. Riferimenti e conteggi del modello sono in
`assets/porsche-992-gt3-r-provenance.json`.

## Salvataggi e conservazione

App e file di progresso hanno versione esatta **5.1.0**. I file 5.0.0 non
vengono migrati; richiedono l'app 5.0.0. I controlli SHA-256 sui 147 file
protetti preesistenti non hanno rilevato modifiche a dati, fisica, progressi
o distribuzioni precedenti. Manifest: `work/baseline-v510/manifest.json`.
Alla vecchia illustrazione 2D sono stati aggiunti solo i metadati del prompt
già presente nella sua provenienza; i dati pixel IDAT sono identici e la copia
originale è conservata. Report `verification-v510/raster-provenance.json`.

## Consegna Windows e revisione

Pacchetto separato `dist-learning-3d-v510/`, con portable e installer x64.
Eseguibile di app impacchettata verificato con profili temporanei separati,
senza installarlo nel profilo dell'utente o sostituire le versioni precedenti:

| Verifica nativa dell'app impacchettata | GPU disponibile | GPU disabilitata / CPU |
|---|---:|---:|
| Circuito 3D, Porsche locale, camere, 100 agenti, vista 2D/atlante | 18/18 | 18/18 |
| Salvataggi, ripristino e rifiuto file incompatibili/danneggiati | 49/49 | 49/49 |
| Confronto a freddo V2/V3/V4/V5, isolamento, stop/esportazione | 37/37 | 37/37 |

Tutti i controlli sono passati, senza errori di console rilevati. I report sono
in `verification-v510/packaged-3d`, `packaged-cpu-3d`, `packaged-progress`,
`packaged-cpu-progress`, `packaged-model-test`, `packaged-cpu-model-test`.
Nel confronto con GPU disponibile V2/V3 riportano CPU, V4/V5 WebGPU + CPU;
con GPU disabilitata tutti e quattro riportano CPU. Queste prove funzionali
brevi non misurano la convergenza ai due giri o la velocità di apprendimento.

Il controllo di integrità confronta i 76 file allowlisted inclusi con i
sorgenti verificati, l'hash del GLB derivato con la sua provenienza, la presenza
di crediti e librerie offline e i 147 file preesistenti protetti. Il GLB
originale da 36,6 MB non viene duplicato nel pacchetto: il modello derivato
incluso pesa 13.417.152 byte e contiene texture e tre LOD. La verifica finale
con hash SHA-256 dei due eseguibili è in
`verification-v510/package-integrity.json`.

La revisione indipendente dell'interfaccia e la disposizione delle correzioni
F1–F4 sono registrate nel progetto in `.impeccable/review/finish-v510.md`.
Le correzioni riguardano ingombro reale della panoramica, accesso al circuito
nella finestra stretta, etichette operative leggibili e documentazione corrente;
non sostituiscono l'identità esistente e non sono prova di apprendimento.
PRODUCT.md e DESIGN.md conservano la storia del progetto con una sezione
corrente dell'estensione, senza riscrivere i token storici.
