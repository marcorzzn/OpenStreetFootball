import { GAG_CONFIGS, GagId, GagLifecycleState } from '../types/game';
import { SeededRNG } from './rng';

export interface GagDataPayload {
  targetX?: number;
  targetZ?: number;
  grabbed?: boolean;
}

/**
 * Oggetto dati puro e serializzabile in JSON per ogni singola gag.
 * Non contiene né funzioni né riferimenti a oggetti Three.js.
 */
export interface GagStateItem {
  id: GagId;
  state: GagLifecycleState;
  stateStartStep: number;
  cooldownUntilStep: number;
  payload: GagDataPayload;
}

/**
 * Stato serializzabile unico dell'intero sistema gag (pronto per l'invio WebSocket nella Fase F).
 */
export interface GagSystemState {
  items: Record<GagId, GagStateItem>;
  activeGagId: GagId | null;
  dogNearBallSteps: number;
}

export interface GagActionHandlers {
  onTriggered?: (item: GagStateItem, simSteps: number) => void;
  onBeatEnter?: (item: GagStateItem, simSteps: number) => void;
  onBeatStep?: (item: GagStateItem, simSteps: number, progress: number) => void;
  onResolveEnter?: (item: GagStateItem, simSteps: number) => void;
  onResolveStep?: (item: GagStateItem, simSteps: number, progress: number) => void;
  onCooldownEnter?: (item: GagStateItem, simSteps: number) => void;
  onIdleEnter?: (item: GagStateItem, simSteps: number) => void;
}

export type GagActionRegistry = Record<GagId, GagActionHandlers>;

const ALL_GAG_IDS: GagId[] = [
  'vecchia_buca',
  'finestra_rotta',
  'palla_tetto',
  'allarme_auto',
  'tombino_fogna',
  'cane_palla',
];

export function createInitialGagSystemState(): GagSystemState {
  const items = {} as Record<GagId, GagStateItem>;
  for (const id of ALL_GAG_IDS) {
    items[id] = {
      id,
      state: 'Idle',
      stateStartStep: 0,
      cooldownUntilStep: 0,
      payload: {},
    };
  }
  return {
    items,
    activeGagId: null,
    dogNearBallSteps: 0,
  };
}

/**
 * Tenta di avviare una gag:
 * - Se force === false: rispetta il limite di massimo una gag attiva (Triggered/Beat/Resolve),
 *   il cooldown in simSteps e la probabilità deterministica tramite SeededRNG.
 * - Se force === true (pulsanti rapidi del dock): ignora probabilità e cooldown; se un'altra gag
 *   era attiva, la chiude pulitamente prima di avviare quella richiesta.
 */
export function tryTriggerGag(
  gagState: GagSystemState,
  id: GagId,
  simSteps: number,
  rng: SeededRNG,
  registry: GagActionRegistry,
  payload: GagDataPayload = {},
  force: boolean = false,
): boolean {
  const item = gagState.items[id];
  const cfg = GAG_CONFIGS[id];

  if (!force) {
    // Massimo una gag attiva alla volta (Triggered, Beat o Resolve)
    if (gagState.activeGagId !== null) {
      return false;
    }
    // Rispetta il cooldown in step fisici
    if (item.state !== 'Idle' || simSteps < item.cooldownUntilStep) {
      return false;
    }
    // Probabilità decisa esclusivamente dal PRNG seedato
    if (cfg.probability < 1.0 && rng.next() > cfg.probability) {
      // Piccolo cooldown anti-spam di 1.5s (90 step) se il tiro sul bersaglio non fa scattare la gag
      item.cooldownUntilStep = simSteps + 90;
      return false;
    }
  } else {
    // Se forzato dal pulsante del dock e c'è già una gag attiva, risolvi/chiudi quella precedente
    if (gagState.activeGagId !== null && gagState.activeGagId !== id) {
      const prevActive = gagState.items[gagState.activeGagId];
      const prevHandlers = registry[prevActive.id];
      prevHandlers.onCooldownEnter?.(prevActive, simSteps);
      prevActive.state = 'Idle';
      prevActive.stateStartStep = simSteps;
      prevActive.payload = {};
    }
  }

  item.state = 'Triggered';
  item.stateStartStep = simSteps;
  item.payload = { ...payload };
  gagState.activeGagId = id;

  registry[id].onTriggered?.(item, simSteps);

  // TODO (Fase F): Quando l'host avvia una transizione di stato gag in multiplayer,
  // inviare gagState serializzato in JSON ai client tramite WebSocket.

  return true;
}

/**
 * Avanza la macchina a stati di tutte le gag di 1 step fisico (chiamata solo dall'Host o in locale).
 * Ciclo: Idle -> Triggered -> Beat -> Resolve -> Cooldown -> Idle.
 */
export function stepGagStateMachine(
  gagState: GagSystemState,
  simSteps: number,
  registry: GagActionRegistry,
): void {
  for (const id of ALL_GAG_IDS) {
    const item = gagState.items[id];
    const cfg = GAG_CONFIGS[id];
    const handlers = registry[id];
    const elapsed = simSteps - item.stateStartStep;

    if (item.state === 'Triggered') {
      if (elapsed >= cfg.triggeredSteps) {
        item.state = 'Beat';
        item.stateStartStep = simSteps;
        handlers.onBeatEnter?.(item, simSteps);
        handlers.onBeatStep?.(item, simSteps, 0);
      }
    } else if (item.state === 'Beat') {
      const progress = cfg.beatSteps > 0 ? Math.min(1, elapsed / cfg.beatSteps) : 1;
      handlers.onBeatStep?.(item, simSteps, progress);
      if (elapsed >= cfg.beatSteps) {
        item.state = 'Resolve';
        item.stateStartStep = simSteps;
        handlers.onResolveEnter?.(item, simSteps);
        handlers.onResolveStep?.(item, simSteps, 0);
      }
    } else if (item.state === 'Resolve') {
      const progress = cfg.resolveSteps > 0 ? Math.min(1, elapsed / cfg.resolveSteps) : 1;
      handlers.onResolveStep?.(item, simSteps, progress);
      if (elapsed >= cfg.resolveSteps) {
        item.state = 'Cooldown';
        item.stateStartStep = simSteps;
        item.cooldownUntilStep = simSteps + cfg.cooldownSteps;
        if (gagState.activeGagId === id) {
          gagState.activeGagId = null;
        }
        handlers.onCooldownEnter?.(item, simSteps);
      }
    } else if (item.state === 'Cooldown') {
      if (simSteps >= item.cooldownUntilStep) {
        item.state = 'Idle';
        item.stateStartStep = simSteps;
        item.payload = {};
        handlers.onIdleEnter?.(item, simSteps);
      }
    }
  }
}
