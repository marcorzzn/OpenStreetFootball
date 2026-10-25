# ⚽ Cortile Celestini — Open Street Football

Un gioco di calcio da strada 3D **100% open-source e gratuito**, ispirato alle atmosfere poetiche de *La Compagnia dei Celestini* e al calcio amatoriale tra ragazzini nei cortili italiani.

Progettato per girare fluidamente su **qualsiasi browser moderno anche su macchine poco potenti** (GPU integrate, vecchi portatili) e già predisposto per **Android** (controlli touch virtuali e controller Bluetooth/USB).

---

## ✨ Caratteristiche Principali

1. **Doppia Visuale in Tempo Reale (`Tasto C` / `V`)**:
   - **Visuale Classica TV (Da Lontano)**: telecamera dinamica ampia in stile arcade/broadcast che segue l'azione e le sponde sui muri.
   - **Visuale Prima Persona (FPS / POV)**: gioca dagli occhi del calciatore con mirino, *head-bob* in corsa, scarpini visibili durante il tiro e rotazione libera dello sguardo (Mouse, tasti `Q`/`R` o Stick Destro del pad).
2. **Fisica Reale dei Palloni Nostalgici (`Tasto B`)**:
   - 🟠 **Super Santos**: leggerissimo (`0.18 kg`), rimbalzo altissimo (`93%`), effetto Magnus accentuato e oscillazione aerodinamica imprevedibile (*wobble*) sopra i `7 m/s` e col vento.
   - ⚽ **Cuoio 32 Esagoni**: il classico pallone cucito a mano, equilibrato e sincero.
   - 🌧️ **Cuoio Bagnato (Piombo)**: inzuppato d'acqua (`0.68 kg`), pesantissimo, rimbalza pochissimo e frena sull'asfalto (si attiva anche automaticamente dopo 45 secondi di pioggia).
   - ✂️ **Pallone Bucato**: forato dalle forbici della Signora Maria, perde pressione nel tempo, sbanda e sibila ad ogni calcio.
3. **Gag del Cortile (Trigger 3D + Macchina a Stati)**:
   - **La Vecchia buca il pallone**: se tiri sul balcone fiorito a nord-ovest, la Signora Maria buca la palla per 20 secondi.
   - **Finestra Rotta**: colpendo la vetrata del condominio a nord-est, il vetro esplode in frantumi balistici 3D.
   - **Pallone sul Tetto**: i pallonetti troppo alti restano incastrati sulle tegole prima che venga lanciato il pallone di riserva.
   - **Allarme della Panda**: colpendo l'utilitaria parcheggiata scatta la sirena con fari lampeggianti.
   - **Palla nel Tombino**: finendo sulla griglia di scolo, sparisce con un *plop* ed entra in campo il Super Santos di scorta.
4. **Multiplayer Online, LAN e Locale**:
   - **1P vs IA del Rione (3v3)** con cambio giocatore rapido (`K`).
   - **2P Locale** sulla stessa tastiera o con 2 controller esterni.
   - **Online & LAN** tramite server WebSocket autoritativo integrato (`server.ts`) con stanze a codice di 5 lettere e rilevamento automatico dell'IP LAN locale.
5. **Profiler Performance In-Game (`Tasto F3`) & Render Scale**:
   - Monitor in tempo reale di **FPS**, **Frame Time (ms)**, **Draw Calls**, **Triangoli WebGL** e **Risoluzione Interna (`50%`, `75%`, `100%` + Auto-FPS Guard)** per garantire 60 FPS anche su GPU integrate datate.

---

## 🚀 Avvio Rapido in Locale & Multiplayer LAN

### Prerequisiti
- [Node.js](https://nodejs.org/) (v18 o superiore)

### 1. Installazione
```bash
npm install
```

### 2. Avvio Server di Sviluppo + WebSocket LAN (Porta 3000)
```bash
npm run dev
```
- Apri `http://localhost:3000` sul tuo PC.
- Per giocare in **LAN** con amici o da uno **smartphone Android** collegato alla stessa rete Wi-Fi, apri il menu **Lobby Online / LAN** nel gioco: vedrai l'indirizzo IP locale (es. `http://192.168.1.X:3000`) e il codice stanza da condividere.

---

## 📦 Pubblicazione Gratuita (GitHub Pages, Itch.io e Android)

Il file `vite.config.ts` utilizza già `base: './'`, generando percorsi relativi compatibili con qualsiasi hosting statico o WebView Android:

```bash
npm run build
```

1. **GitHub Pages**: pubblica il contenuto della cartella `dist/` tramite GitHub Actions o branch `gh-pages`.
2. **Itch.io**: comprimi il contenuto della cartella `dist/` in un file `.zip` (assicurandoti che `index.html` sia nella radice dello ZIP), caricalo su Itch.io e spunta **"This file will be played in the browser"**.
3. **Android (Capacitor / WebView)**: la build in `dist/` può essere incapsulata direttamente con `@capacitor/android` per generare un APK nativo con controlli Touch e Gamepad Bluetooth già pronti.

---

## 🎮 Tabella dei Controlli (Priorità Tastiera + Controller Esterni + Touch)

| Azione | Tastiera Giocatore 1 (Prioritaria) | Tastiera Giocatore 2 (Locale) | Controller Esterno (Xbox / PS / Android) | Touch Android |
| :--- | :--- | :--- | :--- | :--- |
| **Movimento** | `W` `A` `S` `D` | `Frecce Direzionali` | Stick Sinistro / D-Pad | Stick Virtuale Sinistro |
| **Scatto** | `Shift Sinistro` | `Ctrl Destro` / `Num 0` | `RT` / `R2` | Tasto `SCATTA` |
| **Tiro (Carica)** | `Spazio` oppure `J` | `Invio` / `Num 1` | `X` / `Quadrato` / `RB` | Tasto `TIRO` |
| **Passa / Cambia Uomo** | `K` oppure `X` | `Shift Destro` / `Num 2` | `A` / `Croce` | Tasto `PASSA` |
| **Cappello / Scavetto** | `L` oppure `Z` | `M` / `\` | `Y` / `Triangolo` | Tasto `CAPPELLO` |
| **Scivolata** | `E` oppure `F` | `.` / `Num 3` | `B` / `Cerchio` | Doppio Tap |
| **Visuale FPS / TV** | `C` oppure `V` | — | `Select` / `R3` | Tasto `FPS / TV` |
| **Sguardo in FPS** | `Mouse` (Click) o `Q` / `R` | — | Stick Destro | Drag su schermo |
| **Cambia Pallone** | `B` | — | `LB` / `L1` | Selettore Dock |
| **Profiler FPS / GPU** | `F3` | — | — | Dock Prestazioni |
| **Nascondi Dock** | `H` | — | — | Maniglia Dock |

---

## 📜 Licenza

Rilasciato sotto **[Licenza MIT](./LICENSE)** — completamente libero, gratuito e aperto ai contributi della community. Zero asset proprietari: tutti i modelli 3D, le texture e gli effetti sonori Web Audio sono generati proceduralmente in codice.
