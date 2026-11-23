# MAL-E CNS Circuit Lab per Windows nativo

Build di sviluppo della 5.7.1 per Windows x64. Il portable gira offline senza Electron, WebView2, Node o server locale. La finestra, l’interfaccia Bevy, i solutori neurali V2–V5, la geometria della pista, la fisica, il calcolo delle ricompense, l’ottimizzatore diagonale, il generatore casuale, il cronometraggio del confronto e la convalida dei file di salvataggio usano Rust. QuickJS resta incorporato per gestire le generazioni, comporre il punteggio e trasferire lo stato da e verso la simulazione.

## Guida

Aprire `MAL-E-CNS-Circuit-Lab-native-x64.exe`. Al primo avvio la sessione parte con 16 auto V5 nel Laboratorio, in panoramica. Le impostazioni permettono di selezionare circuito, modello, camera, popolazione e mutazione. Il controllo della velocità imposta un obiettivo tra 0,5× e 30×. Il pannello mostra separatamente la velocità effettiva.

- **Sessione** mostra circuito, telemetria, storico delle generazioni e comandi di salvataggio. Le diagnostiche separano i test di propulsione dall’apprendimento. Sono disponibili cambio sequenziale, ABS e TC. Spazio mette in pausa o riprende, C cambia camera, Tab cambia auto e R mostra i raggi. Alt apre la barra dei menu e F11 attiva lo schermo intero.
- **Mappa 2D** usa una proiezione ortografica. In **Vista 3D** sono disponibili panoramica, inseguimento e prima persona con volante animato. Usare la rotella per lo zoom e trascinare con il pulsante destro in mappa, panoramica e prima persona.
- **Cervello 3D** visualizza le coordinate somatiche MaleCNS campionate. Si può scegliere vista e filtro, colorare per classe o attività, congelare l’attività e inquadrare un neurone tramite Body ID.
- **Affiancati** mostra circuito e cervello insieme.
- **Confronto modelli** prova V2–V5 in sequenza da zero con circuito, popolazione, mutazione e seed condivisi. Registra giri, generazioni finite e tempi, attende la fine naturale della generazione ed esporta il risultato in JSON. Il campo dei minuti accetta interi da 0 a 1440. Impostarlo a zero disattiva il limite. Da qui si possono anche importare, provare e affinare decoder V3 compatibili.

Monza, Monaco, Le Mans e il laboratorio riusano i dati geometrici 5.7.1. Il renderer nativo usa altimetria, vie di fuga, cordoli, barriere, tribune, edifici, alberi e acqua preparati dagli asset esistenti. [Crediti auto](../outputs/assets/PORSCHE-3D-CREDITS.md) · [Crediti ambiente](../outputs/assets/ENVIRONMENT-CREDITS.md) · [Font](../outputs/assets/fonts/PROVENANCE.md).

Il solutore neurale V4/V5 usa la GPU quando disponibile e passa a CPU in caso di errore. Il formato 5.7.1 supporta i progressi multiworker con campione globale. Il ripristino valida versione, checksum, modello e stati dei worker e riparte in pausa all’inizio della generazione salvata.

La build Bevy usa uno shader nativo per il terreno e l’acqua e riprende cielo e nebbia della 5.7.1. La verifica della parità visiva resta aperta. QuickJS esegue ancora parti del runtime.

## Compilazione e verifica

Servono un toolchain Rust per Windows x64, un compilatore C per compilare QuickJS e Node per preparare le mesh dai sorgenti 5.7.1.

```powershell
cargo build --locked --manifest-path native/Cargo.toml
node native/verify-parity.cjs native/target/debug/male-cns-native.exe
node native/verify-parity.cjs native/target/debug/male-cns-native.exe --evolution
cargo test --locked --manifest-path native/Cargo.toml --no-default-features
node native/verify-runtime.cjs native/target/debug/male-cns-native.exe
native/target/debug/male-cns-native.exe --smoke .impeccable/review/native-smoke
```

I test deterministici confrontano posizioni, velocità, comandi neurali, punteggio, progressione e salvataggi. La modalità `--evolution` controlla anche gli aggiornamenti dell’ottimizzatore e i genomi dopo il cambio di generazione. La verifica runtime copre il ripristino multiworker, la GPU e il fallback a CPU. La prova Windows controlla l’avvio, il movimento a Monza, la lettura dell’atlante, l’isolamento del confronto e il cambio di camera.
