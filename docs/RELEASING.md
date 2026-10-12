# Pubblicazione delle versioni

Dall'11 ottobre 2026, ogni nuova versione di MAL-E CNS Circuit Lab deve essere
pubblicata su GitHub con il modello IA usato nello sviluppo indicato sia nei
commit sia nelle note della release. È una regola di lavoro del progetto, non
un processo di pubblicazione automatica già eseguito da GitHub Actions.

## Quando creare una nuova versione

Dal 12 ottobre 2026 è l'autore a decidere quando fare una nuova versione:
**solo una sua richiesta esplicita avvia incremento della versione, nuovi tag
e pubblicazione di una release**. Una richiesta di miglioramento, correzione
o continuazione del lavoro non autorizza automaticamente questi passaggi.

Nel frattempo le modifiche restano in sviluppo, con verifiche e commit
attribuiti. Si possono eseguire test e compilazioni locali isolate, senza
sostituire gli eseguibili distribuiti o pubblicare nuovi pacchetti. Non
aggirare i controlli di compatibilità dei salvataggi: eventuali incompatibilità
devono essere segnalate all'autore prima della distribuzione.

La checklist qui sotto si applica quando l'autore richiede la nuova versione.
L'attribuzione IA dei commit rimane valida anche senza una nuova release.

## Attribuzione del modello

Usare il nome esatto verificato nei metadati della sessione di sviluppo oppure
confermato dall'autore. Non ricavarlo dal modello predefinito, da un elenco di
modelli disponibili o dal profilo V2, V3, V4 o V5 della simulazione.

Per ogni commit creato da un agente:

```text
<descrizione della modifica> [AI: <modello verificato>]

AI-Models: <modello verificato>
AI-Provenance: session-metadata oppure author-reported
```

Il commit che chiude una versione usa questa struttura:

```text
release: v<versione> - <descrizione breve> [AI: <elenco modelli>]

AI-Models: <elenco modelli separati da virgole>
AI-Provenance: <tipi di evidenza disponibili>
```

Se intervengono più modelli, registrarli nei rispettivi commit e riepilogarli
tutti nel commit finale e nella release. Non attribuire a un singolo modello
modifiche di altri agenti. Non assegnare modelli ai vecchi commit senza prove.
Se l'attribuzione non può essere verificata, chiedere conferma all'autore.
I log privati di Codex non devono essere caricati nel repository o nella release.

## Checklist di una nuova versione dell'app

1. Aggiornare in modo coerente versione del pacchetto, lockfile, versione mostrata
   nell'app e identificativi di compatibilità dei salvataggi interessati.
   Aggiornare anche README, badge e collegamenti ai download. Mantenere il vincolo
   di compatibilità esatta dei file `.malecns-save` e preservare le vecchie release.
2. Verificare l'elenco dei modelli che hanno contribuito alla versione e le fonti
   delle attribuzioni; non limitarsi al modello dell'ultima sessione.
3. Eseguire `npm test` e i controlli pertinenti alla modifica. Per prestazioni e
   apprendimento riportare soltanto misure realmente ottenute e le condizioni
   della prova, distinguendo CPU e WebGPU.
4. Creare il commit finale attribuito e costruire dal sorgente di quel commit con
   `npm run dist`. Il comando attuale genera portable e installer Windows x64;
   la directory di uscita è quella configurata in `package.json`.
5. Verificare i pacchetti usando un profilo di prova separato dai progressi
   dell'utente. Registrare quali controlli sono stati eseguiti e quali no.
6. Calcolare i checksum SHA-256 dei due eseguibili. Non caricare i binari nella
   cronologia Git e non riutilizzare un eseguibile di una versione precedente.
7. Pubblicare il commit e creare il tag `v<versione>` che lo identifica. Preparare
   una GitHub Release in bozza, compilare le note e allegare entrambi i pacchetti
   e il file dei checksum. Pubblicarla soltanto quando la checklist è completa.
8. Verificare da GitHub la corrispondenza fra versione, tag, commit sorgente,
   modelli dichiarati e asset scaricabili. Comunicare il link della release.

Una modifica solo documentale non richiede incremento della versione dell'app,
ricompilazione dei pacchetti o una nuova release; il commit rimane attribuito.
Non modificare release esistenti senza una richiesta specifica.

## Modello delle note di release

Sostituire tutti i segnaposto con dati verificati prima di pubblicare:

```markdown
# MAL-E CNS Circuit Lab <versione>

<Descrizione sintetica delle novità>

## Novità

- <Modifiche incluse in questa versione>

## Modelli IA usati

- Modelli di sviluppo: <nomi esatti, senza duplicati>
- Attribuzione: <metadati della sessione / dichiarazione dell'autore>
- Commit sorgente: <link al commit identificato dal tag>

Questi modelli hanno assistito lo sviluppo del codice; non guidano le auto
durante la simulazione e non sono i profili neurali V2–V5.

## Download Windows x64

- Portable: MAL-E-CNS-Circuit-Lab-portable-<versione>-x64.exe
- Installer: MAL-E-CNS-Circuit-Lab-setup-<versione>-x64.exe
- Checksum SHA-256: SHA256SUMS.txt

## Verifiche

- <Test realmente eseguiti, risultati e ambiente>
- <Controlli non eseguiti o non confermabili>

## Salvataggi e limiti noti

- I file .malecns-save richiedono la stessa versione dell'app.
- <Limiti noti e stato effettivo della firma degli eseguibili>
```
