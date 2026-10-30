# Stato neurale corrente: ricerche private del 15–16 ottobre 2026

Queste prove perseguono l'apprendimento reale, non un percorso prescritto.
Riguardano soltanto **V3 / Monza da un modello già allenato**. Il grafo resta
di7.721nodi e242.486connessioni anatomiche MaleCNS, con dinamica artificiale;
più coefficienti del decoder non significano nuovi neuroni biologici.
Non dimostrano convergenza da zero, sugli altri modelli o sugli altri circuiti.

## Che cosa cambia nel nuovo correttore

Il precedente correttore locale manteneva due offset dopo una condizione
neurale. Il nuovo usa lo **stato neurale corrente**: otto proiezioni non
supervisionate di dati realmente registrati, più una costante, alimentano18
coefficienti di sterzo/azione longitudinale. Il contesto si attiva soltanto da
osservazioni neurali; non riceve coordinate, progresso, contatore giri,
orologio o comandi ideali.

Le proiezioni usano solo le516colonne neurali/del controller della raccolta
effettiva. Le colonne di azione, premio, distanza e tempo sono escluse dal
calcolo delle proiezioni. Le prime256osservazioni locali vengono poi confrontate
con una finestra distinta di1024osservazioni. Cambiare finestra modifica sia il
supporto del contesto sia le proiezioni: non è un confronto che isola una sola
causa del mancato apprendimento.

La fisica, i sensori reali, il grafo, le ricompense severe R5 e l'esclusività
gas/freno restano invariati. Il genitore e tutti i suoi ricordi vengono raggiunti
fisicamente e catturati; ripristinare quel vero stato accelera la pratica.
**Un episodio di pratica non viene contato come generazione dell'app o come
prova di un giro dal traguardo.** Ogni modello selezionato ha ulteriori prove
complete e native indipendenti.

## Due ricerche concluse, compreso l'esito negativo

| Ricerca | Candidati fisici di pratica | Migliore senza urto | Punteggio | Giri |
| --- | ---: | ---: | ---: | ---: |
| Genitore compatibile Windows | — | 6.584,839 m | 4.052,109 | 1 |
| Stato corrente, finestra256 | 256 | **6.590,792 m** | **4.057,078** | **1** |
| Stato corrente, finestra1024 anticipata | 256 | 6.584,839 m, genitore conservato | 4.052,109 | 1 |

La prima ricerca aggiorna16volte l'ottimizzatore e cambia tutti i18coefficienti
del modello selezionato. Guadagna **5,952695m**, non un intero giro. Il tempo
del primo giro resta742,550160958secondi simulati, circa12min22,55s, e la prova
termina per ritmo insufficiente a849,483333333secondi. Il guadagno non risolve
il blocco nel secondo giro e non dimostra guida competitiva.

La seconda ricerca anticipa la prima attivazione effettiva dal controllo8300
al7727, cioè57,3secondi simulati, e usa1024stati reali. Dopo256candidati non
trova un candidato pulito migliore neppure del proprio genitore. Conserva un
modello con18coefficienti nulli: l'ottimizzatore è stato aggiornato, ma quel
decoder selezionato **non ha appreso un miglioramento**. L'esito negativo resta
conservato e non retrocede il migliore di ricerca.

In entrambe le ricerche i candidati effettivamente valutati sono quelli passati
all'ottimizzatore, anche quando vengono limitati agli estremi. Non vengono
assegnati punteggi fittizi a prove interrotte. Il campione è riprovato realmente
in ogni gruppo; distanza maggiore con urto non significa promozione.

Il migliore è riprodotto in **due episodi fisici dal traguardo** e **due processi
nativi che caricano il modello numerico autonomo**. Il verificatore riconcilia
tutti i256record, l'intero stato dell'ottimizzatore e le tracce complete.
Non sostiene di aver ripetuto fisicamente ogni candidato una seconda volta.

Evidenze sotto `.impeccable/review/neural-sacl/`:

- `neuronal-statehead-6584-cma-search/report.json` e `verification.json`;
- `neuronal-statehead-6584-cma-search/clean.malecns-statehead.json`, SHA-256
  `5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35`;
- traccia completa del migliore:
  `3e3658c1543fe43791dd21db1410e0e58213691a2d6569fc2d34146f45651244`;
- `neuronal-statehead-early1024-search/report.json` e `verification.json`:
  esito negativo verificato, non un nuovo campione globale;
- `neuronal-verified-model-catalog.json`: migliore di ricerca6.590,792m distinto
  dal campione6.584,839m compatibile con la finestra Windows congelata.

Il catalogo controlla modelli, prove native, sorgenti e runtime e **non modifica**
il vecchio registro della finestra Windows. Passare a un decoder incompatibile
richiede una nuova integrazione separata, non un falso caricamento compatibile.

## Audit delle uscite: non basta aggiungere altri pesi

Il decoder a256stati raggiunge almeno0,819di attivazione finale in tutti i256
candidati. Quello a1024stati raggiunge1in tutti i256. Questo esclude una
persistente scarsa attivazione finale in quelle prove; non dimostra che tutte
le fasi iniziali dell'attivazione siano irrilevanti.

Un audit algebrico separato ripete il controller sui suoi8495ingressi neurali
realmente registrati. Ingressi intermedi, residuo della rete e ogni comando
ricostruito coincidono: zero differenze e intera traccia corrispondente.
Non guida nessuna auto e non fornisce azioni da imitare all'ottimizzatore.

Due campioni della stessa fascia di distanza mostrano:

| Campione effettivo | Comando prima degli ultimi correttori | Comando finale |
| --- | --- | --- |
| Primo passaggio,751,03m | sterzo−0,00558; longitudinale−0,20907 | uguale: frenata |
| Secondo passaggio,750,38m dal giro | sterzo+0,05066; longitudinale+0,95601 | sterzo+0,01779; longitudinale+0,70956: gas |

Anche intorno a500m il comando precedente al correttore esterno è molto diverso
fra i due passaggi. Le auto **non** hanno però identiche condizioni fisiche,
sensori o ricordi in quei campioni: la tabella non prova un guasto del freno,
non identifica da sola la causa e non definisce azioni corrette per la curva.
Indica che una parte importante della differenza è già presente nel controller
precedente, non nasce soltanto negli ultimi18coefficienti.

Evidenza: `neuronal-command-component-audit/report.json`. La distanza e il tempo
sono etichette del report, mai ingressi del calcolo dei comandi.

## Prototipo prestazionale, separato dalla finestra aperta

Un nuovo motore sperimentale conserva una cache **del solo passaggio neurale
Float64 puro**. Per ogni auto continuano a essere eseguiti fisica, sensori,
memorie del controller e comandi. Non viene riprodotta una guida registrata.
Un riuso richiede uguaglianza dei byte di attività, iniezione e guadagni,
topologia/pesi/gruppi immutati e confronto dei dati anche dopo l'indicizzazione
tramite hash. Cambiamenti in-place invalidano la cache; casi non supportati
ritornano al kernel originale. La cache è limitata a32voci per grafo.

Tre test verificano uguaglianza dei byte degli array, scambio dei buffer,
isolamento delle copie, invalidazione di pesi/gruppi/ingressi e fallback.
Un confronto successivo usa **quattro agenti completi con pesi distinti già
realmente valutati**:33.815controlli per esecuzione. Risultati e intere tracce
di comandi/progresso/tempo coincidono fra motore originale e nuovo.

| Misura di questa singola coppia sequenziale | Originale | Cache neurale |
| --- | ---: | ---: |
| Tempo trascorso | 198,664 s | 183,520 s |
| CPU del processo | 188,110 s | 162,047 s |

Riduzione misurata:7,62%del tempo trascorso e13,86%del tempo CPU.24.903su33.815
passaggi sono riusati. Sono misure di **un benchmark nativo a quattro auto**,
non FPS, prestazioni garantite dell'intera app, accelerazione GPU o migliore
velocità di apprendimento. Le app dell'autore rimangono aperte; ordine delle
prove, turbo, cache e carico esterno non sono randomizzati.

Un ulteriore confronto esegue due controller distinti nei due motori in
lockstep: **16.912confronti a ogni controllo**, con intero oggetto neurale,
vettura fisica completa, osservazioni, sensori, trail, premi, comandi e stato
del correttore identici. È prova su traiettorie complete finite e sul componente,
non una dimostrazione universale per tutti i grafi/modelli possibili.

Evidenze:

- `neuronal-memo-four-reference/report.json`;
- `neuronal-memo-four-memo/report.json` e `verification.json`;
- `neuronal-memo-full-state-equivalence/report.json`;
- moduli nuovi `exact-coo-memo.cjs`, `neural-command-live-memo.cjs` e
  `neural-statehead-memo-runtime.cjs`. I moduli originali restano invariati.

Il nuovo motore dichiara un'identità sperimentale propria; non viene spacciato
per il motore dei salvataggi precedenti. **Non è installato nella finestra
Windows consegnata** e non cambia la release5.6.0.

## Feedback appreso dei comandi: confronto separato del 16 ottobre

Il nuovo esperimento `neuronal-affine-6590-search` parte dal campione di
ricerca da 6.590,792 m, non dal modello compatibile con la finestra Windows.
Quattro parametri modificano guadagno e bias di sterzo e comando longitudinale
del decoder neurale. Sono osservati i suoi comandi effettivi; non vengono
fornite azioni ideali, coordinate, numero del giro o una traiettoria da seguire.
Con parametri nulli la trasformazione è esattamente identica al genitore.

Il preflight conserva l'intera traccia del genitore sia nell'episodio completo
sia nel caricamento nativo separato. La ricerca ha valutato 256 candidati
fisici, con 16 aggiornamenti dell'ottimizzatore, senza superare il campione
secondo i criteri congiunti di progresso, giri e punteggio senza urto.
Il candidato più lontano nel suffisso ripristinato raggiunge 6.597,201 m,
ma termina con **urto** e punteggio 2.193,053: non è promosso e non dimostra
un miglioramento valido. Non è ancora una prova indipendente dal traguardo
di quel candidato.

Evidenze: `neuronal-affine-6590-search/preflight.json`, `progress.json`,
`report.json` e `verification.json`. Le verifiche finali sono concluse:
due episodi completi dal traguardo e due caricamenti nativi indipendenti
riproducono le metriche e l'intera traccia del genitore. Il controllo numerico
separato ricostruisce tutti i batch e gli aggiornamenti dell'ottimizzatore.
L'esito è negativo per l'apprendimento: resta selezionata la correzione nulla,
non un nuovo modello migliore. I file di prova sono conservati, non promossi.
Questo correttore non è installato nell'app e non cambia il suo modello
predefinito o i controlli di compatibilità dei salvataggi.

## Verifiche successive — 2026-10-19

Nel learner V3/Monza, il confronto deterministico da due stati di pratica del
salvataggio gen64 ha provato sei mutazioni bilanciate e sei focalizzate sullo
sterzo per ciascuno stato, con identici ricordi ricorrenti, fisica e rollout
da 720 tick. Nessuna delle 24 mutazioni ha superato il proprio genitore; le
varianti focalizzate hanno avuto meno progresso locale medio delle bilanciate.
Per questo la modalità di mutazione forzata sullo sterzo è stata rimossa dal
codice attivo, senza cambiare la policy verificata o il file dell'autore.
Rapporto: `steering-practice-search-gen64/report.json`.

La copia CUDA è stata riqualificata sui sorgenti correnti, senza recuperare il
vecchio salvataggio incompatibile. Il campione globale conserva la prova di un
giro; nessuno di questi test dimostra ancora due giri o un miglioramento della
generazione. La ricerca resta aperta.

## Copia DEV con penalità anti-freno-bloccato — verifica del 2026-10-20

Per verificare se lo stato neurale terminale realmente penalizzato potesse
orientare mutazioni longitudinali, è stato eseguito un test isolato di tre
generazioni: V3/Monza, 16 auto, mutazione 16%, velocità richiesta 30×, quattro
worker e seed deterministico. Il replay del genitore ha riprodotto la traccia
attesa e il punteggio ricalcolato (`actionTraceMatches=true`,
`scoreMatches=true`).

Esito: 48/48 episodi hanno terminato un giro; **0/48 hanno terminato due giri**.
Nelle generazioni 2 e 3 sono state valutate quattro varianti mirate per
generazione. Tutte le 8 hanno terminato con `urto`, senza superare un giro.
La fitness media delle varianti mirate è stata 2.181,06 e 2.195,27; il
campione protetto è rimasto a 4.054,29. Il miglior punteggio della prima
generazione (4.054,29 contro 3.187,91 del replay ricalcolato) è un singolo
segnale di fitness, non un miglioramento verificato di completamento o
convergenza.

La prova quindi **non convalida** la mutazione guidata dal contesto come
miglioramento dell’apprendimento. Rimane confinata alla copia DEV: non sostituisce
il campione verificato, non viene promossa come modello migliore e non cambia
la release o i salvataggi preesistenti. Rapporto completo per agente:
`.impeccable/review/learning-ml/statehead-reward-directed-3gen-20261020-01/report.json`.

## Obiettivo ancora aperto

Servono due giri nello stesso episodio e prove adeguate sugli altri modelli,
circuiti e avvii da zero. Nessun esito qui conclude quell'obiettivo. La prossima
scelta deve usare gli audit: apprendere anche il feedback dei comandi neurali
già presenti o una politica più stabile/espressiva, senza introdurre un pilota
nascosto. Aumentare nuovamente solo il numero nominale dei coefficienti o
indebolire le penalità non è una soluzione dimostrata.

Una continuazione separata del campione CUDA ha poi eseguito tre generazioni
complete (16 agenti, 48 episodi, tre aggiornamenti). Il miglior progresso per
generazione è stato 6.584,839 m, 6.595,292 m e 6.591,107 m; il massimo
intermedio appartiene a una variante esplorativa e non ha aumentato fitness né
giri. Il campione globale pulito è rimasto a 6.584,839 m / 1 giro e nessuna
variante ha fatto due giri. Rapporto:
`.impeccable/review/neural-sacl/chain-cuda-current-three-generation/report.json`.

## Diagnosi del secondo giro — 2026-10-20

Un replay deterministico ha acquisito telemetria nello stesso tratto (650–900 m
dopo la linea) durante il primo e il secondo passaggio. L'hash della traccia dei
comandi coincide con quello del campione V3 protetto (`5de73c56…`), quindi la
diagnosi riguarda lo stesso modello, non una ricostruzione approssimata. Alla
seconda tornata i comandi alternano gas e freno senza sovrapporli; a vettura
ferma il decoder comanda gas 0 e freno 0,67. La frenata funziona: il problema è
il comando neurale che porta l'auto a fermarsi e non la ripresa.

Un confronto lockstep fra il decoder completo e lo stesso V3 con correzione
neurale azzerata ha riprodotto entrambi gli hash registrati. I due controllori
rimangono identici fino alla prima tornata; nel campione completo il gate del
correttore resta a zero all'inizio della seconda e si attiva solo nel tratto
finale. Esiti: decoder completo 6.590,792 m / 1 giro / 849,48 s; genitore
senza correzione 6.584,839 m / 1 giro / 849,48 s. Nessuno dei due completa il
secondo giro e nessuna traccia presenta sovrapposizione gas/freno. Il guadagno
misurato è soltanto 5,953 m: non costituisce un miglioramento utile dimostrato.

La variante già preparata con gate post-traguardo e guadagno 0,2 è stata
respinta: termina a 6.019,971 m, un giro, dopo 777,33 s. Ridurre il guadagno
non risolve il controller ereditato. Tre generazioni aggiuntive di 16 agenti
(48 episodi) avevano già prodotto 0/48 completamenti di due giri; le otto
varianti dirette sul freno sono terminate con urto.

Conseguenza: il campione chiamato `clean-verified` certifica un episodio
riproducibile e non incidentato rispetto al genitore, non il completamento
dell'obiettivo di due giri. Non va presentato come modello che completa la
generazione. Le nuove evidenze sono conservate in
`.impeccable/review/learning-ml/statehead-lap-revisit-telemetry-20261020-01/`,
`statehead-zero-vs-learned-20261020-01/` e
`statehead-postlap-gain-rollout-20261020-01/`.

Esito operativo: nessuna correzione sperimentale promossa. Il prossimo lavoro
deve intervenire e validare il controller V3 ereditato con prove di guida
completa, anziché aggiungere altri coefficienti al gate. Versione app,
salvataggi, portable, installer, tag e release restano invariati.

Un A/B isolato del V3 senza correttore ha provato a moltiplicare solo lo
sterzo per 0,70, lasciando invariati cervello e pedali. Il ramo attenuato urta a
751,367 m e 58,8 s; il riferimento riproduce l'hash atteso e termina a
6.584,839 m / 1 giro. La riduzione non è una correzione valida. Il primo
tentativo di questo A/B è stato invalidato e marcato esplicitamente nel suo
report perché il wrapper del motore condiviso era stato applicato a entrambi i
rami. Prova valida: `statehead-steering-gain-070-20261020-02/`; tentativo
scartato: `statehead-steering-gain-070-20261020-01/`.

La copia DEV di allenamento ha inoltre superato 11 controlli di avvio: V3 / Monza,
16 auto, generazione 1 in pausa, 4 worker CUDA, profilo e formato di salvataggio
separati. La UI dichiara che il campione iniziale ha completato 1/2 giri; il
smoke non dimostra apprendimento o due giri. Verifica:
`statehead-brake-lock-app-smoke-20261020-05/verification.json`.

## Copia Windows DEV state-head — 2026-10-19

Per rispettare la distinzione fra il modello compatibile con il vecchio motore
e il migliore assoluto di ricerca, è stata preparata una copia Windows
separata basata sul campione state-head pulito
`5de73c56eba77a13396b6998e4354addd1ceda8f08a74429ce0b722d4a62ff35`.
Il suo nuovo runtime CUDA ha riprodotto in lockstep due controller completi:
16.912 confronti a ogni controllo, 16.910 chiamate GPU sulla RTX 4060 e zero
fallback CPU. Il smoke dell’app verifica V3/Monza, 16 auto, 18 coefficienti,
stato iniziale in pausa e profilo locale separato:
`neuronal-statehead-cuda-lockstep-20261019-01/report.json` e
`statehead-cuda-app-smoke-20261019-03/verification.json`.

La copia usa archivio e salvataggi privati `.malecns-statehead-cuda-dev`,
incompatibili intenzionalmente con i file chain e con `.malecns-save`.
Il vecchio programma e il suo profilo non sono stati chiusi o migrati; la
versione resta 5.6.0. Il campione visibile completa ancora soltanto un giro
lento; la nuova integrazione non è una prova di apprendimento più rapido né
di due giri.
