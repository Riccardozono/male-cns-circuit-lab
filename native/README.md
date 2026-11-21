# MAL-E CNS Circuit Lab per Windows nativo

Anteprima di sviluppo a partire dalla 5.7.1. L'eseguibile incorpora i dati MaleCNS, la Porsche GLB e il codice di compatibilità della simulazione. La finestra, i controlli e il rendering usano Rust e Bevy. Il calcolo dei neuroni V2–V5, i raggi, il controllo della carreggiata e le collisioni tra l'auto e il circuito sono in Rust. QuickJS è collegato al binario per eseguire la fisica, le ricompense e l'evoluzione di riferimento. L'app gira offline usando le API di Windows e il driver grafico.

## Avvio

Da Windows, aprire `male-cns-native.exe`. La prova parte in pausa con 16 auto V3 a Monza. I pulsanti cambiano pista, profilo, popolazione, velocità e camera. Cambiare pista, profilo o popolazione avvia una sessione nuova. Spazio avvia o mette in pausa, C cambia camera, Tab seleziona un'auto o riattiva la selezione del leader e R accende i raggi del leader.

Sono disponibili Monza, Monaco, Le Mans e il circuito di laboratorio. La grafica usa le carreggiate reali del catalogo, una rappresentazione semplificata del terreno, gli alberi GLB e il modello GLB dell'auto selezionata. La velocità nel pannello è il moltiplicatore richiesto e la velocità effettiva dipende dal carico. [Crediti di auto](../outputs/assets/PORSCHE-3D-CREDITS.md), [alberi](../outputs/assets/ENVIRONMENT-CREDITS.md) e [font](../outputs/assets/fonts/PROVENANCE.md).

Questa anteprima usa un worker e il solutore neurale CPU. Può caricare progressi 5.7.1 con un solo worker e senza campione globale, dopo i normali controlli di compatibilità e checksum. Il ricaricamento riparte dalla generazione salvata in pausa. Per la copertura completa delle funzioni desktop si usa la release 5.7.1.

## Compilazione e verifica

Con un toolchain Rust Windows x64 e un compilatore C per il motore incorporato:

```powershell
cargo build --locked --manifest-path native/Cargo.toml
node native/verify-parity.cjs native/target/debug/male-cns-native.exe
native/target/debug/male-cns-native.exe --smoke .impeccable/review/native-smoke
```

Node è usato dal confronto di sviluppo per eseguire la simulazione di riferimento. Il confronto copre brevi prove deterministiche e la leggibilità dei salvataggi generati. Non misura la convergenza dell’addestramento.
