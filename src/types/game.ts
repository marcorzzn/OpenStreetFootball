export type BallProfileId = 'supersantos' | 'classico' | 'bagnato' | 'bucato';

export type WeatherId =
  | 'tramonto'
  | 'sole'
  | 'pioggia'
  | 'vento'
  | 'nebbia'
  | 'notte'
  | 'fango'
  | 'neve';

export type TimeOfDayId = 'giorno' | 'tramonto' | 'notte';

export type PitchId = 'cortile' | 'strada' | 'gabbia' | 'terra' | 'spiaggia' | 'stadio';

export type StreetRuleId = 'classica' | 'chi_segna_vince' | 'tre_pali' | 'palla_avvelenata';

export type CameraMode = 'classic' | 'fps';

export type GameMode = 'single' | 'local_2p' | 'online_lan';

export type PlayerCategoryId = 'attacker' | 'midfielder' | 'defender' | 'goalkeeper';

export type TeamSize = 1 | 2 | 3 | 5 | 7 | 11;

export const TEAM_SIZE_OPTIONS: TeamSize[] = [1, 2, 3, 5, 7, 11];

export type BotDifficulty = 'facile' | 'normale' | 'difficile' | 'leggenda';

export type VoiceShoutId = 'passala' | 'tiro_io' | 'uomo' | 'arbitro';

export type SetPieceKind = 'none' | 'free_kick' | 'penalty';

export type GagId =
  | 'vecchia_buca'
  | 'finestra_rotta'
  | 'palla_tetto'
  | 'allarme_auto'
  | 'tombino_fogna'
  | 'cane_palla'
  | 'gabbiano_palla';

export type GagLifecycleState = 'Idle' | 'Triggered' | 'Beat' | 'Resolve' | 'Cooldown';

export interface PlayerCategoryConfig {
  id: PlayerCategoryId;
  name: string;
  badge: string;
  description: string;
  sprintMultiplier: number;
  baseSpeedMultiplier: number;
  shotPrecision: number; // 1.0 = chirurgico, valori bassi aggiungono dispersione
  shotPowerMultiplier: number;
  slidePrecision: number; // >1.0 = prende la palla facilmente senza fallo; <0.7 = scivolata imprecisa e fallosa
  dribbleSecurity: number;
  canUseHandsInBox: boolean;
}

export const PLAYER_CATEGORIES: Record<PlayerCategoryId, PlayerCategoryConfig> = {
  attacker: {
    id: 'attacker',
    name: 'Attaccante (Bomber)',
    badge: 'ATT',
    description:
      'Più sprint (+18%) e tiri estremamente precisi e potenti dove miri col mouse, ma scivolate molto imprecise e rischiose.',
    sprintMultiplier: 1.18,
    baseSpeedMultiplier: 1.06,
    shotPrecision: 0.98,
    shotPowerMultiplier: 1.14,
    slidePrecision: 0.48,
    dribbleSecurity: 1.15,
    canUseHandsInBox: false,
  },
  midfielder: {
    id: 'midfielder',
    name: 'Centrocampista (Regista)',
    badge: 'CEN',
    description:
      'Tutti i valori e lo sprint equilibrati: ottimo controllo nel dribbling, passaggi filtranti e contrasti regolari.',
    sprintMultiplier: 1.06,
    baseSpeedMultiplier: 1.02,
    shotPrecision: 0.86,
    shotPowerMultiplier: 1.02,
    slidePrecision: 0.85,
    dribbleSecurity: 1.1,
    canUseHandsInBox: false,
  },
  defender: {
    id: 'defender',
    name: 'Difensore (Muro)',
    badge: 'DIF',
    description:
      'Scivolate chirurgiche e precisissime sulla palla col giusto tempismo, corsa normale, ma tiri poco precisi.',
    sprintMultiplier: 1.0,
    baseSpeedMultiplier: 1.0,
    shotPrecision: 0.58,
    shotPowerMultiplier: 0.96,
    slidePrecision: 1.38,
    dribbleSecurity: 0.88,
    canUseHandsInBox: false,
  },
  goalkeeper: {
    id: 'goalkeeper',
    name: 'Portiere (Guanti)',
    badge: 'POR',
    description:
      'Usa i tasti del mouse per parare e tuffarti! Attenzione: se pari con le mani fuori dall’area di rigore è RIGORE per l’avversario!',
    sprintMultiplier: 0.98,
    baseSpeedMultiplier: 0.96,
    shotPrecision: 0.8,
    shotPowerMultiplier: 1.12,
    slidePrecision: 1.05,
    dribbleSecurity: 0.85,
    canUseHandsInBox: true,
  },
};

export interface BotDifficultyConfig {
  id: BotDifficulty;
  name: string;
  speedMultiplier: number;
  reactionRate: number;
  shotAccuracy: number;
  passProbability: number;
  tacklePrecision: number;
}

export const BOT_DIFFICULTIES: Record<BotDifficulty, BotDifficultyConfig> = {
  facile: {
    id: 'facile',
    name: 'Esordienti (Facile)',
    speedMultiplier: 0.82,
    reactionRate: 0.65,
    shotAccuracy: 0.6,
    passProbability: 0.35,
    tacklePrecision: 0.65,
  },
  normale: {
    id: 'normale',
    name: 'Ragazzi del Rione (Normale)',
    speedMultiplier: 0.96,
    reactionRate: 0.9,
    shotAccuracy: 0.82,
    passProbability: 0.55,
    tacklePrecision: 0.85,
  },
  difficile: {
    id: 'difficile',
    name: 'Veterani di Strada (Difficile)',
    speedMultiplier: 1.08,
    reactionRate: 1.15,
    shotAccuracy: 0.94,
    passProbability: 0.72,
    tacklePrecision: 1.05,
  },
  leggenda: {
    id: 'leggenda',
    name: 'Campioni (Leggenda)',
    speedMultiplier: 1.16,
    reactionRate: 1.35,
    shotAccuracy: 0.99,
    passProbability: 0.84,
    tacklePrecision: 1.25,
  },
};

export const VOICE_SHOUTS: Record<
  VoiceShoutId,
  { id: VoiceShoutId; key: string; label: string; bubbleText: string }
> = {
  passala: {
    id: 'passala',
    key: '1',
    label: '1. Passala!',
    bubbleText: 'PASSALA! SONO LIBERO!',
  },
  tiro_io: {
    id: 'tiro_io',
    key: '2',
    label: '2. Tiro Io!',
    bubbleText: 'LASCIA! TIRO IO UNA BOMBA!',
  },
  uomo: {
    id: 'uomo',
    key: '3',
    label: '3. Uomo!',
    bubbleText: 'OCCHIO ALL’UOMO! MARCALO!',
  },
  arbitro: {
    id: 'arbitro',
    key: '4',
    label: '4. Arbitro!',
    bubbleText: 'ARBITROOO! MA ERA FALLO NETTO!',
  },
};

export interface BallProfile {
  id: BallProfileId;
  name: string;
  subtitle: string;
  mass: number; // kg
  radius: number; // m
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
    subtitle: 'Il classico pallone da calcio cucito a mano, equilibrato, realistico e sincero',
    mass: 0.43,
    radius: 0.11,
    visualRadius: 0.44,
    restitution: 0.78,
    linearDrag: 0.015,
    rollFriction: 0.022,
    magnus: 0.45,
    windFactor: 1.0,
    wobble: null,
    deflate: null,
    primaryColor: '#f8fafc',
    secondaryColor: '#0f172a',
  },
  bagnato: {
    id: 'bagnato',
    name: 'Cuoio Bagnato (Piombo)',
    subtitle: 'Inzuppato di pioggia e fango: pesantissimo, rimbalza poco e fa male ai piedi',
    mass: 0.68,
    radius: 0.11,
    visualRadius: 0.44,
    restitution: 0.3,
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
    restitution: 0.14,
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
  sole: {
    id: 'sole',
    name: 'Sole Limpido',
    description: 'Luce nitida da graphic novel, ombre nette e terreno asciutto aderenza 100%',
    skyColor: '#60a5fa',
    fogColor: '#93c5fd',
    fogDensity: 0.003,
    fogNear: 65,
    fogFar: 185,
    cameraFar: 165,
    sunColor: '#fffbeb',
    sunIntensity: 2.5,
    hemiSky: '#e0f2fe',
    hemiGround: '#d6d3d1',
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
  tramonto: {
    id: 'tramonto',
    name: 'Tramonto Dorato',
    description: 'Luce calda radente tra i palazzi e gli spalti, ombre lunghe e cielo arancio/viola',
    skyColor: '#fb923c',
    fogColor: '#fdba74',
    fogDensity: 0.005,
    fogNear: 55,
    fogFar: 170,
    cameraFar: 160,
    sunColor: '#fde047',
    sunIntensity: 2.3,
    hemiSky: '#fed7aa',
    hemiGround: '#44403c',
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
  pioggia: {
    id: 'pioggia',
    name: 'Acquazzone Battente',
    description: 'Terreno scivoloso, schizzi d’acqua nei contrasti e rimbalzo rapido ma basso',
    skyColor: '#475569',
    fogColor: '#64748b',
    fogDensity: 0.012,
    fogNear: 35,
    fogFar: 145,
    cameraFar: 155,
    sunColor: '#cbd5e1',
    sunIntensity: 1.5,
    hemiSky: '#94a3b8',
    hemiGround: '#334155',
    playerGripMultiplier: 0.72,
    playerSpeedMultiplier: 0.96,
    playerTurnMultiplier: 0.88,
    ballRestitutionMultiplier: 0.8,
    ballRollFrictionMultiplier: 0.9,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#e2e8f0',
    ballMudTint: '#ffffff',
    windVector: [1.8, 0, 0.9],
  },
  vento: {
    id: 'vento',
    name: 'Vento di Maestrale',
    description: 'Raffiche tese che curvano i tiri da fuori e i rinvii lunghi del portiere',
    skyColor: '#38bdf8',
    fogColor: '#7dd3fc',
    fogDensity: 0.004,
    fogNear: 55,
    fogFar: 175,
    cameraFar: 165,
    sunColor: '#fef08a',
    sunIntensity: 2.3,
    hemiSky: '#bae6fd',
    hemiGround: '#78716c',
    playerGripMultiplier: 0.95,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 1.0,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#ffffff',
    ballMudTint: '#ffffff',
    windVector: [5.8, 0.3, -2.9],
  },
  nebbia: {
    id: 'nebbia',
    name: 'Nebbia Fitta Padana',
    description: 'Visibilità ridotta a 45m, sagome nette che spuntano all’improvviso e culling GPU',
    skyColor: '#cbd5e1',
    fogColor: '#cbd5e1',
    fogDensity: 0.036,
    fogNear: 18,
    fogFar: 48,
    cameraFar: 52,
    sunColor: '#f8fafc',
    sunIntensity: 1.6,
    hemiSky: '#f1f5f9',
    hemiGround: '#94a3b8',
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
    name: 'Notturna sotto i Riflettori',
    description: 'Cielo blu notte profondo e fasci di luce calda dai lampioni/torri faro',
    skyColor: '#0f172a',
    fogColor: '#1e293b',
    fogDensity: 0.01,
    fogNear: 40,
    fogFar: 155,
    cameraFar: 160,
    sunColor: '#fde047',
    sunIntensity: 1.9,
    hemiSky: '#334155',
    hemiGround: '#0f172a',
    playerGripMultiplier: 0.96,
    playerSpeedMultiplier: 1.0,
    playerTurnMultiplier: 1.0,
    ballRestitutionMultiplier: 0.98,
    ballRollFrictionMultiplier: 1.0,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#e2e8f0',
    ballMudTint: '#ffffff',
    windVector: [0.4, 0, -0.3],
  },
  fango: {
    id: 'fango',
    name: 'Terreno Infangato',
    description: 'Fango pesante post-temporale: rimbalzo -35%, attrito x2 e palla che si appesantisce (+40%)',
    skyColor: '#78716c',
    fogColor: '#a8a29e',
    fogDensity: 0.01,
    fogNear: 35,
    fogFar: 145,
    cameraFar: 155,
    sunColor: '#fef3c7',
    sunIntensity: 1.75,
    hemiSky: '#d6d3d1',
    hemiGround: '#451a03',
    playerGripMultiplier: 0.85,
    playerSpeedMultiplier: 0.85,
    playerTurnMultiplier: 0.72,
    ballRestitutionMultiplier: 0.65,
    ballRollFrictionMultiplier: 2.0,
    mudAccumulationRate: 0.025,
    mudMaxMassBonus: 0.4,
    groundTint: '#9a6b44',
    ballMudTint: '#5c3a1e',
    windVector: [0.5, 0, 0.2],
  },
  neve: {
    id: 'neve',
    name: 'Nevicata Invernale',
    description: 'Fiocchi bianchi, terreno scivoloso e rimbalzo attutito dal manto freddo',
    skyColor: '#bae6fd',
    fogColor: '#e0f2fe',
    fogDensity: 0.01,
    fogNear: 38,
    fogFar: 150,
    cameraFar: 160,
    sunColor: '#ffffff',
    sunIntensity: 2.2,
    hemiSky: '#f0f9ff',
    hemiGround: '#94a3b8',
    playerGripMultiplier: 0.68,
    playerSpeedMultiplier: 0.92,
    playerTurnMultiplier: 0.8,
    ballRestitutionMultiplier: 0.72,
    ballRollFrictionMultiplier: 1.45,
    mudAccumulationRate: 0,
    mudMaxMassBonus: 0,
    groundTint: '#f1f5f9',
    ballMudTint: '#ffffff',
    windVector: [1.2, -0.2, 0.6],
  },
};

export interface PitchConfig {
  id: PitchId;
  name: string;
  subtitle: string;
  dimensionsLabel: string;
  baseLength: number; // X length in meters
  baseWidth: number; // Z width in meters
  penaltyBoxDepth: number;
  penaltyBoxHalfWidth: number;
  goalWidth: number;
  goalHeight: number;
  groundColor: string;
  lineColor: string;
  goalpostStyle: 'giubbotti' | 'pietre' | 'tubi' | 'ciabatte' | 'regolamentari';
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
    subtitle: 'Cemento tra i palazzi realistici, balcone della Signora Maria, porte coi giubbotti e finestra fragile',
    dimensionsLabel: '32m × 20m (Cortile)',
    baseLength: 32,
    baseWidth: 20,
    penaltyBoxDepth: 5.5,
    penaltyBoxHalfWidth: 4.5,
    goalWidth: 5.4,
    goalHeight: 2.4,
    groundColor: '#9ca3af',
    lineColor: '#f8fafc',
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
    name: 'Piazzale Asfalto Urbano',
    subtitle: 'Asfalto veloce con strisce, stazione di servizio, auto parcheggiata e porte con fusti/pietre',
    dimensionsLabel: '38m × 24m (Strada)',
    baseLength: 38,
    baseWidth: 24,
    penaltyBoxDepth: 6.5,
    penaltyBoxHalfWidth: 5.2,
    goalWidth: 5.6,
    goalHeight: 2.4,
    groundColor: '#64748b',
    lineColor: '#fde047',
    goalpostStyle: 'pietre',
    wallRestitution: 0.88,
    groundFriction: 0.85,
    ballRestitutionMultiplier: 1.05,
    playerSpeedMultiplier: 1.04,
    playerTurnMultiplier: 1.0,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
  gabbia: {
    id: 'gabbia',
    name: 'La Gabbia (Street Arena)',
    subtitle: 'Arena corta e stretta (28m × 18m) chiusa da griglie metalliche con rimbalzo di sponda altissimo!',
    dimensionsLabel: '28m × 18m (Gabbia)',
    baseLength: 28,
    baseWidth: 18,
    penaltyBoxDepth: 4.8,
    penaltyBoxHalfWidth: 4.0,
    goalWidth: 5.0,
    goalHeight: 2.35,
    groundColor: '#475569',
    lineColor: '#38bdf8',
    goalpostStyle: 'tubi',
    wallRestitution: 0.96,
    groundFriction: 0.9,
    ballRestitutionMultiplier: 1.08,
    playerSpeedMultiplier: 1.02,
    playerTurnMultiplier: 1.05,
    allowsMudAccumulation: false,
    muffledBounceAudio: false,
  },
  terra: {
    id: 'terra',
    name: 'Campo Parrocchiale in Terra',
    subtitle: 'Campo medio-grande in terra battuta (44m × 28m) con pali in ferro che suonano, ideale per 5v5 e 7v7',
    dimensionsLabel: '44m × 28m (Terra)',
    baseLength: 44,
    baseWidth: 28,
    penaltyBoxDepth: 8.0,
    penaltyBoxHalfWidth: 6.5,
    goalWidth: 6.0,
    goalHeight: 2.45,
    groundColor: '#c28e5c',
    lineColor: '#ffffff',
    goalpostStyle: 'tubi',
    wallRestitution: 0.65,
    groundFriction: 1.35,
    ballRestitutionMultiplier: 0.92,
    playerSpeedMultiplier: 0.97,
    playerTurnMultiplier: 0.95,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
  spiaggia: {
    id: 'spiaggia',
    name: 'Spiaggia del Lido',
    subtitle: 'Arena sulla sabbia (36m × 22m, attrito x3, rimbalzo -50%) con mare, cabine, ombrelloni e ciabatte',
    dimensionsLabel: '36m × 22m (Sabbia)',
    baseLength: 36,
    baseWidth: 22,
    penaltyBoxDepth: 6.0,
    penaltyBoxHalfWidth: 5.0,
    goalWidth: 5.4,
    goalHeight: 2.4,
    groundColor: '#f3d79b',
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
  stadio: {
    id: 'stadio',
    name: 'Stadio Comunale (Erba 11v11)',
    subtitle: 'Grande campo regolamentare in erba a fasce (58m × 38m) con tribune, panchine, torri faro e reti vere!',
    dimensionsLabel: '58m × 38m (Stadio)',
    baseLength: 58,
    baseWidth: 38,
    penaltyBoxDepth: 10.5,
    penaltyBoxHalfWidth: 8.5,
    goalWidth: 6.8,
    goalHeight: 2.55,
    groundColor: '#22c55e',
    lineColor: '#ffffff',
    goalpostStyle: 'regolamentari',
    wallRestitution: 0.72,
    groundFriction: 0.95,
    ballRestitutionMultiplier: 1.0,
    playerSpeedMultiplier: 1.05,
    playerTurnMultiplier: 1.02,
    allowsMudAccumulation: true,
    muffledBounceAudio: false,
  },
};

/**
 * Computes effective pitch dimensions so larger team sizes (7v7, 11v11) always have realistic breathing room.
 */
export function getEffectivePitchDimensions(pitchId: PitchId, teamSize: TeamSize) {
  const cfg = PITCH_CONFIGS[pitchId];
  const scale = teamSize >= 11 ? Math.max(1, 56 / cfg.baseLength) : teamSize >= 7 ? Math.max(1, 44 / cfg.baseLength) : 1;
  const length = Math.round(cfg.baseLength * scale);
  const width = Math.round(cfg.baseWidth * scale);
  const halfX = length / 2;
  const halfZ = width / 2;
  const boxDepth = cfg.penaltyBoxDepth * scale;
  const boxHalfW = cfg.penaltyBoxHalfWidth * scale;
  const goalHalfW = cfg.goalWidth / 2;
  return {
    length,
    width,
    halfX,
    halfZ,
    boxDepth,
    boxHalfW,
    goalHalfW,
    goalHeight: cfg.goalHeight,
  };
}

export interface StreetRuleConfig {
  id: StreetRuleId;
  name: string;
  description: string;
}

export const STREET_RULES: Record<StreetRuleId, StreetRuleConfig> = {
  classica: {
    id: 'classica',
    name: 'Regolamento Completo (Falli, Punizioni & Rigori)',
    description: 'Partita completa con falli sulle scivolate scorrette, punizioni con barriera e calci di rigore!',
  },
  chi_segna_vince: {
    id: 'chi_segna_vince',
    name: 'Chi Segna Vince (Golden Goal)',
    description: 'Morte improvvisa: il primo che insacca chiude immediatamente la sfida!',
  },
  tre_pali: {
    id: 'tre_pali',
    name: '3 Pali = 1 Gol',
    description: 'Colpire i pali, i giubbotti o la traversa conta: ogni 3 legni scatta 1 Gol automatico!',
  },
  palla_avvelenata: {
    id: 'palla_avvelenata',
    name: 'Sponda Vale Doppio',
    description: 'Ogni gol segnato dopo un rimbalzo di sponda sul muro o bordo vale DOPPIO (2 Gol)!',
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
  allowedPitches: PitchId[];
  probability: number;
  triggeredSteps: number;
  beatSteps: number;
  resolveSteps: number;
  cooldownSteps: number;
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
    beatSteps: 1200,
    resolveSteps: 6,
    cooldownSteps: 2100,
  },
  finestra_rotta: {
    id: 'finestra_rotta',
    label: 'Rompi Finestra',
    title: 'FINESTRA DEL CONDOMINIO ROTTA!',
    subtitle: 'Vetro in frantumi! "Chi è stato?!" — Scappa prima che scenda il condomino!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.7,
    triggeredSteps: 6,
    beatSteps: 720,
    resolveSteps: 6,
    cooldownSteps: 1800,
  },
  palla_tetto: {
    id: 'palla_tetto',
    label: 'Palla sul Tetto',
    title: 'PALLONE FINITO SUL TETTO!',
    subtitle: 'È rimasto incastrato tra le tegole... Lanciano il pallone di plastica di riserva!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.8,
    triggeredSteps: 6,
    beatSteps: 156,
    resolveSteps: 6,
    cooldownSteps: 1500,
  },
  allarme_auto: {
    id: 'allarme_auto',
    label: 'Allarme Auto',
    title: 'ALLARME DELL’AUTO PARCHEGGIATA!',
    subtitle: 'BEEP! BEEP! BEEP! Rimbalzo elettrico sul cofano!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 0.7,
    triggeredSteps: 6,
    beatSteps: 360,
    resolveSteps: 6,
    cooldownSteps: 1320,
  },
  tombino_fogna: {
    id: 'tombino_fogna',
    label: 'Palla nel Tombino',
    title: 'PALLA NEL TOMBINO!',
    subtitle: 'PLOP! Sparita nella griglia... Entra in campo il pallone di plastica di scorta!',
    allowedPitches: ['cortile', 'strada', 'terra'],
    probability: 1.0,
    triggeredSteps: 6,
    beatSteps: 12,
    resolveSteps: 6,
    cooldownSteps: 1680,
  },
  cane_palla: {
    id: 'cane_palla',
    label: 'Cane Ruba Palla',
    title: 'IL CANE HA RUBATO IL PALLONE!',
    subtitle: 'BAU! BAU! L’ha preso in bocca ed è scappato a bordo campo per qualche secondo!',
    allowedPitches: ['cortile', 'strada', 'gabbia', 'terra', 'spiaggia', 'stadio'],
    probability: 0.75,
    triggeredSteps: 6,
    beatSteps: 120,
    resolveSteps: 360,
    cooldownSteps: 1920,
  },
  gabbiano_palla: {
    id: 'gabbiano_palla',
    label: 'Gabbiano Ruba Palla',
    title: 'IL GABBIANO HA PORTATO VIA LA PALLA!',
    subtitle: 'KREE! È sceso in picchiata sulla spiaggia... Un’onda riporta il pallone a riva!',
    allowedPitches: ['spiaggia'],
    probability: 0.75,
    triggeredSteps: 6,
    beatSteps: 120,
    resolveSteps: 240,
    cooldownSteps: 1800,
  },
};

export interface PlayerInputState {
  moveX: number; // -1 to 1 (A/D)
  moveZ: number; // -1 to 1 (W/S)
  lookDeltaX: number;
  lookDeltaY: number;
  mouseAimYaw: number; // World/screen aim angle from mouse cursor
  mouseAimPitch: number; // -1 (low ground shot) to +1 (high lob/top corner) from mouse cursor Y
  hasMouseAim: boolean;
  sprint: boolean; // Shift
  jumpJustPressed: boolean; // Space = Jump!
  // Left Mouse Button (LMB) / Primary Action:
  // - With ball: single click = pass/quick kick; hold & release = charged shot/pass aimed by mouse
  // - Without ball: single click = call teammate marking; hold = GK automatic rush toward ball carrier
  shootHeld: boolean;
  shootJustReleased: boolean;
  shootCharge: number; // 0 to 1
  leftClickSingle: boolean;
  // Right Mouse Button (RMB) / Secondary Action:
  // - With ball: single click = body feint; hold = continuous tight dribbling (increases exposure risk!)
  // - Without ball: single click = clean timed slide tackle; hold & release = violent long slide tackle!
  rightClickSingle: boolean;
  rightClickHeld: boolean;
  rightClickJustReleased: boolean;
  rightHoldCharge: number; // 0 to 1
  passJustPressed: boolean;
  lobJustPressed: boolean;
  tackleJustPressed: boolean;
  cameraToggleJustPressed: boolean;
  ballCycleJustPressed: boolean;
  shoutJustPressed: VoiceShoutId | null;
}
