# Product

## Interfaccia corrente in sviluppo: sessione Windows 5.6.0 — 13 ottobre 2026

L'autore richiede un redesign, sceglie circuito grande e telemetria auto in primo
piano, con configurazione e test separati, poi indica un'anteprima chiara come
design da applicare. Dopo la revisione della vera app approva esplicitamente:
«Approvo questa UI reale; l’immagine resta un riferimento visivo».

La nuova superficie usa pannelli bianchi, testo e intestazioni navy, azioni
rosse e indicatore generazione viola. Configurazione a sinistra, circuito
interattivo grande, stato / storico / auto sotto. Navigazione diretta Sessione,
Confronto modelli, Cervello 3D e Affiancati; il confronto apre il pannello, senza
avviare una prova. Mappe 2D/3D, Segui auto/Panoramica/Prima persona, selezione automatica,
diagnostici, sensori, crediti e salvataggi restano funzionali. Lo storico mostra
generazioni realmente registrate, non dati illustrativi. Il redesign ricompone
i controlli esistenti: non cambia solver, fisica, ricompense, anatomia o policy.

La copia Windows di prova corrente, con entrambi i temi e la prima persona, è in
`dist-first-person-dev-560/win-unpacked`; le precedenti copie in
`dist-ui-theme-dev-560/win-unpacked` e
`dist-ui-redesign-dev-560/win-unpacked` sono conservate. I launcher
`Avvia-interfaccia-dev.cmd` / `.ps1` aprono la copia corrente con un profilo
locale separato, `.impeccable/development-ui-profile`.
Numero app e vincolo dei salvataggi restano 5.6.0. Nessuna nuova versione,
pubblicazione, sostituzione del portable/installer o tag. La distribuzione
pubblicata rimane precedente al redesign finché l'autore non chiede una release.

Il sistema visuale sostituisce quello scuro in [DESIGN.md](DESIGN.md) e nel suo
sidecar; la documentazione storica sotto rimane come storia, non come guida del
tema corrente. [Guida di avvio e verifiche](docs/INTERFACCIA-DEV.md). L'approvazione
del riferimento non certifica identità pixel per pixel o migliore convergenza.

### Allineamento e prima persona — 13 ottobre 2026

L'autore chiede di allineare circuito e cervello e aggiungere la prima persona
sull'auto selezionata. In Affiancati, da 1191px, i pannelli condividono bordi
superiore/inferiore e origine dei titoli; il canvas reale occupa lo spazio
residuo, conservando i controlli. A 1190px e sotto resta l'impilamento.

Il selettore nativo Camera del circuito aggiunge «Prima persona · auto
selezionata» e apre il 3D anche dalla mappa 2D. Il punto occhi segue la
carrozzeria e il riferimento del terreno della vettura osservata; trascinamento
e frecce muovono lo sguardo, rotella/pizzico/zoom variano il campo visivo
fra 40° e 95°. Centra/Home ripristina sguardo frontale e 70° restando in prima
persona. Nome e descrizioni accessibili seguono modalità e auto selezionata;
le altre viste ripristinano le proprie istruzioni.

Punto occhi stimato e plancia/volante geometrici originali: non sono dati CAD
o l'abitacolo Porsche originale. GLB esterno e texture restano identici.
Soltanto in questa camera vengono omessi dal disegno l'esterno scelto e quelli
che racchiudono il punto occhi, con anello di selezione, raggi e marker;
popolazione, sensori fisici, rete, ricompense e progressi restano invariati.
È un'estensione del sistema approvato, seed `58a4bd19`, con versione app e
salvataggi 5.6.0. Fonti: [layout](outputs/styles.css),
[controlli e accessibilità](outputs/app.js), [camera](outputs/circuit-3d.mjs),
[geometria originale](outputs/car-3d.mjs) e [GLB esterno](outputs/supplied-car-3d.mjs).
Guida operativa e verifiche: [INTERFACCIA-DEV.md](docs/INTERFACCIA-DEV.md);
confronti documentali: `.impeccable/review/first-person/documenter.md`.

### Tema corrente: variante scura opzionale — 13 ottobre 2026

Dopo l'approvazione della UI reale chiara, l'autore chiede «aggiungi una modalita
scura». Il bottone «Scuro», con luna SVG e `aria-pressed`, seleziona la variante
scura della stessa interfaccia; il chiaro resta predefinito. Solo la preferenza
locale `malecns-ui-theme` viene salvata e applicata prima del foglio di stile;
se lo storage fallisce, la scelta funziona nella pagina corrente senza garanzia
di persistenza. Nessuna modalità sistema/automatica. Type, spaziatura, forme,
scena autentica e significato dei controlli sono condivisi. La richiesta supera
il precedente divieto di chrome scuro soltanto per questa variante opzionale.
Versione e vincolo dei salvataggi restano 5.6.0; build storiche e distribuzioni
preservate, nessuna pubblicazione. Fonti: [stili](outputs/styles.css),
[controller](outputs/ui-theme.js), [documento](outputs/index.html) e
[ridisegno dello storico](outputs/app.js). Le evidenze pregresse e il perimetro
documentale sono in `.impeccable/review/ui-theme/documenter.md`.

## Estensione storica: alberi forniti e case Sketchfab, Windows 5.4.0

L'utente fornisce il modello degli alberi e il suo link Sketchfab; chiede case
scaricate dal medesimo sito per Monaco e Le Mans. Due mesh reali dello ZIP e
texture originale; edificio di ChristosRami.studio a Monaco, European House #3
di Satik64 a Le Mans. Licenze CC BY 4.0 verificate e adattamenti dichiarati nei
[crediti](outputs/assets/ENVIRONMENT-CREDITS.md). Posizioni e dimensioni sono
scenografiche, non le architetture reali rilevate lungo i circuiti.

Istanziazione GPU, texture condivise, due LOD e cache locale per circuito.
Le impronte evitano strada, vie di fuga e sovrapposizioni; fondazioni solamente
visive raccordano le case al terreno disegnato. Comandi e layout conservati:
Dettagli include anche case/alberi; stato di caricamento e crediti usano lo spazio
esistente. 2D, Segui auto, Panoramica e cervello restano. Nessuna nuova collisione,
né modifica a fisica, sensori, reward o apprendimento della 5.3.0.

Estensione Operate nell'identità esistente, non un redesign: DESIGN.md e sidecar
intatti. Gli asset non sono raster generati. [Guida](outputs/ASSET-AMBIENTE-v540.md),
[provenienza](outputs/assets/environment-provenance-v1.json) e
[verifiche](outputs/VERIFICA-v540.md). App/progressi richiedono 5.4.0 esatta;
build, release e salvataggi precedenti preservati.

## Estensione precedente: vegetazione e dislivello fisico, Windows 5.3.0

L'utente chiede vegetazione e dislivello del circuito e conferma esplicitamente
che il rilievo deve influenzare la fisica. Un campo di quota condiviso rialza
strada, bordi, cordoli, protezioni, auto e camera, senza cambiare la carreggiata
XY. Profili periodici a raccordo continuo per Monza, Monaco e Le Mans; il
Laboratorio resta piano. Le fonti primarie forniscono solo contesto parziale:
quote, ancoraggi e raccordi locali sono dichiarati stimati, non un rilievo.
Scala verticale 1:1. [Guida](outputs/TERRENO-v530.md) e
[catalogo](outputs/data/terrain.js).

La gravità è proiettata nel piano tangente; pendenza e curvatura verticale
modificano accelerazione, frenata e carico normale delle gomme. Il solver
rimane vincolato al contatto: niente salti, volo libero o sospensioni 3D complete.
I 17 canali fisici esistenti ricevono la telemetria risultante; nessuna quota,
centerline o traiettoria ideale entra nella policy. Ricompense, anatomia,
decoder, apprendimento e calcolo neurale CPU/GPU sono conservati. Il diverso
ambiente fisico può cambiare le prove: non si rivendica una convergenza migliore.

Alberi e cespugli nativi istanziati, con RNG locale deterministico, restano fuori
da carreggiata e vie di fuga. La vegetazione è solo visiva e non aggiunge
collisioni; auto ghost come prima. Dettagli mostra/nasconde verde e protezioni,
mai il terreno fisico. Comandi, mappa 2D, Segui auto, Panoramica e atlante sono
conservati; quota, pendenza e carico si leggono nella telemetria esistente.
È un'estensione Operate, non un cambio di identità; DESIGN.md e il sidecar
rimangono intatti; il contratto di lavoro e i report di revisione sono privati,
non risorse caricate dall'app.

App e file di progresso richiedono la versione esatta 5.3.0. Distribuzioni,
release e salvataggi precedenti sono preservati. Verifiche della sorgente in
[VERIFICA-v530.md](outputs/VERIFICA-v530.md), controlli dei pacchetti e commit
distribuito nelle note della release 5.3.0.

## Estensione precedente: ambiente 3D, Windows 5.2.0 — 11 ottobre 2026

La richiesta riguarda barriere e vie di fuga della vista 3D, non strade o
varchi di servizio. L'estensione visuale aggiunge guardrail, muri di protezione,
recinzioni e banchine, con sei zone a Monza, tre a Monaco e nove a Le Mans.
Il Laboratorio usa protezioni sintetiche. Il comando esistente “Dettagli:
sì/no” controlla l'intero ambiente anche in pausa; Segui auto, Panoramica,
2D e atlante restano disponibili. Fonti: [guida](outputs/AMBIENTE-3D-v520.md),
[catalogo](outputs/data/scenery.mjs) e [renderer](outputs/track-scenery.mjs).

Gli ancoraggi riprendono le sezioni del circuito già registrate. Materiali,
estensioni, altezze e distanze sono stime autoriali esplicite. Le mappe FIA/ACO
consultate sono edizioni 2025: non si dichiarano rilievi reali o configurazioni
2026 verificate. Le geometrie statiche sono unite e raggruppate per materiale;
non vengono rigenerate nei tick neurali. Il perimetro scenografico viene
raccordato senza incroci nelle chicane e senza aggiungere ostacoli alla fisica.

Nessuna variazione a carreggiata, dati anatomici, sensori, fisica, ricompense,
policy o motore dell'apprendimento. Nessuna prova di convergenza rivendicata
da questa modifica visuale. App e salvataggi passano a 5.2.0, con il vincolo
richiesto di versione esatta; file e distribuzioni 5.1.0 sono preservati.
La verifica funzionale e di conservazione è registrata in
[VERIFICA-v520.md](outputs/VERIFICA-v520.md); controlli dei binari e commit
distribuito sono riportati nelle note della release 5.2.0.

## Estensione corrente: circuito 3D e apprendimento, Windows 5.1.0 — 11 ottobre 2026

La 5.1.0 estende il laboratorio locale esistente con “Vista 3D”, accanto a
“Mappa 2D”. Alla prima attivazione 3D la camera parte in “Segui auto”;
“Panoramica” è subito disponibile nel selettore “Camera del circuito”.
Entrambe osservano la stessa auto fisica selezionata. Orbitare, spostare,
zoomare o cambiare camera funziona anche in pausa senza avanzare fisica o
apprendimento. Restano disponibili mappa 2D, atlante neurale, vista affiancata,
selezione automatica/manuale, controlli e accesso diretto al test modelli.
Fonti: [guida corrente](outputs/VISTA-3D-v510.md),
[controlli della vista](outputs/app.js) e [renderer](outputs/circuit-3d.mjs).

La carreggiata 3D è triangolata dagli stessi poligoni esterno/interno del
corridoio fisico, con identica scala metrica e larghezze variabili usate da
sensori, collisioni e mappa 2D. I cordoli riprendono il catalogo documentato.
Terreno piano e altezze dei bordi restano schematici; larghezze locali e
registrazione delle mappe restano stime dichiarate. Non sono disponibili
altimetrie rilevate, barriere reali o edifici ricostruiti. La camera inquadra
l’ingombro della carreggiata senza allargarla. Fonti:
[guida 3D](outputs/VISTA-3D-v510.md) e
[geometria e camera](outputs/circuit-3d.mjs).

Il modello esterno Porsche deriva da 2024-porsche-992-gt3-r.zip fornito
dall’utente. Il GLB locale con texture incorporate ha tre LOD esterni:
192.273, 16.832 e 5.548 triangoli; al massimo un’auto dettagliata e dodici
intermedie, con geometrie/materiali condivisi e dettaglio adattato alla distanza.
I corpi coincidenti alla partenza vengono consolidati solo nel disegno; tutti
gli agenti restano indipendenti e selezionabili. Ruote e luci leggono la
telemetria, senza modificare dinamica, collisioni o comandi. L’attribuzione a
MattDoesBlender e la licenza CC BY-NC-SA 4.0 sono riportate dai metadati del
file fornito: il modello non è CAD ufficiale Porsche né geometria omologata.
Fonti: [crediti e limiti della verifica della fonte](outputs/assets/PORSCHE-3D-CREDITS.md),
[provenienza e hash](outputs/assets/porsche-992-gt3-r-provenance.json) e
[flotta importata](outputs/supplied-car-3d.mjs).

L’apprendimento è leggibile attraverso il progresso fisico in metri
dell’ultima generazione, la media della popolazione, il massimo dei giri validi
e il miglior tempo sul giro nello storico disponibile. Il grafico parte da
“Distanza percorsa (m)”; “Punteggio netto (pt)” rimane una modalità distinta
e l’obiettivo di selezione comprende ricompense e penalità. Più punti non
dimostrano più strada o un giro più rapido. Il confronto della distanza usa
le mediane di due gruppi consecutivi di cinque generazioni e resta in attesa
finché non ne sono concluse dieci; un giro non completato non ha un tempo
misurato da presentare come successo. Fonti:
[metriche](outputs/learning-metrics.js), [interfaccia](outputs/index.html) e
[aggiornamento dei valori](outputs/app.js).

L’evidenza corrente è circoscritta: su Monza, seme 7717, 16 agenti,
mutazione 0,16 e 30x richiesti, le mediane delle ultime cinque generazioni
sono circa 800 m per tutti e quattro i modelli, con zero giri completati.
Il numero di generazioni osservate varia; V3 ne ha soltanto cinque, quindi
le sue finestre iniziale/finale coincidono. Sul Laboratorio V2, 32 agenti
e dodici generazioni naturali per avvio, due semi migliorano e uno peggiora,
ancora senza giri. Sono risultati limitati, non convergenza ai due giri,
validazione su tutti i circuiti/semi o aumento dimostrato della velocità di
calcolo/apprendimento. I 30x richiesti e il tempo CPU di invio del rendering
non misurano throughput o FPS. Dati, condizioni e revisione delle
ricompense/esplorazione: [VERIFICA-v510.md](outputs/VERIFICA-v510.md) e
[diagnosi Monza](outputs/learning-verification-v510/final/diagnosis.json).

App e file .malecns-save richiedono esattamente la versione 5.1.0.
I file 5.0.0 richiedono l’app 5.0.0 e non vengono migrati o riutilizzati
silenziosamente. Restano conservati progressi e distribuzioni precedenti.
Il ripristino conserva la prova e tutti i worker, ripartendo dalla partenza
della generazione in pausa, non dal preciso stato a metà giro. Fonti:
[validazione della versione](outputs/progress-save.js) e
[verifiche e conservazione](outputs/VERIFICA-v510.md).

Il rapporto corrente registra 25/25 controlli UI della sorgente dopo le
correzioni; nell’app impacchettata registra, sia con GPU disponibile sia
con GPU disabilitata/CPU, 18/18 controlli UI, 49/49 sui salvataggi e 37/37
sul test modelli, senza errori di console. Sono verifiche funzionali, con
i limiti di apprendimento sopra dichiarati. Integrità finale degli artefatti,
completamento di portable/installer e consegna rimangono assegnati al main.
Fonte: [rapporto aggiornato 5.1.0](outputs/VERIFICA-v510.md).

## Test access refinement: Windows 5.0.0, 9 October 2026

The user asks to remove the pictured “Campione automatico e regole” disclosure
and cannot find the model test. Remove that disclosure and its resume-champion
action, not local autosaves or shareable progress files. Add a direct, visible
“Apri test modelli” button in the top bar. Opening scrolls to the existing test
and focuses Start or Stop without starting a trial. Keep keyboard disclosure
state synchronized and leave map/atlas and all non-UI runtime unchanged.
App/save version stays 5.0.0. Preserve both delivered releases; publish this
refinement in dist-test-access-v500. Diagnose visibility from source, not an
unverified assumption that the user opened a particular old executable.

## Cold-start model test: Windows 5.0.0, 9 October 2026

The user confirms that V2/V3/V4/V5 must start from zero under equal circuit,
population, mutation, requested speed and seed settings. One worker per model;
sequential trials avoid competition between tested models. Success requires
two real ordered laps by one non-diagnostic agent, followed by natural completion
of its generation. Failed generations continue to train and are counted, not
mistaken for success. Wall-clock budget is explicit, configurable and optional;
it is not a new cap on normal simulated episodes. Report wall clock, all physical
simulation time, generations, maximum laps, progress and the successful agent's
individual lap times. Export one JSON report. One seed is not a convergence claim.

Pause the existing training populations and retain their exact in-memory state,
including their separate GPU buffers. Use independent test workers and prevent
test autosaves/preferences/manual vehicle intervention. Restore the existing
trial afterward. Neural, physics, reward and saved-state laws remain unchanged;
app/save version stays 5.0.0. Extend the incumbent Operate disclosure/table UI
while preserving the live interactive circuit and 3D atlas. New deliverables
belong to dist-test-mode-v500; existing portable and saves remain intact.

## Read-only model comparison: Windows 5.0.0 UI build, 1 October 2026

The user requests differences among existing models inside the interface.
Add a closed-by-default native disclosure below the model selector, two compact
tables and the current-model highlight. Explain anatomical nodes/edges versus
dense/sparse slot limits, passes, real descending readout, learned parameters,
gain groups and shared sensors/rate/population. No faster-learning claim.
Catalog values are unit-checked against actual compiled graphs, not an arbitrary
power rating. Preserve the interactive map/atlas and all scientific/learning
settings. The presentation creates eight rows once and updates on model change
or save import only. No additional graph loading or per-frame work.

App/save version remains 5.0.0: neural, physics, reward, data and progress core
are identical to the delivered release. Keep earlier builds intact; new Windows
artifacts belong to dist-model-ui-v500. Record tests, actual native inspection
and previous-5.0.0-save imports separately in outputs/VERIFICA-MODELLI-UI-v500.md.

## Current neural-capacity extension: Windows hybrid 5.0.0, 1 October 2026

The requested V5 is a separate full-graph profile. No invented anatomical
neurons: retain the verified 166,700 nodes and 6,242,118 edges. Expand active
capacity 8192 to 32768, recurrence two to four passes and lower both sparse
thresholds by half; retain the original 64 descending readouts and add 64
reachable real descending neurons outside the historical core. Double learned
gain groups to 32, 346 parameters, policy revision 5. Real activity only, no
route or sensor motor bypass. V2/V3/V4 outputs are checked against frozen 4.8.

Preserve reward laws, ghost Porsche physics, metric circuits, sensors, renderer,
map/atlas and 100 agents. Shared anatomical binary, one hybrid full worker,
16 initial cars; CPU fallback keeps the same capacities. More compute is
honestly labeled, not called faster convergence. Native full matrix, strict
model/version-locked saves, 245 tests and bounded natural cold-start evidence
are separate checks. Preserve all old builds and progress. Operate selector
and compact native hint extend incumbent identity, no asset or new layout.
Sources: outputs/MODELLO-V5.md and VERIFICA-v500.md.

## Current scoring extension: Windows hybrid 4.8.0, 30 September 2026

The user explicitly authorizes a complete reward-system replacement. Episodic
net fitness ranks rollouts for ES, elites and parents; raw laps/progress no longer
override penalties. New unique progress, ordered scoring checkpoints, lap/pace
terms, immediate/idempotent terminal costs, no-lap and per-lap previous-generation
regression. Relative lap scales, real wall risk/slip only, no arbitrary G/brake
penalty. Productive agents have no overall time cap; stalled/crawling episodes
end, two laps maximum. Historical/island records exclude only the moving
comparison cost; current training includes it. Records are reevaluated in a
fresh episode, never trusted as a current rollout's result.

Preserve anatomy, neural sensor/motor functions, GPU kernels, metric variable
maps, ghost-car Porsche physics and interactive map/atlas. Operate-mode ledger
in the existing inspector, exact reference/score explanations, no new visual
identity or assets. New app/save 4.8.0 and scoring namespace preserve old releases.
Tests and bounded cold-start evidence must not be described as all-model
convergence. Sources/evidence: outputs/RICOMPENSE-v480.md and VERIFICA-v480.md.

## Current geometry extension: Windows hybrid 4.7.0, 30 September 2026

The user authorized explicitly estimated widths where primary survey data is
missing. Preserve the original source-map centerlines by one uniform transform;
calibrate complete lap lengths to 5793 / 3337 / 13626 metres. Use metric Porsche
dimensions and 61 named, estimated width anchors with periodic smooth transitions
covering every segment. Monza's published global 10–12 m range is source-backed;
all local assignments and Monaco/Le Mans width ranges remain model choices.

One actual variable corridor for rendering, wall sensors, collision and off-road
classification. No route cues or width metadata in the neural policy, no changes
to anatomical data, learning, GPU kernels, workers, vehicle laws or score
coefficients. Existing source-backed curb zones re-register through the same
source coordinate transform. No laser survey, measured radii, altitude or actual
barrier geometry claim. Circuit revision 2 and exact app-version save isolation.

Operate UI: compact metric summary, local estimated width, named segment focus
in the existing selector; retain interactive map, best-auto and 3D atlas. Full
unit/geometry checks plus actual portable GPU/CPU 100-agent matrix and save
regressions are distinct from convergence or sustained 30x measurements.

## Current observation extension: Windows hybrid 4.6.3, 30 September 2026

Automatically inspect the best active car of the displayed worker population,
enabled by default. Use the existing lap/time/progress/fitness comparator, keep
exact ties stable, switch away from an inactive leader and show the final best
if no car remains active. Dropdown/map picking opts into manual observation;
the compact Auto toggle restores automatic selection. Existing follow camera
tracks the selected car only when the user has chosen that camera mode.

Keep every sensor, telemetry field, preview and atlas tied to the same real ID.
Full GPU samples may arrive on the next tick; a reset-pending paused atlas must
show its explicit wait instead of advancing the brain or fabricating activity.
No new asset, neural policy, physics, scoring or training change. Preserve old
releases and exact-version save rules: 4.6.2 files require 4.6.2, not 4.6.3.
Evidence: outputs/VERIFICA-v463.md and outputs/selection-core-verification-v463.json.

## Current persistence extension: Windows hybrid 4.6.2, 30 September 2026

Share the current model/circuit training trial as one `.malecns-save` JSON file.
Native Save/Open pickers, exact application-version compatibility, checksummed
bounded validation and explicit replacement confirmation. Preserve every island's
genomes, optimizer, champions/archive, RNG and last 100 history entries; restart
the saved generation at the start line, paused. Not a mid-lap physics/live-brain
or GPU snapshot, cryptographic authentication or cross-version migration.

Keep the working map/atlas and incumbent controls. One compact Save/Load row
under the model selector, readable version/restart scope and polite status.
No new assets or learning algorithm change. Fix the existing mutation-slider
bridge so the requested value is applied to the workers and saved accurately.
Old releases and local checkpoint keys remain intact; new automatic champions
are isolated by exact app version. Evidence is recorded in outputs/VERIFICA-v462.md.

## Current visual refinement: Windows hybrid 4.6.1, 30 September 2026

The latest request improves the car's visible representation only. A generated
transparent orthographic 992 GT3 R illustration replaces the primitive glyph
at useful map zoom levels; distant cars remain agent-coloured dots. Cached paint
materials/mips, a small inspector preview and an existing-camera close-up action
keep the map interactive. Actual wheel steering and brake commands are read,
never synthesized into control. Raster failure keeps a usable vector fallback.

Not a real interactive 3D car mesh or official Porsche CAD. The full prompt,
asset and official design-reference URL are retained under outputs/assets.
Physics, reward learning, graph files, circuit walls/curbs and the 4.6 checkpoint
namespace are unchanged byte-for-byte; no new learning result is claimed.
Evidence: outputs/VERIFICA-v461.md and outputs/car-core-verification-v461.json.

## Current physical implementation: Windows hybrid 4.6.0, 30 September 2026

The explicit user request supersedes the previous map-only/compute-only invariant
that left physical dynamics unchanged. Implement a reduced SI Porsche 911 GT3 R
(992), model year 2026, based on its official sheet. Separate public engine,
dimensions and transmission specifications from estimated tyre, gear, torque,
aero and chassis settings. Four rotating contact patches, combined-slip forces,
planar body/yaw inertia, load transfer, spring-damper pitch/roll, fuel mass,
thermal/wear states, rear LSD, six sequential gears, ABS/TC and overrev protection
replace the old artificial acceleration model. Flat plane, not a full commercial
simulator or validated Porsche/Michelin/WEC vehicle model.

The controller has 28 sensor channels and 202 learned parameters. Six measured
powertrain channels are appended, not supplied route commands. Neural control
stays at 10 Hz, episode ticks at 60 Hz, wheel dynamics at 240 Hz. V2/V3/V4 anatomy,
GPU sparse budget, interactive map, atlas and 100-agent option remain. Automatic
shifts use RPM only. Manual diagnostic edits are isolated to the selected car
and excluded from learning/champions. New physics-specific save keys preserve
older saves without silently reusing incompatible policies.

Official lap lengths calibrate metric conversion uniformly without modifying
existing road polygons or pretending surveyed local widths/elevation. Cars are
ghosts; wall contacts terminate episodes rather than simulate deformable crashes.
No curb-height forces, full 3D suspension, weather, damage or drafting is claimed.
Current evidence: outputs/VERIFICA-v460.md, outputs/vehicle-992-provenance.json,
outputs/physics-992-learning.json and outputs/test-results-v460.tap. The 12-generation
cold V2 Lab probe completed two laps at generation 11. This does not prove
all-circuit/all-model learning convergence or a real 30x rate with 100 agents.

## Historical implementation: Windows hybrid 4.4.0, 29 September 2026

The Electron application runs offline with free vehicle physics, ghost cars,
real-wall sensors and four faithful circuit profiles. V4 loads 166,700 annotated
MaleCNS neurons and 6,242,118 strong directed edges; V3 and reconstructed V2 are
separate, smaller graph profiles. The complete recurrent solver is approximate,
with two passes and an 8,192-slot active budget.

The assisted 4.3 wall-following/speed controller has been removed. A randomly
initialized neural policy learns from episodic rollout rewards using a rank-based
diagonal evolution strategy. Sensor injection, sixteen shared synaptic gains on
existing edges, a readout of 64 actual descending neurons and two action biases
are learned: 190 parameters total. Actions require recurrent neural activity;
no route, coordinates, target-speed formula or teacher actions enter the policy.
Recurrence/actions run at 10 Hz and physical dynamics at 60 Hz. Full V4 recurrence
uses WebGPU when available; physics and optimization remain CPU. This is an
artificial connectome-based model, not validated fly physiology.

Current evidence: outputs/README.md, outputs/VERIFICA.md,
outputs/test-results-v44.tap and outputs/benchmark-all-results.json. Prior version
notes are historical and cannot establish the current learning result.

The assisted 12/12 benchmark is preserved in outputs/benchmark-assisted-v43.json
and must not be reported as cold-start learning. V2 has completed two Lab laps at
generation 61 from random policies; V3/V4 progress improvements are documented
separately without claiming completed laps or convergence on every map.
Checkpoints use a new RL-specific namespace.

## Historical implementation: V3.1 + connectome atlas, 17 September 2026

V3 adds Monza, Monaco and Le Mans from dated official source maps, uniformly scaled,
with an overview/follow camera and independent circuit checkpoints. Real-map profiles
are approximations, not surveys; road width and car dimensions remain conventional.
The user explicitly chose map fidelity over easier, widened profiles. See outputs/CIRCUITI.md.

The following historical design brief describes the superseded prototype, not the current runtime.
V2 fixed route-constrained motion with free bicycle-model physics and seven wall raycasts.
The current runtime uses a fixed-step dynamic vehicle approximation with longitudinal/lateral
velocity, yaw inertia, tire-force limits, slip and G-force readouts. The controller receives
seven visual ray channels plus seven normalized physics telemetry channels through a declared
runtime adapter. It keeps wall collisions but intentionally treats cars as ghosts to each other:
no car-car collision or drafting model.
The current connectome atlas embeds 7,721 real MaleCNS neurons, 242,486 directed connections, official soma coordinates where available, and an orbitable 3D map of the strongest active edge contributions from the selected agent. The underlying official export is larger, but the browser runtime uses a declared, reproducible upstream subset that remains evolvable.
R/neuPrint is not installed or executed by the app; direct offline data replaces that
dependency. Rate dynamics, sensor injection and motor decoding are deliberately artificial;
this is a reduced connectome-driven model, NOT a biologically validated whole fly brain. The current
runtime also scores forward progress, backtracking, collisions, stalls and completed laps; lap bonuses
depend on measured lap time, slow laps receive an additional severe time penalty, each car is capped at
two laps per generation, zero-lap agents receive a generation-end penalty, slower laps regress against
the previous generation’s best lap, generations have no automatic clock cap, and the UI exposes 0.5x–30x speed.
See outputs/README.md, outputs/data/provenance.json and outputs/test-results.tap for current evidence.

## Historical V1 brief (superseded)

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: plain static HTML/CSS/JavaScript with a Canvas 2D simulation so the app runs locally without a build step or external runtime dependency.

## Users

The primary user is the person experimenting with the app locally: they want to watch a population of cars drive around a circuit and understand how a fly-inspired controller changes their behavior.

## Product Purpose

The app makes it possible to observe, pause, reset, and evolve a small car population on a circuit. Success means the user can immediately see the simulation running, inspect the active controller signals, and run a few generations without needing a server, account, or external service.

## Positioning

The distinctive mechanism is an educational “flight-brain cockpit”: the driving loop exposes interpretable sensor rays and controller signals, while an offline evolutionary proxy is clearly labeled as a proxy for the `natverse/malecns` dataset rather than pretending the R package is a drop-in trained driver.

## Operating Context

The first surface is a desktop-first local simulator with a compact responsive view for smaller windows. The user operates it through play/pause, reset, population-size, mutation, speed, and controller-mode controls; the simulation renders on a canvas and an inspector reports telemetry for the selected car.

## Capabilities and Constraints

- Must run from the local workspace with a simple static server or direct `index.html` open.
- Must include a visible circuit, multiple cars, sensor rays, generation state/time, best score, and selected-agent telemetry including reward, penalty, and lap timing.
- Must support an offline demo controller so the app remains usable without Neuprint credentials.
- The repository `natverse/malecns` is an R package that exposes the male Drosophila CNS dataset through Neuprint; it is not itself a ready-to-run driving model. Any direct integration remains an explicit, future adapter and must not be represented as completed.
- The first implementation uses a deterministic fly-inspired control layer plus lightweight evolutionary mutation in JavaScript. Reward rules, lap-time bonuses and speed controls are illustrative and synthetic, not measurements of biological fly behavior.
- The app must avoid inventing a named fly neuron as the controller unless a real mapping is later supplied and verified.

## Brand Commitments

- The product name used in the prototype is “MAL-E CNS / Circuit Lab”.
- The supplied Steam game is a functional inspiration for evolutionary driving, feed-forward signals, editable controls, and track simulation; the prototype must not claim to reproduce its code or assets.
- The supplied `malecns` repository is the source reference for the biological-data adapter boundary.

## Evidence on Hand

- Steam store description for `AI Learns To Drive`, accessed 16 September 2026: it describes a top-down sandbox using a simple feed-forward neural network trained with evolutionary algorithms, configurable inputs/outputs, training parameters, and custom tracks.
- GitHub repository `natverse/malecns`, accessed 16 September 2026: README describes access to the Janelia FlyEM whole male central nervous system dataset through Neuprint, with R installation and authentication requirements.
- No Neuprint token, exported connectome, trained fly controller, or game asset was supplied in the workspace. Do not fabricate these.

## Product Principles

1. Show the mechanism immediately: the circuit and active agents occupy the first viewport.
2. Make the controller inspectable: sensors, signals, fitness, and generation state are visible.
3. Keep the biological boundary honest: dataset access, proxy behavior, and untested compatibility are labeled.
4. Reward experimentation: important controls are local, reversible, and fast to reset.
5. Prefer a stable offline baseline over a fragile external dependency.

## Accessibility & Inclusion

Use visible labels, keyboard-focusable controls, high-contrast status text, reduced-motion support, and do not rely on color alone to identify the selected or best agent.
