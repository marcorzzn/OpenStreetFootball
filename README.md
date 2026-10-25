# ⚽ OpenStreetFootball

**OpenStreetFootball** è un gioco di calcio da strada 3D **100% open-source (licenza MIT) e gratuito** che gira direttamente nel browser, progettato per funzionare in modo fluido anche su **macchine poco potenti** (GPU integrate, portatili datati) e predisposto per dispositivi mobili **Android**.

Rievoca il calcio amatoriale tra ragazzini nei cortili e nelle strade di quartiere: porte fatte con i giubbotti o con le pietre, sponde sui muri, condizioni meteo variabili, gag di cortile e palloni con comportamenti fisici molto diversi tra loro.

---

## ✨ Caratteristiche Principali

1. **Doppia Visuale in Tempo Reale (`Tasto C` / `V`)**:
   - **Visuale Classica TV (Da Lontano)**: inquadratura ampia dinamica in stile arcade che segue l'azione, i passaggi e le sponde sui muri.
   - **Visuale Prima Persona (FPS / POV)**: visuale dagli occhi del giocatore controllato con mirino centrale, oscillazione del passo (*head-bob*), gambe/scarpini visibili durante il calcio e rotazione libera dello sguardo (Mouse, tasti `Q`/`R` o Stick Destro del controller).
2. **Profili Fisici dei Palloni (`Tasto B`)**:
   - 🟠 **Pallone di Plastica**: leggerissimo (`0.18 kg`), rimbalzo altissimo (`93%`), effetto Magnus accentuato e traiettoria imprevedibile (*wobble*) alle alte velocità e col vento.
   - ⚽ **Cuoio 32 Esagoni**: il classico pallone cucito a mano, equilibrato nel peso (`0.43 kg`) e nel rimbalzo.
   - 🌧️ **Cuoio Bagnato (Piombo)**: inzuppato d'acqua (`0.68 kg`), pesantissimo, rimbalza pochissimo e frena rapidamente (si attiva anche in automatico dopo 45 secondi di pioggia).
   - ✂️ **Pallone Bucato**: forato per dispetto, perde pressione e raggio col passare dei secondi, sbanda e sibila ad ogni tocco.
3. **Meteo e Gag del Cortile**:
   - **Meteo**: *Tramonto Dorato*, *Pomeriggio d'Estate*, *Acquazzone Estivo*, *Vento di Quartiere*, *Nebbia Fitta* e *Notturna coi Lampioni*.
   - **Gag**: *La vecchia che buca il pallone* dal balcone, *Finestra rotta* con schegge 3D, *Pallone sul tetto*, *Allarme dell'auto parcheggiata* e *Palla nel tombino* (disattivabili dal menu).
4. **Profiler Prestazioni (`Tasto F3`) & Render Scale**:
   - Monitor in-game in tempo reale per **FPS**, **Frame Time (ms)**, **Draw Calls**, **Triangoli WebGL** e selettore di risoluzione interna (**50%**, **75%**, **100%** + **Auto-FPS**) per garantire fluidità su hardware modesto.

---

## 🚀 Come Avviare il Gioco in Locale

### Prerequisiti
- [Node.js](https://nodejs.org/) (v18+) oppure [Bun](https://bun.sh/)

### Installazione e Avvio
```bash
# Installa le dipendenze
npm install
# (oppure: bun install)

# Avvia il client Vite + il server WebSocket LAN sulla porta 3000
npm run dev
# (oppure: bun run dev)
```

Apri il browser all'indirizzo: **`http://localhost:3000`**

---

## 🌐 Come Giocare in Multiplayer LAN (con `server.ts`)

Il comando `npm run dev` (o `npm start`) esegue `server.ts`, che avvia sia il sito web sia il server WebSocket autoritativo sulla porta `3000`:

1. Sul computer **Host**, avvia `npm run dev` e clicca sul pulsante **Lobby Online / LAN** in alto a destra.
2. Nella finestra della Lobby leggerai l'**Indirizzo LAN** rilevato automaticamente sulla tua rete Wi-Fi/Ethernet (ad esempio `http://192.168.1.25:3000`).
3. Clicca su **+ Crea Nuova Stanza Host**: otterrai un codice stanza di 5 lettere (es. `K7M9P`).
4. Gli altri giocatori (su altri PC o smartphone Android collegati alla **stessa rete Wi-Fi/LAN**) aprono il browser all'indirizzo `http://<IP-DELL-HOST>:3000`, aprono **Lobby Online / LAN** e inseriscono il codice stanza (oppure cliccano direttamente su **Unisciti** nella lista delle stanze aperte).

### ⚠️ Limiti su GitHub Pages e Itch.io (Hosting Statico)
- **GitHub Pages** e **Itch.io** ospitano esclusivamente file statici (`HTML`, `JS`, `CSS`) e **non eseguono il processo Node.js `server.ts`**.
- Pertanto, aprendo il gioco da GitHub Pages o Itch.io funzionano immediatamente:
  - **1P vs IA del Rione (3v3)**
  - **2P Locale** (sulla stessa tastiera o con 2 controller collegati allo stesso dispositivo)
- Per usare il **Multiplayer in LAN / Rete** tra dispositivi diversi, l'Host deve avviare il progetto con `npm run dev` (o `npm start`) sul proprio computer.

---

## 🎮 Controlli di Gioco (Priorità Tastiera + Gamepad + Touch)

| Azione | Tastiera Giocatore 1 (Prioritaria) | Tastiera Giocatore 2 (Locale) | Controller Esterno (Xbox / PS / USB / BT) | Touch Android |
| :--- | :--- | :--- | :--- | :--- |
| **Movimento** | `W` `A` `S` `D` | `Frecce Direzionali` | Stick Sinistro / D-Pad | Stick Virtuale Sinistro |
| **Scatto** | `Shift Sinistro` | `Ctrl Destro` / `Num 0` | `RT` / `R2` | Tasto `SCATTA` |
| **Tiro (Carica)** | `Spazio` oppure `J` | `Invio` / `Num 1` | `X` / `Quadrato` / `RB` | Tasto `TIRO` |
| **Passa / Cambia Uomo** | `K` oppure `X` | `Shift Destro` / `Num 2` | `A` / `Croce` | Tasto `PASSA` |
| **Pallonetto (Cappello)** | `L` oppure `Z` | `M` / `\` | `Y` / `Triangolo` | Tasto `CAPPELLO` |
| **Scivolata / Contrasto** | `E` oppure `F` | `.` / `Num 3` | `B` / `Cerchio` | — |
| **Visuale FPS / TV** | `C` oppure `V` | — | `Select` / `R3` | Tasto `FPS / TV` |
| **Ruota Sguardo (FPS)** | `Mouse` (Click sul campo) o `Q` / `R` | — | Stick Destro | — |
| **Cambia Pallone** | `B` | — | `LB` / `L1` | Selettore nel Dock |
| **Profiler FPS / GPU** | `F3` | — | — | Pulsante `HUD FPS (F3)` |
| **Mostra / Nascondi Dock** | `H` | — | — | Maniglia superiore Dock |
| **Pausa** | `Esc` | `Esc` | `Start` | Icona Pausa in alto |

---

## 📊 Profiler Performance (`F3`) per Macchine Poco Potenti

Premendo **`F3`** (o cliccando su `HUD FPS (F3)` nella scheda *4. Rete LAN & Prestazioni* del dock inferiore) puoi attivare o nascondere il monitor delle prestazioni in alto a sinistra, che mostra:
- **FPS** attuali e **tempo di rendering per frame (`ms`)**
- **Draw Calls** e **Triangoli WebGL**
- **Render Scale attivo (`50%`, `75%`, `100%`)**

Su notebook con scheda video integrata, impostare il **Render Scale a `75%` o `50%`** (o attivare `Auto-FPS`) riduce il carico per pixel mantenendo l'interfaccia nitida.

---

## 📜 Crediti e Licenza

- **Zero Asset Protetti**: tutti i modelli 3D, le texture Canvas 2D e gli effetti sonori Web Audio API sono generati proceduralmente nel codice sorgente. Nessun asset o marchio di terze parti è incluso.
- Distribuito sotto **[Licenza MIT](./LICENSE)** — Copyright (c) 2026 Marco Razzano (`marcorzzn`).
