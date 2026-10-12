# Verifica della release 5.6.0

12 ottobre 2026. Risultati eseguiti sul sorgente **5.6.0** prima del commit
della release; i controlli successivi dei pacchetti sono registrati nelle
[note pubblicate](https://github.com/Riccardozono/male-cns-circuit-lab/releases/tag/v5.6.0).

## Risultati sul sorgente

- Suite completa: **361/361**, zero fallimenti, annullamenti o test saltati.
  Comprende due nuovi controlli di coerenza della versione e rifiuto di un
  salvataggio 5.5.0 altrimenti valido, senza alterare il decoder dei progressi.
- Conservazione di IA, fisica, dati, asset originali, shell e vecchi binari:
  **33/33**. Il cambio a 5.6.0 è esplicitamente autorizzato dall'autore;
  i file del nucleo sono confrontati con il sorgente pubblicato 5.5.0.
- UI nativa Windows, backend GPU: **104/104**, zero errori in console,
  15 immagini. Quattro piste, 100 agenti, panoramica, inseguimento, Bosco,
  Paesaggio, quartieri, atlante affiancato, finestre 1540/1280/390.
- WebGL 2 per la scena, WebGPU neurale attivo su adattatore `nvidia lovelace`,
  un worker. Hardware verificato localmente: Ryzen 5 5600G e RTX 4060;
  è identificazione dell'hardware, non un benchmark di throughput.
- Salvataggio nativo con fallback CPU forzato: **49/49**, zero errori in
  console. V2–V5, worker multipli, parametri, storico, pausa/ripresa, 100
  agenti, checksum e rifiuto della versione precedente verificati.
- Un file 5.5.0 viene rifiutato con messaggio esplicito senza modificare la
  prova corrente. Le storiche release e i progressi dell'autore sono separati.
- Tutte le 15 catture sono state ispezionate; le quattro anteprime pubbliche
  sono copie native identiche per byte, con provenienza e checksum in
  [provenienza delle anteprime](https://github.com/Riccardozono/male-cns-circuit-lab/blob/v5.6.0/docs/assets/screenshots/v560/README.md).

Il test dei progressi fa avanzare alcune generazioni tramite il comando
esistente per verificare la conservazione dell'ottimizzatore: non è prova
di completamento naturale di due giri né di convergenza.

## Scena e dati

| Circuito | Fascia | Alberi totali | Nuovi alberi del bosco |
| --- | ---: | ---: | ---: |
| Monza | 1 km | 10.626 | 9.270 |
| Le Mans | 2 km | 25.075 | 24.000 |

La superficie fisica del tracciato, le collisioni e le policy non sono
sostituite dal DEM dei dintorni. Risoluzione, data NASA, registrazione stimata,
posizioni illustrative e licenze sono in [PAESAGGIO-v560.md](PAESAGGIO-v560.md)
e [PAESAGGIO-SRTM.md](PAESAGGIO-SRTM.md). Le prove indipendenti originali degli
HGT sono riportate nel [rapporto iniziale](VERIFICA-BOSCHI.md), non presentate
come una nuova acquisizione o misura della precisione del terreno.

## Pacchetti e limiti

Portable e installer vengono costruiti dal commit sorgente della release,
in una cartella distinta dalle distribuzioni precedenti. La pubblicazione
richiede confronto dei file inclusi, esecuzione del portable con profili
separati, versioni PE e checksum SHA-256; i risultati effettivi sono aggiunti
alle note prima di renderla pubblica. L'installer non viene eseguito nel
profilo personale durante la QA.

Non sono certificati FPS sostenuti, maggiore velocità di apprendimento,
giri appresi o fedeltà laser/CAD. Nessun log delle sessioni, profilo di prova
o salvataggio diagnostico viene caricato nel repository o nei pacchetti.
