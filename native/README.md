# MAL-E CNS Circuit Lab per Windows nativo

Build di sviluppo della 5.7.1 per Windows x64. Il portable incorpora simulazione, dati MaleCNS, mesh dei circuiti, auto GLB, alberi e font. La finestra, l’interfaccia, il rendering Bevy, i solutori neurali V2–V5, i sensori di distanza, le collisioni con la pista e il campionamento del terreno usano Rust. QuickJS è collegato all'eseguibile e usa le implementazioni di riferimento di fisica, ricompense ed evoluzione. Il portable gira offline senza Electron, WebView2, Node o server locale.

## Guida

Aprire `MAL-E-CNS-Circuit-Lab-native-x64.exe`. Una sessione nuova si avvia con 16 auto V3 a Monza e la camera in inseguimento. Le impostazioni permettono di selezionare circuito, modello, camera, popolazione e mutazione. Il controllo della velocità imposta un obiettivo tra 0,5× e 30×. Il pannello mostra separatamente la velocità effettiva.

- **Sessione** mostra il circuito, la telemetria dell'auto selezionata, lo storico delle generazioni e i comandi di salvataggio. Spazio mette in pausa o riprende, C cambia camera, Tab cambia auto e R mostra i raggi.
- **Mappa 2D** usa una proiezione ortografica. In **Vista 3D** sono disponibili panoramica, inseguimento e prima persona con volante animato. Usare la rotella per lo zoom e trascinare con il pulsante destro in mappa, panoramica e prima persona.
- **Cervello 3D** visualizza un campione di coordinate somatiche MaleCNS. I colori mostrano le classi anatomiche o l’attività del pilota selezionato. Si può orbitare, zoomare e congelare il campione.
- **Affiancati** mostra circuito e cervello insieme.
- **Confronto modelli** parte da zero e prova V2–V5 in sequenza con circuito, popolazione, mutazione e seed condivisi. Registra il tempo reale e simulato, i giri e il tempo dei due giri completati. Il limite reale è per modello e impostarlo su zero lo disattiva.

Monza, Monaco, Le Mans e il laboratorio riusano i dati geometrici 5.7.1. Il renderer nativo usa altimetria, vie di fuga, cordoli, barriere, tribune, edifici, alberi e acqua preparati dagli asset esistenti. [Crediti auto](../outputs/assets/PORSCHE-3D-CREDITS.md) · [Crediti ambiente](../outputs/assets/ENVIRONMENT-CREDITS.md) · [Font](../outputs/assets/fonts/PROVENANCE.md).

Il rendering usa la GPU e il solutore neurale usa un worker CPU. L'interfaccia di riferimento mantiene un atlante più completo e shader 3D aggiuntivi. Questa build apre progressi 5.7.1 con un worker e senza campione globale dopo i controlli di compatibilità e checksum. Il ricaricamento riparte in pausa dalla generazione salvata.

## Compilazione e verifica

Servono un toolchain Rust per Windows x64, un compilatore C per compilare QuickJS e Node per preparare le mesh dai sorgenti 5.7.1.

```powershell
cargo build --locked --manifest-path native/Cargo.toml
node native/verify-parity.cjs native/target/debug/male-cns-native.exe
native/target/debug/male-cns-native.exe --smoke .impeccable/review/native-smoke
```

Il confronto deterministico copre posizioni, velocità, comandi neurali, progressione e salvataggi su sessioni brevi. La prova Windows verifica anche l’avvio, il movimento a Monza, la lettura dell’attività, l’isolamento della modalità confronto e il cambio di camera. La parità sulle sessioni brevi non misura la convergenza dell’addestramento.
