# PPO: discrepanza misurata tra pratica e partenza dal traguardo

Il modello del precedente esperimento `neuronal-ppo-normalized520-first`,
allenato per 64 aggiornamenti, ha risultati diversi usando gli stessi pesi:

| Esecuzione | Metri massimi | Punti | Fine |
| --- | ---: | ---: | --- |
| Pratica da stato realmente raggiunto | 6.178,364094460837 | 3.716,279676050228 | ferma / senza progresso |
| Nativa completa dal traguardo | 6.361,429310853718 | 1.989,729866538497 | urto |

Entrambe riportano un giro ereditato dalla parte protetta del controllore;
nessuna completa i due giri. La distanza maggiore della seconda non implica
guida migliore: ha meno punti e termina in un urto.

Evidenze locali in `.impeccable/review/neural-sacl/`:

- `ppo-normalized64-native-transfer-first/verification.json`: esecuzione
  completa nativa degli effettivi pesi allenati, senza Bridge di pratica.
- `ppo-normalized64-bridge-transfer-first/verification.json`: la partenza
  completa nel Bridge CUDA coincide esattamente con quella nativa; la pratica
  coincide con il precedente risultato CPU. La differenza è quindi presente
  anche confrontando le due modalità dello stesso ambiente, non soltanto due
  adattatori differenti.
- `neuronal-ppo-normalized520-cuda-long/prefix64-equivalence.json`: i primi
  64 aggiornamenti CPU/CUDA ripetono esattamente 16.384 transizioni effettive
  e le metriche di aggiornamento. Sono ripetizioni, non esperienza nuova.

## Differenza del protocollo di memoria

La policy legge anche la propria precedente proposta residua. Nel protocollo
precedente la memorizzava persino quando il gate neurale era zero e la proposta
non modificava i comandi. La pratica riprendeva invece una memoria precedente
zero, registrata durante il percorso protetto con policy zero. La partenza
completa poteva quindi arrivare alla prima attivazione con una memoria diversa.

La copia distinta `neural-ppo-applied-memory-cuda-env.cjs` e il corrispondente
adattatore nativo azzerano quella memoria quando l'autorità neurale è zero.
Quando è positiva conservano esattamente la precedente rappresentazione
latente limitata. Non aggiungono percorso, coordinate, tempo, azioni ideali o
un pilota esterno; non cambiano fisica, connettoma o premi R5.

Il controllo unitario di `neural-applied-policy-memory.test.cjs` verifica il
contratto numerico. La prova fisica completa è separata:
`ppo-normalized64-applied-memory-transfer-first/verification.json` vale come
esito soltanto se presente con `passed: true`. Non dedurre successo dai soli
test unitari o dall'avvio del processo.

La prova fisica è ora conclusa e **superata**: la partenza nativa corretta,
la partenza completa del Bridge corretto e la pratica coincidono esattamente
con la precedente traccia di pratica del modello allenato. Tutte arrivano
a 6.178,364094460837 m e terminano ferme, con lo stesso punteggio e lo stesso
hash dei comandi/progressi/tempi. Nessun ripiego CPU. La correzione elimina
la discrepanza osservata; non trasforma questa policy debole in un campione.

La modifica è incompatibile con il precedente protocollo privato: nuovi nomi,
sorgenti e identità restano separati. Non viene aggirata la compatibilità dei
salvataggi Windows e nessuna policy peggiore viene installata nell'app.

Questo problema di trasferimento non dimostra da solo la causa di tutto il
mancato apprendimento. Un confronto reso coerente non è automaticamente un
modello più veloce, più sicuro o capace di completare due giri.
