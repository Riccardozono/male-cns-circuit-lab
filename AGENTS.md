# Istruzioni del progetto

## Precisione e conservazione

- Dire la verità: non inventare risultati, fonti, misure o attribuzioni ai modelli.
- Verificare le affermazioni e indicare fonti o evidenze controllabili. Se una
  verifica non è possibile, dire esplicitamente «Non posso confermarlo».
- Preservare modifiche dell'utente, salvataggi, vecchie build e release. Non
  riscrivere commit, spostare tag pubblicati o sostituire asset già distribuiti
  senza una richiesta esplicita.
- Non pubblicare credenziali, dati personali, salvataggi o log delle sessioni
  Codex. Per l'attribuzione basta il nome del modello e il tipo di evidenza.

## Commit e release con attribuzione IA

Regola richiesta dall'autore l'11 ottobre 2026, valida da questo momento in poi.

- Ogni nuova versione dell'app deve avere un commit identificabile, un tag
  `v<versione>` sul sorgente distribuito e una GitHub Release nel repository
  `Riccardozono/male-cns-circuit-lab`.
- Nei commit creati da un agente indicare il modello di sviluppo effettivamente
  usato: suffisso `[AI: <modello>]` nel titolo e trailer `AI-Models: <modello>`.
  Aggiungere `AI-Provenance: session-metadata` se verificato nei metadati della
  sessione, oppure `AI-Provenance: author-reported` se indicato dall'autore.
- Se contribuiscono più modelli, elencarli senza duplicati. Il commit finale della
  versione e le note della release devono riportare tutti i modelli documentati
  che hanno contribuito a quella versione, non soltanto l'ultimo in uso.
- Non dedurre il modello da un elenco di modelli disponibili, dalla
  configurazione predefinita o dai nomi dei profili neurali V2–V5. Questi ultimi
  appartengono alla simulazione, non all'agente che sviluppa il progetto.
- Se il modello non è verificabile, chiedere all'autore di confermarlo prima di
  attribuire il commit o pubblicare la release. Non inventare un nome.
- Non attribuire retroattivamente modelli ai vecchi commit senza evidenze.
- Ogni nuova release dell'app deve includere portable e installer Windows x64,
  checksum SHA-256, novità, verifiche realmente eseguite, limiti noti,
  compatibilità dei salvataggi, commit sorgente e sezione «Modelli IA usati».
- Eseguire test e verifica dei pacchetti prima della pubblicazione. Verificare
  poi che tag, commit, nomi degli asset e download corrispondano alla versione.
  Segnalare eventuali blocchi: non dichiarare pubblicata una release incompleta.
- Le sole modifiche a documentazione o regole di lavoro richiedono un commit
  attribuito, ma non una nuova versione dell'app né una release di binari.

Procedura e modello delle note: [docs/RELEASING.md](docs/RELEASING.md).
