# Contesti neurali locali: piccolo miglioramento verificato

Stato verificato il 16 ottobre 2026. Il problema dei due giri resta aperto.
Tutte le prove di questo rapporto sono private, V3 su Monza, con il grafo
anatomico di 7.721 neuroni/242.486 connessioni e dinamica artificiale.

## Risultato selezionato

| Riferimento | Metri massimi | Punti fisici R5 | Giri | Fine |
| --- | ---: | ---: | ---: | --- |
| Precedente modello di ricerca | 6.590,791630 | 4.057,077503 | 1 | troppo lenta |
| Nuovi contesti neurali istantanei | 6.597,375423 | 4.060,441745 | 1 | ferma |

Il guadagno è **6,583793 m**, non un secondo giro e non un miglioramento
dimostrato del tempo sul giro. Il primo giro resta 742,5501609581744 secondi
simulati e appartiene alla parte già allenata e protetta. Anche il nuovo
modello si ferma: non viene descritto come soluzione completa.

Lo studio `neuronal-instant-context256-first` ha eseguito 256 candidati
fisici di pratica in 16 aggiornamenti CMA, con 35.841 controlli del tratto
attivo. L'ottimizzatore vede soltanto coefficienti e punteggi R5 effettivi.
I tre contesti si ricavano dall'attività neurale realmente osservata; non
ricevono coordinate, percorso, tempo o azioni ideali. Le sei nuove quantità
allenate sono coefficienti del readout, non nuovi neuroni biologici.

La verifica separata riproduce tutti i vettori chiesti, proiettati e valutati,
i punteggi e gli stati dell'ottimizzatore. Due partenze complete nel Bridge,
due processi nativi separati e una terza prova del file finale riproducono
lo stesso risultato e la stessa traccia:
`7ac5a4f00fad5d0c16ec71493b1bf45514e40ccaf3e4723070b9934060f3818c`.

File numerico di ricerca:
`.impeccable/review/neural-sacl/neuronal-instant-context256-first/clean.malecns-instant-context.json`.
SHA-256:
`0d23973f4f7ef4d590238b38062203db5b1eb773923315d70d02a2f285eef908`.
Contiene genitore numerico, contesti e coefficienti, non pose fisiche o una
registrazione di azioni. Richiede il nuovo decoder privato e la sua identità
di sorgenti/runtime/kernel/driver: **non è un salvataggio standard caricabile
nella copia Windows attuale**. Non viene aggirata la compatibilità.

`verified-research-frontier-v2.json` registra questo risultato senza toccare
il catalogo precedente o il modello attivo in Windows. La copia Windows
precedentemente verificata rimane in pausa/16 auto al suo avvio e usa ancora
il proprio modello compatibile. Una nuova integrazione deve essere verificata
separatamente, non dedotta dalle prove del decoder da riga di comando.

## Controlli che escludono due possibili cause

- Su copie di cinque stati realmente raggiunti, il freno pieno rallenta più
  del rilascio dell'acceleratore in tutte le prove da 15 passi fisici. Per
  esempio, da 11,4694 m/s scende a 8,7043 m/s, contro 11,1680 in rilascio.
  Le copie non modificano la traiettoria originale, che resta identica.
  Sono diagnostiche dell'attuatore, mai target o esempi usati dal learner.
- Il gate della precedente correzione raggiunge realmente 1. Nelle 768
  osservazioni attive di quella traiettoria non impedisce al modello di
  invertire il segno longitudinale. Non è quindi dimostrato un blocco di
  autorità in tali stati. Non si cambia il limite per correggere una causa
  che la prova non conferma.

Evidenze: `actual-native-braking-diagnostic-first/verification.json` e
`actual-neural-motor-authority-first/verification.json` nella cartella review.

## Confronti e varianti non promosse

La ricerca coerente su 130 coefficienti ha realmente valutato 256 candidati
e 95.972 controlli del tratto attivo. Nessun candidato pulito migliora il
riferimento: rapporto e riconciliazione sono conservati in
`neuronal-coherent-readout130-first`.

I contesti istantanei sono stati ricavati da 8.495 osservazioni prima dei
controlli. Una ripartenza nativa indipendente riproduce tutte le **4.383.420
quantità neurali** e riconcilia statistiche, centri e raggi. Un'ulteriore
partenza verifica che la nuova correzione zero lasci identico il genitore.
Nessuna colonna di azioni ideali o geometria entra nel fit.

La variante con memoria neurale a decadimento .98 è distinta e non sostituisce
il modello. Dopo 12 generazioni completate, una scrittura di `state.json`
è fallita su Windows con `PermissionError / WinError 5`. La generazione 13
parzialmente eseguita non aveva un batch di fitness registrato: non è stata
considerata completata né usata per aggiornare l'ottimizzatore.

## Errore Windows corretto e ripresa verificata

Il nuovo `neuronal_experiment_io_retry.py` usa un pending univoco e tentativi
limitati per i blocchi transitori della sostituzione atomica su Windows.
Non modifica il modulo IO precedente, già legato alle impronte di altre prove.

Due test con veri handle Windows verificano che un lettore senza condivisione
della cancellazione possa essere superato dopo il rilascio e che un blocco
persistente produca un errore senza danneggiare il file precedente. Questo
riproduce una possibile condizione di blocco: non dimostra quale programma
abbia causato il singolo errore osservato durante il confronto.

Sono stati riconciliati i 12 aggiornamenti e le **192 valutazioni registrate**.
Il checkpoint numerico ripristinato genera esattamente gli stessi coefficienti
che erano stati chiesti per la generazione interrotta. In una cartella nuova
sono poi state eseguite nuovamente le generazioni 13–16: **64 valutazioni**,
non 256 nuove. Quattro aggiornamenti nuovi e 16 cumulativi sono verificati.
Il file originale dello studio fallito resta conservato.

Il miglior risultato della variante con memoria è 6.594,432777 m e
4.057,825839 punti: supera il proprio vecchio genitore ma **non** il risultato
globale verificato da 6.597,375423 m/4.060,441745 punti. Non viene promosso.

Nessuna release, versione, tag o commit è stato creato; nessun salvataggio
dell'autore è stato convertito o sovrascritto. Il lavoro successivo deve
mantenere come riferimento globale il nuovo modello verificato e deve ancora
dimostrare apprendimento dei due giri e integrazione Windows.
