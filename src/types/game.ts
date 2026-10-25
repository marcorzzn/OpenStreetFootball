export type BallProfileId = 'supersantos' | 'classico' | 'bagnato' | 'bucato';

export type WeatherId = 'tramonto' | 'sole' | 'pioggia' | 'vento' | 'nebbia' | 'notte' | 'fango';

export type PitchId = 'cortile' | 'strada' | 'terra' | 'spiaggia';

export type StreetRuleId = 'classica' | 'chi_segna_vince' | 'tre_pali' | 'palla_avvelenata';

export type CameraMode = 'classic' | 'fps';

export type GameMode = 'single' | 'local_2p' | 'online_lan';

export type GagId =
  | 'vecchia_buca'
  | 'finestra_rotta'
  | 'palla_tetto'
  | 'allarme_auto'
  | 'tombino_fogna'
  | 'cane_palla'
  | 'gabbiano_palla';

export type GagLifecycleState = 'Idle' | 'Triggered' | 'Beat' | 'Resolve' | 'Cooldown';

export interface BallProfile {
  id: BallProfileId;
  name: string;
  subtitle: string;
  mass: number; // kg
  radius: number; // m (visual/physics scaled in world units)
  visualRadius: number;
  restitution: number; // bounce
  linearDrag: number;
  rollFriction: number;
  magnus: number; // spin curve multiplier
  windFactor: number;
  wobble: {
    speedMin: number;
    force: number;
    freqHz: number;
  } | null;
  deflate: {
    rate: number;
    minRadius: number;
  } | null;
  primaryColor: string;
  secondaryColor: string;
}

export const BALL_PROFILES: Record<BallProfileId, BallProfile> = {
  supersantos: {
    id: 'supersantos',
    name: 'Pallone di Plastica',
    subtitle: 'Plastica arancione leggera, effetto matto e traiettoria imprevedibile col vento',
    mass: 0.18,
    radius: 0.105,
    visualRadius: 0.42,
    restitution: 0.93,
    linearDrag: 0.008,
    rollFriction: 0.01,
    magnus: 0.92,
    windFactor: 2.2,
    wobble: { speedMin: 7.0, force: 3.4, freqHz: 2.6 },
    deflate: null,
    primaryColor: '#ff521b',
    secondaryColor: '#18181b',
  },
  classico: {
    id: 'classico',
    name: 'Cuoio 32 Esagoni',
    subtitle: 'Il classico pallone da cortile cucito a mano, equilibrato e sincero',
    mass: 0.43,
    radius: 0.11,
    visualRadius: 0.44,
    restitution: 0.75,
    linearDrag: 0.015,
    rollFriction: 0.022,
    magnus: 0.42,
    windFactor: 1.0,
    wobble: null,
    deflate: null,
    primaryColor: '#f4f1ea',
    secondaryColor: '#1e293b',
  },
  bagnato: {
    id: 'bagnato',
    name: 'Cuoio Bagnato (Piombo)',
    subtitle: 'Inzuppato di pioggia e fango: pesantissimo, rimbalza poco e fa male ai piedi',
    mass: 0.68,
    radius: 0.11,
    visualRadius: 0.44,
    restitution: 0.28,
    linearDrag: 0.042,
    rollFriction: 0.065,
    magnus: 0.15,
    windFactor: 0.45,
    wobble: null,
    deflate: null,
    primaryColor: '#785a46',
    secondaryColor: '#292524',
  },
  bucato: {
    id: 'bucato',
    name: 'Pallone Bucato',
    subtitle: 'Forato dalle forbici della Signora Maria: floscio, sbanda e si sgonfia',
    mass: 0.43,
    radius: 0.11,
    visualRadius: 0.39,
    restitution: 0.12,
    linearDrag: 0.12,
    rollFriction: 0.15,
    magnus: 0.05,
    windFactor: 0.3,
    wobble: { speedMin: 3.0, force: 2.1, freqHz: 4.2 },
    deflate: { rate: 0.004, minRadius: 0.29 },
    primaryColor: '#d97706',
    secondaryColor: '#3f3f46',
  },
};

export interface WeatherConfig {
  id: WeatherId;
  name: string;
  description: string;
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  fogNear: number;
  fogFar: number;
  cameraFar: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  playerGripMultiplier: number;
  playerSpeedMultiplier: number;
  playerTurnMultiplier: number;
  ballRestitutionMultiplier: number;
  ballRollFrictionMultiplier: number;
  mudAccumulationRate: number;
  mudMaxMassBonus: number;
  groundTint: string;
  ballMudTint: string;
  windVector: [number, number, number];
}

export const WEATHER_CONFIGS: Record<WeatherId, WeatherConfig> = {
  tramonto: {
    id: 'tramonto',
    name: 'Tramonto Dorato',
    description: 'Luce dorata poetica tra i palazzi, ombre lunghe e colori saturi',
    skyColor: '#e07a5f',
    fogColor: '#e07a5f',
    fogDensity: 0.008,
    fogNear: 28,
    fogFar: 135,
    cameraFar: 140,
    sunColor: '#ffb703',
    sunIntensity: 2.2,
    hemiSky: '#f4a261',
    hemiGround: '#3d405b',
    playerGripMultiplier: 1.0,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 1.0,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [0.6, 0, 0.2],
  },
  sole: {
    id: 'sole',
    name: 'Pomeriggio d’Estate',
    description: 'Sole alto delle quattro, asfalto caldo e visibilità perfetta',
    skyColor: '#60a5fa',
    fogColor: '#93c5fd',
    fogDensity: 0.005,
    fogNear: 30,
    fogFar: 138,
    cameraFar: 140,
    sunColor: '#fffbeb',
    sunIntensity: 2.4,
    hemiSky: '#bae6fd',
    hemiGround: '#57534e',
    playerGripMultiplier: 1.0,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 1.05,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [0.2, 0, -0.1],
  },
  pioggia: {
    id: 'pioggia',
    name: 'Acquazzone Estivo',
    description: 'Terreno scivoloso, pozzanghere e pallone che si appesantisce col tempo',
    skyColor: '#334155',
    fogColor: '#475569',
    fogDensity: 0.015,
    fogNear: 24,
    fogFar: 120,
    cameraFar: 140,
    sunColor: '#94a3b8',
    sunIntensity: 1.1,
    hemiSky: '#64748b',
    hemiGround: '#1e293b',
    playerGripMultiplier: 0.72,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 0.8,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [1.8, 0, 0.9],
  },
  vento: {
    id: 'vento',
    name: 'Maestrale di Quartiere',
    description: 'Raffiche laterali che fanno curvare il pallone di plastica come una foglia',
    skyColor: '#38bdf8',
    fogColor: '#7dd3fc',
    fogDensity: 0.007,
    fogNear: 28,
    fogFar: 135,
    cameraFar: 140,
    sunColor: '#fef08a',
    sunIntensity: 2.0,
    hemiSky: '#7dd3fc',
    hemiGround: '#44403c',
    playerGripMultiplier: 0.95,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 1.0,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [5.5, 0.3, -2.8],
  },
  nebbia: {
    id: 'nebbia',
    name: 'Nebbia fitta',
    description: 'Visibilità ridotta al minimo, massima leggerezza per GPU integrate',
    skyColor: '#cbd5e1',
    fogColor: '#cbd5e1',
    fogDensity: 0.036,
    fogNear: 18,
    fogFar: 44,
    cameraFar: 45,
    sunColor: '#f1f5f9',
    sunIntensity: 1.2,
    hemiSky: '#e2e8f0',
    hemiGround: '#64748b',
    playerGripMultiplier: 0.9,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 0.92,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [0.3, 0, 0.3],
  },
  notte: {
    id: 'notte',
    name: 'Notturna coi Lampioni',
    description: 'Si gioca sotto i lampioni gialli finché non chiamano da casa',
    skyColor: '#0f172a',
    fogColor: '#0f172a',
    fogDensity: 0.014,
    fogNear: 26,
    fogFar: 125,
    cameraFar: 140,
    sunColor: '#fbbf24',
    sunIntensity: 1.4,
    hemiSky: '#1e293b',
    hemiGround: '#090d16',
    playerGripMultiplier: 0.96,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 0.98,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [0.4, 0, -0.3],
  },
  fango: {
    id: 'fango',
    name: 'Cortile Infangato',
    description: 'Terreno marrone pesante post-temporale: rimbalzo -35%, attrito x2 e palla che accumula fango (+40% massa)',
    skyColor: '#78716c',
    fogColor: '#78716c',
    fogDensity: 0.012,
    fogNear: 25,
    fogFar: 120,
    cameraFar: 140,
    sunColor: '#d6d3d1',
    sunIntensity: 1.35,
    hemiSky: '#a8a29e',
    hemiGround: '#451a03',
    playerGripMultiplier: 0.85,
    playerSpeedMultiplier: 0.85,
    playerTurnMultiplier: 0.72,
    ballRestitutionMultiplier: 0.65,
    ballRollFrictionMultiplier: 2.0,
    mudAccumulationRate: 0.025,
    mudMaxMassBonus: 0.4,
    groundTint: '#8c6239',
    ballMudTint: '#6b4423',
    windVector: [0.5, 0, 0.2],
  },
};

export interface PitchConfig {
  id: PitchId;
  name: string;
  subtitle: string;
  groundColor: string;
  lineColor: string;
  goalpostStyle: 'giubbotti' | 'pietre' | 'tubi' | 'ciabatte';
  wallRestitution: number;
  groundFriction: number;
  ballRestitutionMultiplier: number;
  playerSpeedMultiplier: number;
  playerTurnMultiplier: number;
  allowsMudAccumulation: boolean;
  muffledBounceAudio: boolean;
}

export const PITCH_CONFIGS: Record<PitchId, PitchConfig> = {
  cortile: {
    id: 'cortile',
    name: 'Cortile Condominiale',
    subtitle: 'Porte fatte coi giubbotti, muri di sponda, balcone della Signora Maria e finestra fragile',
    groundColor: '#5c5852',
    lineColor: '#e7e5e4',
    goalpostStyle: 'giubbotti',
    wallRestitution: 0.82,
    groundFriction: 1.0,
    ballRestitutionMultiplier: 1.0,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
  strada: {
    id: 'strada',
    name: 'Strada di Periferia',
    subtitle: 'Asfalto veloce, porte con due pietre, tombino e auto parcheggiata con allarme',
    groundColor: '#3f3f46',
    lineColor: '#fde047',
    goalpostStyle: 'pietre',
    wallRestitution: 0.88,
    groundFriction: 0.85,
    ballRestitutionMultiplier: 1.0,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
  terra: {
    id: 'terra',
    name: 'Campetto polveroso',
    subtitle: 'Terra battuta che frena la palla, pali arrugginiti che suonano',
    groundColor: '#9a6b44',
    lineColor: '#f5f5f4',
    goalpostStyle: 'tubi',
    wallRestitution: 0.65,
    groundFriction: 1.35,
    ballRestitutionMultiplier: 1.0,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
  spiaggia: {
    id: 'spiaggia',
    name: 'Spiaggia Libera',
    subtitle: 'Sabbia calda che frena la palla (attrito x3, rimbalzo -50%), porte con secchielli e ciabatte, mare sullo sfondo',
    groundColor: '#e6c280',
    lineColor: '#fef9c3',
    goalpostStyle: 'ciabatte',
    wallRestitution: 0.55,
    groundFriction: 3.0,
    ballRestitutionMultiplier: 0.5,
    playerSpeedMultiplier: 0.9,
    playerTurnMultiplier: 0.85,
    allowsMudAccumulation: false,
    muffledBounceAudio: true,
  },
};

export interface StreetRuleConfig {
  id: StreetRuleId;
  name: string;
  description: string;
}

export const STREET_RULES: Record<StreetRuleId, StreetRuleConfig> = {
  classica: {
    id: 'classica',
    name: 'Regola del Cortile (Tempo)',
    description: 'Partita a tempo: chi segna più punti (gol + eventuali bonus attivi) vince.',
  },
  chi_segna_vince: {
    id: 'chi_segna_vince',
    name: 'Chi Segna Vince (Ultimo Gol)',
    description: 'Morte improvvisa: il primo che insacca tra le porte chiude la sfida!',
  },
  tre_pali: {
    id: 'tre_pali',
    name: '3 Pali = 1 Gol',
    description: 'Colpire i giubbotti, i secchielli o i pali conta: ogni 3 pali scatta automaticamente 1 Gol!',
  },
  palla_avvelenata: {
    id: 'palla_avvelenata',
    name: 'Tiri al Volo & Sponda Doppia',
    description: 'Gol dopo rimbalzo sul muro/bordo ("sponda") vale DOPPIO (2 Gol)!',
  },
};

export interface ActiveGagNotification {
  id: GagId;
  title: string;
  subtitle: string;
  timestamp: number;
}

export interface GagConfig {
  id: GagId;
  label: string;
  title: string;
  subtitle: string;
  allowedPitches: PitchId[]; // Elenco dei campi in cui la gag può scattare ed essere mostrata nel dock
  probability: number; // Seeded probability in [0, 1] when hitting target
  triggeredSteps: number; // Duration of 'Triggered' phase in fixed steps (60 steps = 1s)
  beatSteps: number; // Duration of 'Beat' phase in fixed steps
  resolveSteps: number; // Duration of 'Resolve' phase in fixed steps
  cooldownSteps: number; // Cooldown in fixed steps (20-40 simulated seconds = 1200-2400 steps)
}

export const GAG_CONFIGS: Record<GagId, GagConfig> = {
  vecchia_buca: {
    id: 'vecchia_buca',
    label: 'Vecchia Buca Palla',
    title: 'LA VECCHIA HA BUCATO IL PALLONE!',
    subtitle: 'Signora Maria: "Mo\' ve lo taglio co\' le forbici!" — Pallone bucato per 20s!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.75,
    triggeredSteps: 6,
    beatSteps: 1200, // 20s simulated with punctured ball
    resolveSteps: 6,
    cooldownSteps: 2100, // 35s simulated cooldown
  },
  finestra_rotta: {
    id: 'finestra_rotta',
    label: 'Rompi Finestra',
    title: 'FINESTRA DEL CONDOMINIO ROTTA!',
    subtitle: 'Vetro in frantumi! "Chi è stato?!" — Scappa prima che scenda il condomino!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.7,
    triggeredSteps: 6,
    beatSteps: 720, // 12s simulated before window glass is repaired
    resolveSteps: 6,
    cooldownSteps: 1800, // 30s simulated cooldown
  },
  palla_tetto: {
    id: 'palla_tetto',
    label: 'Palla sul Tetto',
    title: 'PALLONE FINITO SUL TETTO!',
    subtitle: 'È rimasto incastrato tra le tegole... Lanciano il pallone di plastica di riserva!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.8,
    triggeredSteps: 6,
    beatSteps: 156, // 2.6s simulated stuck on the roof
    resolveSteps: 6,
    cooldownSteps: 1500, // 25s simulated cooldown
  },
  allarme_auto: {
    id: 'allarme_auto',
    label: 'Allarme Auto',
    title: 'ALLARME DELL’AUTO PARCHEGGIATA!',
    subtitle: 'BEEP! BEEP! BEEP! Rimbalzo elettrico sul cofano!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.7,
    triggeredSteps: 6,
    beatSteps: 360, // 6.0s simulated flashing lights
    resolveSteps: 6,
    cooldownSteps: 1320, // 22s simulated cooldown
  },
  tombino_fogna: {
    id: 'tombino_fogna',
    label: 'Palla nel Tombino',
    title: 'PALLA NEL TOMBINO!',
    subtitle: 'PLOP! Sparita nella griglia... Entra in campo il pallone di plastica di scorta!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 1.0, // 100% probability for storm drain
    triggeredSteps: 6,
    beatSteps: 12,
    resolveSteps: 6,
    cooldownSteps: 1680, // 28s simulated cooldown
  },
  cane_palla: {
    id: 'cane_palla',
    label: 'Cane Ruba Palla',
    title: 'IL CANE HA RUBATO IL PALLONE!',
    subtitle: 'BAU! BAU! L’ha preso in bocca ed è scappato a bordo campo per qualche secondo!',
    allowedPitches: ['cortile', 'strada', 'terra', 'spiaggia'],
    probability: 0.75,
    triggeredSteps: 6,
    beatSteps: 120, // 2.0s simulated: dog runs to ball, grabs it, runs back to sideline
    resolveSteps: 360, // 6.0s simulated (within 5-8s): ball occupied off-field, then returned to center
    cooldownSteps: 1920, // 32s simulated cooldown
  },
  gabbiano_palla: {
    id: 'gabbiano_palla',
    label: 'Gabbiano Ruba Palla',
    title: 'IL GABBIANO HA PORTATO VIA LA PALLA!',
    subtitle: 'KREE! È sceso in picchiata sulla spiaggia... Un’onda riporta il pallone a riva!',
    allowedPitches: ['spiaggia'],
    probability: 0.75,
    triggeredSteps: 6,
    beatSteps: 120, // 2.0s simulated: seagull swoops down, grabs ball, flies toward the sea
    resolveSteps: 240, // 4.0s simulated off-field before wave returns the ball to center
    cooldownSteps: 1800, // 30s simulated cooldown
  },
};

export interface PlayerInputState {
  moveX: number; // -1 to 1
  moveZ: number; // -1 to 1
  lookDeltaX: number;
  lookDeltaY: number;
  sprint: boolean;
  shootHeld: boolean;
  shootJustReleased: boolean;
  shootCharge: number; // 0 to 1
  passJustPressed: boolean;
  lobJustPressed: boolean;
  tackleJustPressed: boolean;
  cameraToggleJustPressed: boolean;
  ballCycleJustPressed: boolean;
}
