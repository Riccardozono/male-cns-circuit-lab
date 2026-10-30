# Copia Windows privata — proiezioni neurali, app 5.6.0

Avvio: `Avvia-proiezioni-neurali-dev.cmd` nella cartella principale. La finestra
si chiama **Circuit Lab 5.6.0 · proiezioni18 DEV · V3 / Monza** e usa un profilo
separato, `.impeccable/development-projected-training-profile`.

Parte **in pausa, al traguardo, con 16 auto** dal miglior modello proiettato
verificato. Puoi aumentare la popolazione fino a 100. Usa quattro processi CPU
Node 24.19.0 per neuroni e fisica. Questa copia non dichiara apprendimento CUDA:
gli esperimenti SAC sulla GPU restano separati finché non sono verificati.

Non è una nuova release: versione 5.6.0, installer e portable pubblicati restano
invariati. Non chiude o modifica automaticamente la precedente copia
«decoder esteso DEV». La UI, i temi, la mappa, le telecamere e l'atlante sono gli
stessi file della copia precedente; non è stato rifatto il design.

## Che cosa apprende

Il modello biologico V3 mantiene 7.721 nodi e 242.486 collegamenti anatomici.
L'attività e la dinamica impiegate dall'app sono artificiali, non una simulazione
fisiologica completa della mosca. I modelli precedenti restano congelati.

L'ultimo decoder apprende **18 coefficienti**, due uscite su otto proiezioni
matematiche dell'attività neurale più una costante. Le proiezioni non sono otto
neuroni biologici nuovi. Gli ingressi comprendono storia neurale e memoria del
controller, non posizione, waypoint, cronometro, traiettorie o azioni di un
pilota-esempio. Le correzioni sono attivate da contesti neurali realmente
osservati e conservati in una memoria causale.

Le ricompense reali selezionano le mutazioni. La popolazione conserva un campione
protetto, prova anche perturbazioni opposte e può mutare il canale longitudinale,
lo sterzo o entrambi. Nel canale non coinvolto i coefficienti restano invariati.
Non sono comandi di guida scritti a mano. Un'auto ferma, lenta, fuori pista o
incidentata riceve le penalità del motore privato R5.

Ogni generazione aspetta la conclusione fisica dell'intera popolazione; gli agenti
si fermano anche al raggiungimento dei due giri. **Una generazione conclusa non
significa che siano stati percorsi due giri**: può terminare con tutte le auto
eliminate. Cambiare popolazione o azzerare esclude gli episodi incompleti
dall'apprendimento. Il controllo della velocità arriva a 30× richiesti; il
fattore realmente raggiunto dipende dal carico e viene misurato separatamente.

## Salvataggi e compatibilità

«Salva apprendimento…» crea un file condivisibile con modello numerico, pesi,
archivio, RNG e storico. Al caricamento le auto ripartono fisicamente dal
traguardo: non si importano posizioni, un nastro di comandi o episodi incompleti.

L'estensione rimane `.malecns-grown-dev` per riutilizzare il selettore esistente,
ma l'intestazione è **male-cns-private-projected-learning-save**, protocollo
**projected-from-line-v1**, con fingerprint completo del motore. È diversa dai
salvataggi della copia «decoder esteso DEV», da native-v1 e da `.malecns-save`.
**Stessa estensione non significa stesso formato**: i file precedenti devono
essere usati nella rispettiva copia. Non rinominarli per aggirare i controlli.

## Risultati effettivamente verificati — 15 ottobre 2026

Il campione iniziale, SHA256
`3ea1e1683c29e0dbcd4673f130f7c05f0675b53519a4c6601708dd974ac31df1`,
raggiunge **3.803,070 m, punteggio −604,210 e zero giri**, con conclusione fisica
per lentezza/mancanza di progresso dopo 504,767 secondi simulati. Due replay
nativi hanno riprodotto l'intera sequenza di comandi. Il suo miglioramento
precedente è documentato in `APPRENDIMENTO-PROGRESSIVO-DEV.md`.

Sono passati 23 controlli Windows funzionali, sette test di formato/proiezioni/
salvataggio e due test dell'arena: fino a 100 stati fisici e neurali indipendenti,
pedali esclusivi, parità fra esecuzione singola e arena, pausa, generazione,
mutazione, annullamento, caricamento, reset e UI a 980/740 px senza overflow.
I test Windows sostituiscono soltanto il risultato del picker nativo per provare
i veri handler: **non verificano visivamente l'interazione con il picker**.

Una prova distinta ha eseguito **due generazioni reali da 16 auto**, 32 episodi
completi e due aggiornamenti. Ha impiegato 442,604 secondi reali. Il campione
pulito non è migliorato; i maggiori avanzamenti grezzi di alcune auto non sono
stati promossi perché la selezione considera anche sicurezza e penalità. Zero
giri. L'audit successivo ha confermato pesi del campione invariati e replay
identico: non è stata osservata una falsa promozione per arrotondamento.

Queste prove dimostrano che il sistema esegue davvero inferenza, fisica e
aggiornamenti, **non che l'apprendimento converga**. Completare uno e due giri,
provare altri seed, partenze da zero, modelli e piste rimane lavoro aperto.

## Evidenze locali

Sotto `.impeccable/review/neural-sacl/`:

- `projected-block-3680/report.json`: ricerca che ha prodotto il campione,
  confronto precedente e due replay nativi del modello esportato.
- `projected-training-ui/verification.json`: 23 controlli Windows e hash dei
  sorgenti effettivamente verificati.
- `projected-training-ui/roundtrip.malecns-grown-dev`: salvataggio del test.
- `projected-live-generations/report.json`: due generazioni reali, popolazione,
  punteggi, avanzamenti, pesi, RNG e storico.
- `projected-elite-rounding/report.json`: replay reale del campione conservato.
- `projected-training-ui/integrity.json`: riconciliazione degli hash e delle
  evidenze, non una nuova prova fisica.

Gli esperimenti CUDA successivi, se avviati, hanno rapporti distinti: non vengono
inseriti automaticamente nella finestra aperta o nei salvataggi di questo motore.

È concluso un primo confronto SAC: 20.000 transizioni, 4.750 aggiornamenti sulla
RTX4060 e 165 episodi di pratica. Nessun candidato ha superato il campione, che
rimane quindi quello iniziale. Esiti negativi, limiti e verifiche sono in
[APPRENDIMENTO-SAC-PROIEZIONI-DEV.md](APPRENDIMENTO-SAC-PROIEZIONI-DEV.md).
