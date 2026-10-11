# Verifica 4.6.0 — Porsche 911 GT3 R (992)

30 settembre 2026. Modello fisico ridotto da gara, offline, senza traiettorie
preimpostate e senza collisioni tra auto. Le osservazioni riportate qui sono
misure del codice locale, **non telemetria Porsche/Michelin o validazione WEC**.

## Specifiche, stime e unità

Riferimento: [scheda tecnica ufficiale Porsche GT3 R 2026, 8 agosto 2025](https://newsroom.porsche.com/dam/jcr%3A3b5e8287-01fb-481f-9d5c-2add88364f30/250808e_Technical%20Data%20911%20GT3%20R26.pdf),
[pagina attuale del modello](https://racing.porsche.com/en-US/cars/911-gt3-r-2026).
Le quattro pagine tecniche sono state lette anche come rendering del PDF.
[Manifest verificabile](vehicle-992-provenance.json) con SHA-256 della fonte,
valori pubblicati, parametri stimati, algoritmi, riferimenti metrici e limiti.

| Pubblicato da Porsche | Implementazione |
| --- | --- |
| Boxer posteriore 4.194 cm³, circa 416 kW, 9.250 rpm | Curva di coppia stimata, limitata alla potenza nominale; limitatore e freno motore |
| Sei marce sequenziali, trazione posteriore, LSD | Rapporti/finale/precarico stimati; coppia solo al posteriore, cambio a taglio di coppia |
| Passo 2,507 m, lunghezza 4,619 m, larghezza max 2,050 m | Dimensioni fisiche metriche; scatola orientata contro i segmenti dei muri |
| Massa base circa 1.265 kg, dipendente dal BoP | Scelta di modello: +75 kg pilota e 30 L carburante iniziali; non massa di gara omologata dichiarata |
| Serbatoio 117 L, freni anteriori 390 / posteriori 370 mm | Consumo, bilanciamento e torques/riscaldamento freni stimati |
| Gomme 30/68-18 e 31/71-18 | Raggi nominali derivati 0,340 / 0,355 m; forze e parametri non misurati Michelin |
| ABS da corsa e controllo trazione | Algoritmi propri, feedback dello slip; non software Bosch/Porsche |

Fisica SI: gravità 9,80665 m/s², stato longitudinale/laterale/imbardata, quattro
velocità di contatto, dinamica rotazionale delle gomme, aderenza combinata,
resistenze, aero quadratica, trasferimenti di carico e risposta smorzata del corpo.
Tick 60 Hz con quattro substep meccanici, 240 Hz. Controllo/ricorrenza restano 10 Hz.
Folle, retromarcia, protezione da scalata fuori giri e tempi di cambiata sono
funzionali. Il cambio automatico usa RPM, **non sensori stradali o coordinate**.

Lunghezze calibrate uniformemente: Monza 5.793 m, Monaco 3.337 m, Le Mans
13.626 m. Fonti nel manifest. La conversione non modifica i poligoni e non
dimostra larghezze, raggi locali, quote, asperità o cordoli rilevati.

## Prove fisiche ripetibili

[Banco JSON](physics-992-benchmark.json), `node work/benchmark-992.cjs`:

| Prova del modello, piano senza pista | Risultato simulato |
| --- | ---: |
| 0–100 km/h, assistenze standard | 3,35 s |
| Marce raggiunte a gas pieno | 1–6, cinque cambiate |
| Velocità al termine di 120 s di accelerazione | 298,37 km/h |
| Frenata 100–0 km/h | 2,333 s / 31,625 m |
| Picco di decelerazione nella prova di frenata | 1,287 G |

Questi numeri descrivono il banco, **non prestazioni reali verificate della GT3 R**.
Il confronto con dati strumentali reali non è stato eseguito. Non posso
confermare una corrispondenza a un simulatore commerciale o a un evento WEC.

Suite: [TAP 4.6.0](test-results-v460.tap), 139 test superati, zero falliti,
saltati o annullati. `node work/run-tests-v460.cjs` e `npm test`.
Tra i 27 test specifici della vettura: cambio/taglio coppia, RWD, folle/retro,
protezione fuori giri, arresto senza inversione, ABS/TC che intervengono davvero,
circolo delle forze, conservazione dei carichi, aero quadratica, consumo/massa,
termica/usura, simmetria, inerzia di imbardata, indipendenza dalla scala mappa,
telemetria corretta a episodio terminato. Stress: 32 sequenze deterministiche
di 30 s con sterzate e frenate aggressive, con/senza assistenze, nessuno stato
non finito o superamento del cerchio delle forze.

Le regressioni verificano ancora sensori sui bordi fisici, auto ghost, assenza di
route policy, ablation del grafo/rete spenta, determinismo dei moltiplicatori,
pause, circuiti, save isolation, osservatore e trasporto di 100 agenti.

## Apprendimento con la nuova fisica

[Storico nuovo](physics-992-learning.json), `node work/check-992-learning.cjs`:
V2, Laboratorio, seed 7717, 32 auto, mutazione iniziale 16%, nessun warm start,
12 generazioni concluse naturalmente, 384 episodi valutati. Primo risultato con
due giri: generazione 11, giro migliore 51,183 s; generazione 12: 48,167 s.
Progresso migliore: 439,44 m alla generazione 1, 4.265,61 m alla generazione 12.

La rete riceve 28 misure, incluse sei nuove del gruppo motore/ruote/termica.
202 parametri appresi, grafi anatomici e budget sparsi conservati. Non riceve
coordinate, mezzeria, curva obiettivo, target speed o azioni di un insegnante.
La posizione sul circuito serve solo a valutare il risultato.

Durante l'integrazione una prova ha evidenziato un'auto a circa 0,22 m/s che
manteneva indefinitamente aperta la generazione. Il criterio corretto ora richiede
5 m di nuovo progresso entro 5 s prima di aggiornare il timer dello stallo.
Restano massimo due giri per auto e nessun limite globale di durata. Penalità
zero-giri, regressione del giro, incidenti, tempo e backtracking non sono ridotte.

La prova non dimostra la convergenza di V3/V4 o su tutte le piste. Il confronto
con il giro alla generazione 61 della 4.4 non è controllato: dinamica e scala
sono cambiate. Un eseguibile che si avvia non è una prova d'apprendimento.

## App e interfaccia

[Conferma nativa del sorgente](physics-confirm-v460/physics-smoke.json):
24 controlli superati con 100 auto, un worker e WebGPU attivo su NVIDIA Lovelace.
Carichi di quattro ruote e campione neurale completo solo sull'auto osservata;
le altre conservano telemetria compatta. Controlli cambio manuale/ABS/TC
riconosciuti dal worker, selezione A-100, pausa di fisica/carburante/RPM/cambio,
marcia che termina al resume, ritorno alla policy anatomica e assistenze standard.
Un'osservazione in pausa non avanza la prova; se il tick GPU è invalidato mostra
esplicitamente attesa/necessità di resume, senza un campione inventato.

Una sola revisione visiva ampia/stretta, poi una conferma: split mappa/atlante,
telemetria espansa, cambio/assistenze e mappa a 390 px. Nessun overflow
orizzontale o controllo fuori campo. Correzione di scala in metri e coerenza del
contatore della popolazione. Impeccable ha mantenuto palette, disclosure native
e mappa interattiva; nessuna immagine/mesh Porsche spacciata per asset ufficiale.

## Pacchetto Windows e verifiche della consegna

Portable e installer x64 4.6.0: `dist-physics-v460/`. Non installare
automaticamente l'installer. Vecchie versioni/profili/campioni sono preservati.
Il namespace dei campioni include la revisione `992-gt3r-si-1` e non riutilizza
la dinamica precedente. Le modifiche manuali dei controlli vettura escludono
quel singolo episodio dalla selezione e dall'ottimizzatore.

La verifica finale dell'eseguibile è un report esterno al pacchetto per poter
includere SHA-256 degli eseguibili e confrontare codice confezionato/sorgente:
[release-verification-v460.json](release-verification-v460.json).
L'esito valido è `passed:true`, con report della portable GPU/CPU e controllo
dei tre modelli collegati. I JSON/screenshots finali si producono nella cartella
di progetto dopo la compilazione, non in un profilo utente di allenamento.
La firma Authenticode viene riportata separatamente: `NotSigned` non è un
certificato verificato; Windows può avvisare. Installer costruito, non installato.

Non sono verificati throughput 30x costante con 100 agenti, temperature durante
sessioni prolungate, continuità di stato dopo perdita GPU a caldo, o apprendimento
su tutti i modelli/piste. CPU gestisce meccanica/sensori/punteggio/ottimizzatore,
WebGPU la ricorrenza V4: non viene promessa fisica interamente su GPU.

## Limiti di realismo

Modello planare con risposta del corpo e trasferimento di carico, **non**
cinematica 3D completa della sospensione. Nessuna altimetria rilevata, urto
deformabile/rimbalzo, quota fisica dei cordoli, meteo/pioggia, pneumatico
Pacejka misurato, danno, suono, scia, pit stop o strategia di gara. Gli urti
terminano la prova e fermano velocità del corpo/ruote; il campione G rimane
l'ultimo prima del termine, non una decelerazione d'impatto calcolata.
L'app è una base tecnica migliorata per esperimenti di apprendimento, non una
certificazione del comportamento della Porsche reale.
