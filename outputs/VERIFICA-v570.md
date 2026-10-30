# Verifica della candidata 5.7.0

Questa nota raccoglie verifiche effettuate sul sorgente e sui pacchetti della
candidata locale. Non considerare pubblicata la release: mancano attribuzione
IA confermata, commit, tag e asset GitHub.

## Sorgente e apprendimento

- Suite completa: **446/446 test superati** sul sorgente con l'allineamento
  della pratica e il focus di mutazione longitudinale.
- Replay CUDA appaiato: **4 generazioni** per ramo, V3/Monza, seed 7717,
  popolazione 40, checkpoint iniziale identico. Entrambi hanno riprodotto il
  riferimento fisico della generazione 80.
- Il ramo trattato ha usato **62.934 chiamate RTX 4060** e zero fallback CPU.
  Nel confronto gli unici hash di sorgente differenti fra controllo e
  trattamento sono quelli di `outputs/simulation.js`.
- Risultato: progressione media sicura delle generazioni 81–83 da 138,71 m a
  277,86 m; agenti sicuri oltre 500 m medi da 4,33 a 8,67. Miglior progresso
  sicuro invariato a 790,461 m; zero giri.
- Replay diagnostico CPU di una generazione: gli esiti terminali combaciano
  con quelli CUDA e il salvataggio V3 originale mantiene lo stesso SHA-256.
  Il veicolo frena realmente ma non riapplica il gas prima di fermarsi.

## Build e pacchetti Windows x64

- `npm run dist -- --publish never`: completato con codice 0; Electron
  38.8.6, electron-builder 26.15.3. Output separato: `dist-learning-v570/`.
- Portable: `MAL-E-CNS-Circuit-Lab-portable-5.7.0-x64.exe`, 133.678.273 byte,
  SHA-256 `EC4D8C1E065734CBA26F39D5908653089E17DC9E11CFF0B19DA70B3D7B4D7FAF`.
- Installer: `MAL-E-CNS-Circuit-Lab-setup-5.7.0-x64.exe`, 133.908.364 byte,
  SHA-256 `2FDE24470D1BDC407EDA71159404B0FACB858137CDC04BFDD5F70D3938F20499`.
- `SHA256SUMS.txt` nella cartella di output contiene entrambi i checksum.
- Entrambi gli eseguibili risultano `NotSigned` con `Get-AuthenticodeSignature`.
- Il test nativo `training-copy-smoke` è passato sull'app `win-unpacked`,
  sul portable e sull'app installata: 6/6 controlli, versione 5.7.0, V3,
  Monza, 16 auto, partenza in pausa e profilo temporaneo isolato. Il
  salvataggio personale gen.64 non è stato importato.
- Installer verificato end-to-end: installazione silenziosa con codice 0 in
  una directory temporanea, smoke 6/6, disinstallazione con codice 0 e
  directory rimossa.
- `npm prune --dry-run --ignore-scripts`: `up to date`; non risultano
  dipendenze obsolete da rimuovere.

## Limiti

- Gli eseguibili non hanno firma Authenticode; il controllo ha restituito NotSigned.
- Il log di build riporta l'icona predefinita Electron e ASAR disattivato nella configurazione.
- Un solo circuito, modello, seed e checkpoint; quattro generazioni per ramo.
- Nessun giro completato; non è verificata la convergenza né la generalizzazione.
