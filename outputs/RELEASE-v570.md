# MAL-E CNS Circuit Lab 5.7.0 — candidata locale

## Novità

- La pratica locale usa lo stesso guadagno sensoriale e lo stesso bias motore
  della simulazione sulle piste strette. Prima, i replay di pratica usavano i
  valori standard (`0,35` e `0,18`), mentre Monza, Monaco e Le Mans usavano
  quelli specifici della pista (`0,8` e `0,02`).
- Se il miglior agente sicuro si ferma senza gas, la selezione evolutiva varia
  il solo comando longitudinale gas/freno e conserva la sterzata appresa.

## Risultato sperimentale e limiti

Confronto V3 su Monza, seed 7717, popolazione 40, checkpoint gen. 80 e quattro
generazioni per ramo. Fra le generazioni 81–83, la progressione media degli
agenti sicuri è passata da **138,71 m** nel controllo a **277,86 m** con
mutazione longitudinale. Gli agenti sicuri oltre 500 m per generazione sono
passati in media da **4,33** a **8,67**. Il confronto cambia una sola parte del
sorgente di simulazione e il primo esito fisico coincide con il riferimento.

Il miglior avanzamento sicuro è rimasto **790,461 m** in entrambi i rami e
nessuno ha completato un giro. È un risultato di quattro generazioni su un
solo seed: documenta più esplorazione sicura, non convergenza né
generalizzazione a V2, V4, V5 o agli altri circuiti.

La telemetria di un agente fermo registra gas `0`, freno `0,1084` e velocità
`0 m/s`; durante l'avvicinamento rallenta da `16,433 m/s` a zero. In questo
replay il freno fisico agisce; resta da imparare quando riapplicare il gas.

## Modelli IA usati

I nomi e le evidenze di attribuzione per questa candidata vanno confermati
dall'autore prima del commit finale e della pubblicazione. Non dedurre il
modello dai profili di simulazione V2–V5.

## Download Windows x64

- Portable: `MAL-E-CNS-Circuit-Lab-portable-5.7.0-x64.exe`
- Installer: `MAL-E-CNS-Circuit-Lab-setup-5.7.0-x64.exe`
- Portable SHA-256: `EC4D8C1E065734CBA26F39D5908653089E17DC9E11CFF0B19DA70B3D7B4D7FAF`
- Installer SHA-256: `2FDE24470D1BDC407EDA71159404B0FACB858137CDC04BFDD5F70D3938F20499`
- Entrambi i file risultano `NotSigned` secondo Authenticode.

## Salvataggi

I salvataggi 5.7.0 richiedono esattamente la versione 5.7.0. I file 5.6.0 e
precedenti restano utilizzabili con le rispettive app conservate; non vengono
migrati automaticamente.

## Stato della candidata

Build Windows x64 completata in `dist-learning-v570/`; suite completa 446/446
e smoke test superati su portable e installer: V3/Monza, 16 auto, app in pausa.
L'installer è stato installato e disinstallato da una directory temporanea.
Commit sorgente, tag e pubblicazione GitHub restano in attesa della conferma
dell'attribuzione IA; i link diretti nel README diventeranno attivi solo dopo
la creazione della release.
