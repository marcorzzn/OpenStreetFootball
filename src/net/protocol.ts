import { GagSystemState } from '../game/gags';
import {
  ActiveGagNotification,
  BallProfileId,
  BotDifficulty,
  PitchId,
  PlayerCategoryId,
  PlayerInputState,
  StreetRuleId,
  TeamSize,
  TimeOfDayId,
  WeatherId,
} from '../types/game';

export interface MatchStartPayload {
  seed: number;
  pitch: PitchId;
  weather: WeatherId;
  timeOfDay?: TimeOfDayId;
  teamSize?: TeamSize;
  botDifficulty?: BotDifficulty;
  playerCategory?: PlayerCategoryId;
  streetRule: StreetRuleId;
  ruleTunnelEnabled: boolean;
  ruleCappelloEnabled: boolean;
  ballProfile: BallProfileId;
  gagsEnabled?: boolean;
}

export interface WorldSnapshotPlayer {
  x: number;
  y?: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  kickAnimTimer: number;
  slideTimer: number;
}

export interface WorldSnapshotPayload {
  simSteps: number;
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rotX: number;
    rotZ: number;
    currentRadius?: number;
    mudBonusMass: number;
    hiddenByGag: boolean;
  };
  players: WorldSnapshotPlayer[];
  scoreBlue: number;
  scoreRed: number;
  paliBlue: number;
  paliRed: number;
  stylePointsBlue: number;
  stylePointsRed: number;
  timeRemaining: number;
  ballProfile: BallProfileId;
}

export type ReliableGameEventPayload =
  | {
      kind: 'weather_change';
      weather: WeatherId;
    }
  | {
      kind: 'pitch_change';
      pitch: PitchId;
    }
  | {
      kind: 'ball_profile_change';
      ballProfile: BallProfileId;
    }
  | {
      kind: 'rules_change';
      streetRule: StreetRuleId;
      ruleTunnelEnabled: boolean;
      ruleCappelloEnabled: boolean;
      gagsEnabled?: boolean;
    }
  | {
      kind: 'goal';
      scoredByTeam: 'blue' | 'red';
      scoreBlue: number;
      scoreRed: number;
      paliBlue: number;
      paliRed: number;
      bonusPoints: number;
      simSteps: number;
    }
  | {
      kind: 'trick_score';
      label: 'TUNNEL +1' | 'CAPPELLO +1';
      team: 'blue' | 'red';
      scoreBlue: number;
      scoreRed: number;
      stylePointsBlue: number;
      stylePointsRed: number;
      simSteps?: number;
    }
  | {
      kind: 'gag_state';
      gagState: GagSystemState;
      simSteps: number;
      activeGagBanner?: ActiveGagNotification | null;
      banner?: { title: string; subtitle: string } | null;
    }
  | {
      kind: 'full_sync';
      isPlaying: boolean;
      matchStart: MatchStartPayload;
      snapshot: WorldSnapshotPayload;
      gagState: GagSystemState;
      activeGagBanner?: ActiveGagNotification | null;
    };

export interface ClientInputPacket {
  type: 'client_input';
  playerId?: string;
  input: PlayerInputState;
}
