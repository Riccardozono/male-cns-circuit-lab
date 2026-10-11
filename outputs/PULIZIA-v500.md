# Pulizia del progetto — app 5.0.0

Intervento richiesto dall’utente il 1 ottobre 2026. Non cambia la versione
dell’app o dei salvataggi, né codice di IA, fisica, ricompense, sensori e mappe.

La distribuzione usa un elenco esplicito di file in `package.json`: moduli
dell’app e dei comandi nativi, grafi MaleCNS, circuiti, sprite e provenienza,
guide attuali. Non include risultati di test, profili di prova, screenshot,
report storici, salvataggi o il duplicato JavaScript del nucleo V3; il nucleo
effettivamente caricato è `data/connectome.json`.

Nel progetto vengono conservati codice sorgente, test, dipendenze Electron e
strumenti effettivamente richiamati dai comandi correnti. Restano la copia della
repo originale `work/malecns`, i riferimenti cartografici, i dati e la provenienza
distribuiti. I dataset Feather/cache e le dipendenze Python del preprocessing
non sono richiesti dall’app: il loro recupero dal Cestino o nuovo download è
necessario se si vuole ripetere quel preprocessing.

Tutti i file `.malecns-save` già presenti sono protetti, verificati con SHA-256
e lasciati **nella posizione originale**, anche se erano stati prodotti da
prove vecchie o rappresentano file volutamente invalidi dei test. Non viene
cancellato o modificato il profilo personale dell’app in AppData.

Vecchie build, cache/profili diagnostici, risultati temporanei e strumenti
superati vengono inviati al **Cestino di Windows**, non cancellati definitivamente.
Il Cestino non viene svuotato. Di conseguenza la diminuzione della dimensione
della cartella del progetto non equivale ancora a spazio libero aggiuntivo sul
disco: finché gli elementi restano nel Cestino sono recuperabili.

L’ultimo portable/installer viene ricostruito in una cartella di staging e
provato prima di sostituire il precedente. Il duplicato `win-unpacked` e i
metadati di build non servono per usare il portable/installer e sono rimossi
solo dopo le prove. Per nuove modifiche al codice restano `npm start`,
`npm test`, `npm run benchmark:all` e `npm run dist`.

I vecchi documenti conservati descrivono gli interventi e le prove alla loro
data: dopo questa pulizia le vecchie cartelle di build e molti diagnostici lì
citati non fanno più parte del progetto corrente. Non interpretare quei
percorsi come nuovi risultati. L’elenco preciso dei file rimossi, i salvataggi
protetti e le verifiche del portable pulito sono nei nuovi rapporti sotto
`outputs/pulizia-v500/`.

Per il recupero dal Cestino si usa l’opzione Windows documentata da Microsoft:
[DeleteDirectory / SendToRecycleBin](https://learn.microsoft.com/en-us/dotnet/api/microsoft.visualbasic.fileio.filesystem.deletedirectory?view=net-9.0).
