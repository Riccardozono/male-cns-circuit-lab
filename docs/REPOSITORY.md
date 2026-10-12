# Sorgente, file generati e pulizia del repository

Pulizia del 12 ottobre 2026. App **5.5.0**, nessun incremento di versione,
nuovo tag o sostituzione delle release distribuite.

## Cosa rimane

- Codice dell'app in `outputs/` e runtime Electron in `desktop/`.
- Tutti i test e le fixture necessarie, gli script npm e il lockfile.
- Dati del connectome, circuiti, quote NASA, manifest e checksum.
- Modelli 3D, texture, licenze e provenienza. Anche il modello Porsche sorgente
  e la livrea originale rimangono: sono usati per rigenerare il GLB adattato,
  pur non essendo caricati dall'app durante la guida.
- Strumenti di preprocessing, benchmark, verifiche e riferimenti cartografici.
- Il submodule `work/malecns`, la documentazione e le anteprime pubbliche.
- Le copie sorgenti richieste dai controlli storici: per esempio
  `work/learning-lab-v510.cjs --baseline` usa `work/baseline-v510/`, e la verifica
  della correzione texture confronta `work/pre-texture-fix-v510/`.

Non essere caricato dal renderer non basta per considerare un file inutile:
test, fonti, crediti e strumenti riproducibili fanno parte del progetto.

## Cosa viene escluso dall'albero Git corrente

**312 file generati**, per **88.414.537 byte** complessivi, vengono rimossi
soltanto dall'indice Git. Comprendono **174 file `.malecns-save`** di prova e
138 risultati diagnostici, report JSON/TAP, catture o note interne generate.
Nessun candidato è incluso nell'elenco di distribuzione di `package.json`.

Le categorie sono definite da `.gitignore` e da
[`work/audit-repository.cjs`](../work/audit-repository.cjs): cartelle dei
progressi, verifiche grezze, diagnosi, benchmark generati, precedenti rapporti
di pulizia, JSON di verifica e output TAP. La documentazione riassuntiva in
Markdown rimane; non viene confusa con i risultati grezzi prodotti dai test.

La rimozione usa `git rm --cached`: **gli originali restano sul PC**, con
confronto SHA-256 prima/dopo. Non vengono cancellati salvataggi, profili reali,
vecchie build o cartelle di distribuzione. Le nuove regole impediscono di
aggiungere accidentalmente queste categorie in un successivo commit.

Il valore in byte riguarda i file dell'albero corrente: non è spazio liberato
dal PC né una riduzione equivalente dell'intera cronologia Git. I commit
passati non vengono riscritti e possono ancora contenere i vecchi diagnostici.

## Guide storiche e ripetizione dei test

I percorsi diagnostici citati nelle guide delle versioni precedenti sono
evidenze dell'intervento alla loro data, non file necessari per avviare l'app
attuale. Nel clone corrente quei risultati grezzi non sono inclusi. Gli script
di prova possono ricrearli; le misure nuove non sostituiscono quelle storiche.
Le verifiche di vecchi pacchetti richiedono anche i relativi pacchetti e i loro
record locali, non sono test automatici della versione corrente.

I test correnti si eseguono con:

```powershell
npm ci
npm test
node work/audit-repository.cjs
```

L'audit controlla che le sorgenti previste dalla build esistano e che file
generati o privati non siano versionati. Non pretende di rilevare ogni ramo
di codice inutilizzato. `--plan` e `--verify` sono controlli locali di
conservazione; non cancellano file. I loro record restano nel percorso privato
di revisione, escluso da Git e dai pacchetti.

La build Windows usa un elenco esplicito di file, già privo di questi 312
residui. Per compilarla senza sostituire pacchetti esistenti:

```powershell
npx electron-builder --win portable nsis --publish never --config.directories.output=dist-local-preview-5.5.0
```

## Verifiche della pulizia

- Esportazione separata dell'indice Git: **307 file ordinari**, nessun
  `.malecns-save`; il submodule è un riferimento Git, non un file ordinario.
- `npm test` su questa copia, senza i diagnostici esclusi: **359/359**,
  zero fallimenti, annullamenti o test saltati.
- Conservazione locale SHA-256: **312/312** file esclusi ancora presenti e
  identici, **303/303** file sorgenti/dati/documenti precedenti conservati.
  README e regole di esclusione sono le modifiche documentali intenzionali.
- Audit dell'indice corrente: **308 elementi**, zero file delle categorie
  generate o private controllate, sorgenti della build disponibili.
- Controlli di conservazione del runtime e delle distribuzioni precedenti:
  **33/33**. Confronto dei file dell'anteprima Windows con i sorgenti e dati
  attuali inclusi: **46/46**. Non è stata ripetuta l'installazione dei pacchetti.

Queste verifiche riguardano integrità e dipendenze del sorgente: non sono un
nuovo benchmark di prestazioni o di convergenza dell'apprendimento.

Per le modifiche di paesaggio effettive e i test nativi consultare
[BOSCHI-PAESAGGIO.md](../outputs/BOSCHI-PAESAGGIO.md) e
[VERIFICA-BOSCHI.md](../outputs/VERIFICA-BOSCHI.md). L'app e i salvataggi
mantengono la versione 5.5.0; fisica e apprendimento non sono modificati da
questa pulizia. I nuovi eseguibili di prova restano locali fino alla richiesta
esplicita dell'autore di una nuova versione.
