import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import {
  applyClientGagVisualStep,
  createInitialGagSystemState,
  GagActionRegistry,
  GagStateItem,
  GagSystemState,
  stepGagStateMachine,
  tryTriggerGag,
} from '../game/gags';
import { InputManager } from '../game/inputManager';
import {
  addComicOutline,
  buildCourtyardEnvironment,
  createBallTexture,
  createComicStarburstMesh,
  createStreetPlayerModel,
  createToonMaterial,
  detectSoftwareWebGL,
  PlayerRig,
} from '../game/proceduralModels';
import { SeededRNG } from '../game/rng';
import {
  MatchStartPayload,
  ReliableGameEventPayload,
  WorldSnapshotPayload,
} from '../net/protocol';
import {
  ActiveGagNotification,
  BALL_PROFILES,
  BallProfileId,
  BOT_DIFFICULTIES,
  BotDifficulty,
  CameraMode,
  GAG_CONFIGS,
  GagId,
  GameMode,
  getEffectivePitchDimensions,
  PITCH_CONFIGS,
  PitchId,
  PLAYER_CATEGORIES,
  PlayerCategoryId,
  PlayerInputState,
  StreetRuleId,
  TeamSize,
  TimeOfDayId,
  VOICE_SHOUTS,
  VoiceShoutId,
  WEATHER_CONFIGS,
  WeatherId,
} from '../types/game';

// Costante passo fisso (60 step fisici al secondo) definita in un unico punto
export const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const RENDER_SCALE_LEVELS = [0.5, 0.75, 1.0] as const;
const SNAPSHOT_INTERP_DELAY_MS = 100;

interface SimPlayer {
  id: string;
  team: 'blue' | 'red';
  number: number;
  role: PlayerCategoryId;
  isGoalkeeper: boolean;
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  prevYaw: number;
  pitchLook: number;
  homeX: number;
  homeZ: number;
  stamina: number;
  kickAnimTimer: number;
  slideTimer: number;
  slideViolent: boolean;
  slideTouchedBall: boolean;
  slideHasFouled: boolean;
  feintTimer: number;
  dribbleExposure: number;
  rig: PlayerRig;
}

interface GlassShard {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface RemoteSyncStateUpdate {
  seed?: number;
  weather?: WeatherId;
  pitch?: PitchId;
  ballProfile?: BallProfileId;
  streetRule?: StreetRuleId;
  ruleTunnelEnabled?: boolean;
  ruleCappelloEnabled?: boolean;
  isPlaying?: boolean;
}

export interface HudTelemetry {
  scoreBlue: number;
  scoreRed: number;
  paliBlue: number;
  paliRed: number;
  stylePointsBlue: number;
  stylePointsRed: number;
  timeRemaining: number;
  ballProfile: BallProfileId;
  ballSpeedKmh: number;
  shootCharge: number;
  rightHoldCharge: number;
  dribbleExposure: number;
  hasBall: boolean;
  markingCallActive: boolean;
  gkRushActive: boolean;
  setPieceState: string | null;
  activeShout: { text: string; team: 'blue' | 'red' } | null;
  cameraMode: CameraMode;
  connectedGamepads: string[];
  activeGag: ActiveGagNotification | null;
  lastBanner: { title: string; subtitle: string } | null;
  pointerLocked: boolean;
  fps: number;
  autoScaleFpsAvg: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  isSoftwareGl: boolean;
  physicsStepsLastFrame: number;
  cameraFar: number;
  activeGagStateLabel: string;
  trickPopup: { label: 'TUNNEL +1' | 'CAPPELLO +1'; team: 'blue' | 'red' } | null;
  snapshotsPerSec: number;
}

interface StreetPitchCanvasProps {
  isPlaying: boolean;
  isPaused: boolean;
  gameMode: GameMode;
  cameraMode: CameraMode;
  onCameraModeChange: (mode: CameraMode) => void;
  ballProfile: BallProfileId;
  onBallProfileChange: (profile: BallProfileId) => void;
  weather: WeatherId;
  timeOfDay: TimeOfDayId;
  pitch: PitchId;
  teamSize: TeamSize;
  botDifficulty: BotDifficulty;
  playerCategory: PlayerCategoryId;
  streetRule: StreetRuleId;
  ruleTunnelEnabled: boolean;
  ruleCappelloEnabled: boolean;
  renderScale: number;
  autoRenderScale: boolean;
  onRenderScaleChange: (scale: number) => void;
  showPerfMonitor: boolean;
  gagsEnabled: boolean;
  triggerGagRequest: { gag: GagId; seq: number } | null;
  triggerShoutRequest: { shout: VoiceShoutId; seq: number } | null;
  resetMatchSeq: number;
  matchSeed: number;
  inputManagerRef: React.MutableRefObject<InputManager | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  isOnlineHost: boolean;
  onlineRoomCode: string | null;
  onRemoteSyncState: (sync: RemoteSyncStateUpdate) => void;
  onTelemetryUpdate: (telemetry: HudTelemetry) => void;
}

// Pre-allocated math objects to guarantee zero GC inside the loop
const _vec3A = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();
const _colorWhite = new THREE.Color(0xffffff);
const _colorMudTarget = new THREE.Color(0x6b4423);

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function isInsideOwnPenaltyBox(
  x: number,
  z: number,
  team: 'blue' | 'red',
  dims: { halfX: number; halfZ: number; boxDepth: number; boxHalfW: number },
): boolean {
  if (Math.abs(z) > dims.boxHalfW) return false;
  if (team === 'blue') {
    return x <= -dims.halfX + dims.boxDepth;
  }
  return x >= dims.halfX - dims.boxDepth;
}

export const StreetPitchCanvas: React.FC<StreetPitchCanvasProps> = ({
  isPlaying,
  isPaused,
  gameMode,
  cameraMode,
  onCameraModeChange,
  ballProfile,
  onBallProfileChange,
  weather,
  timeOfDay,
  pitch,
  teamSize,
  botDifficulty,
  playerCategory,
  streetRule,
  ruleTunnelEnabled,
  ruleCappelloEnabled,
  renderScale,
  autoRenderScale,
  onRenderScaleChange,
  showPerfMonitor,
  gagsEnabled,
  triggerGagRequest,
  triggerShoutRequest,
  resetMatchSeq,
  matchSeed,
  inputManagerRef,
  wsRef,
  isOnlineHost,
  onlineRoomCode,
  onRemoteSyncState,
  onTelemetryUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    isPlaying,
    isPaused,
    gameMode,
    cameraMode,
    ballProfile,
    weather,
    timeOfDay,
    pitch,
    teamSize,
    botDifficulty,
    playerCategory,
    streetRule,
    ruleTunnelEnabled,
    ruleCappelloEnabled,
    renderScale,
    autoRenderScale,
    showPerfMonitor,
    gagsEnabled,
    matchSeed,
    isOnlineHost,
    onlineRoomCode,
  });

  useEffect(() => {
    stateRef.current = {
      isPlaying,
      isPaused,
      gameMode,
      cameraMode,
      ballProfile,
      weather,
      timeOfDay,
      pitch,
      teamSize,
      botDifficulty,
      playerCategory,
      streetRule,
      ruleTunnelEnabled,
      ruleCappelloEnabled,
      renderScale,
      autoRenderScale,
      showPerfMonitor,
      gagsEnabled,
      matchSeed,
      isOnlineHost,
      onlineRoomCode,
    };
  }, [
    isPlaying,
    isPaused,
    gameMode,
    cameraMode,
    ballProfile,
    weather,
    timeOfDay,
    pitch,
    teamSize,
    botDifficulty,
    playerCategory,
    streetRule,
    ruleTunnelEnabled,
    ruleCappelloEnabled,
    renderScale,
    autoRenderScale,
    showPerfMonitor,
    gagsEnabled,
    matchSeed,
    isOnlineHost,
    onlineRoomCode,
  ]);

  const callbacksRef = useRef({
    onCameraModeChange,
    onBallProfileChange,
    onRenderScaleChange,
    onRemoteSyncState,
    onTelemetryUpdate,
  });
  useEffect(() => {
    callbacksRef.current = {
      onCameraModeChange,
      onBallProfileChange,
      onRenderScaleChange,
      onRemoteSyncState,
      onTelemetryUpdate,
    };
  }, [onCameraModeChange, onBallProfileChange, onRenderScaleChange, onRemoteSyncState, onTelemetryUpdate]);

  const manualGagTriggerRef = useRef<{ gag: GagId; seq: number } | null>(null);
  useEffect(() => {
    if (triggerGagRequest) {
      manualGagTriggerRef.current = triggerGagRequest;
    }
  }, [triggerGagRequest]);

  const manualShoutTriggerRef = useRef<{ shout: VoiceShoutId; seq: number } | null>(null);
  useEffect(() => {
    if (triggerShoutRequest) {
      manualShoutTriggerRef.current = triggerShoutRequest;
    }
  }, [triggerShoutRequest]);

  const resetSeqRef = useRef(resetMatchSeq);
  const seedRef = useRef(matchSeed);
  const shouldResetMatchRef = useRef(false);
  useEffect(() => {
    if (resetMatchSeq !== resetSeqRef.current || matchSeed !== seedRef.current) {
      resetSeqRef.current = resetMatchSeq;
      seedRef.current = matchSeed;
      shouldResetMatchRef.current = true;
    }
  }, [resetMatchSeq, matchSeed]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const baseRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(baseRatio * stateRef.current.renderScale);
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.BasicShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.12,
      160,
    );
    camera.position.set(0, 13, 21);
    camera.lookAt(0, 0.8, 0);
    scene.add(camera);

    // High-Contrast Graphic-Novel Toon Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xfde68a, 1.35);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
    sunLight.position.set(14, 24, 12);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    const d = 32;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-16, 12, -14);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Build Environment scaled to pitch & teamSize
    let currentBuiltPitch: PitchId = stateRef.current.pitch;
    let currentBuiltTeamSize: TeamSize = stateRef.current.teamSize;
    let currentBuiltPlayerCategory: PlayerCategoryId = stateRef.current.playerCategory;
    let envRefs = buildCourtyardEnvironment(currentBuiltPitch, currentBuiltTeamSize, maxAniso);
    scene.add(envRefs.group);

    // Pre-generate textures for the 4 ball profiles
    const ballTextures: Record<BallProfileId, THREE.CanvasTexture> = {
      supersantos: createBallTexture('supersantos', maxAniso),
      classico: createBallTexture('classico', maxAniso),
      bagnato: createBallTexture('bagnato', maxAniso),
      bucato: createBallTexture('bucato', maxAniso),
    };

    const ballMat = createToonMaterial(0xffffff, ballTextures[stateRef.current.ballProfile]);
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), ballMat);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, 0.42, 0);
    addComicOutline(ballMesh, 1.1);
    scene.add(ballMesh);

    // Comic Starburst Impact VFX ("BAM!" yellow star with black outline) + Ink Blobs pool
    const comicStarburst = createComicStarburstMesh();
    scene.add(comicStarburst);
    let starburstTimer = 0;
    let starburstBaseScale = 1.0;

    const inkBlobGeo = new THREE.DodecahedronGeometry(0.16, 0);
    const inkBlobMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const inkBlobs: Array<{
      mesh: THREE.Mesh;
      vx: number;
      vy: number;
      vz: number;
      life: number;
    }> = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(inkBlobGeo, inkBlobMat);
      m.visible = false;
      scene.add(m);
      inkBlobs.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const triggerComicImpact = (ix: number, iy: number, iz: number, scale = 1.0, count = 6) => {
      comicStarburst.position.set(ix, Math.max(0.55, iy), iz);
      comicStarburst.visible = true;
      starburstTimer = 0.24;
      starburstBaseScale = scale;

      let spawned = 0;
      for (const blob of inkBlobs) {
        if (blob.life <= 0 && spawned < count) {
          blob.life = 0.38 + Math.random() * 0.25;
          blob.mesh.visible = true;
          blob.mesh.position.set(ix, Math.max(0.25, iy), iz);
          const s = 0.7 + Math.random() * 1.1;
          blob.mesh.scale.setScalar(s);
          blob.vx = (Math.random() - 0.5) * 9.5;
          blob.vy = 2.5 + Math.random() * 5.5;
          blob.vz = (Math.random() - 0.5) * 9.5;
          spawned++;
        }
      }
    };

    // Hard-edge black ink ball ground shadow
    const ballShadowGeo = new THREE.CircleGeometry(0.44, 14);
    ballShadowGeo.rotateX(-Math.PI / 2);
    const ballShadowMat = new THREE.MeshBasicMaterial({
      color: 0x09090b,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
    ballShadow.position.set(0, 0.02, 0);
    scene.add(ballShadow);

    // Weather Particle System (Rain / Wind / Snow)
    const particleCount = 420;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 56;
      particlePositions[i * 3 + 1] = Math.random() * 16;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 38;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.15,
      transparent: true,
      opacity: 0.7,
    });
    const weatherParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(weatherParticles);

    // Dynamic Players Pool (supports 1v1, 2v2, 3v3, 5v5, 7v7, and 11v11)
    const players: SimPlayer[] = [];
    let activeBlueIdx = 0;
    let activeRedIdx = 1;

    const buildTeamFormation = (
      size: TeamSize,
      userRole: PlayerCategoryId,
      dims: { halfX: number; halfZ: number },
    ) => {
      // Remove previous player meshes from scene
      players.forEach((p) => scene.remove(p.rig.root));
      players.length = 0;

      const makeSideFormation = (
        team: 'blue' | 'red',
      ): Array<{
        id: string;
        team: 'blue' | 'red';
        number: number;
        role: PlayerCategoryId;
        isGoalkeeper: boolean;
        hx: number;
        hz: number;
      }> => {
        const sign = team === 'blue' ? -1 : 1;
        const gkX = sign * (dims.halfX - 1.15);
        const defX = sign * dims.halfX * 0.66;
        const midX = sign * dims.halfX * 0.38;
        const attX = sign * dims.halfX * 0.16;
        const wz = dims.halfZ * 0.64;

        if (size === 1) {
          const isGk = team === 'blue' ? userRole === 'goalkeeper' : false;
          return [
            {
              id: `${team}_1`,
              team,
              number: isGk ? 1 : 10,
              role: team === 'blue' ? userRole : 'attacker',
              isGoalkeeper: isGk,
              hx: isGk ? gkX : sign * 3.8,
              hz: 0,
            },
          ];
        }

        const slots: Array<{
          number: number;
          role: PlayerCategoryId;
          isGoalkeeper: boolean;
          hx: number;
          hz: number;
        }> = [];

        if (size === 2) {
          slots.push(
            { number: 10, role: 'attacker', isGoalkeeper: false, hx: attX, hz: 0 },
            { number: 1, role: 'goalkeeper', isGoalkeeper: true, hx: gkX, hz: 0 },
          );
        } else if (size === 3) {
          slots.push(
            { number: 10, role: 'attacker', isGoalkeeper: false, hx: attX, hz: 0 },
            { number: 4, role: 'defender', isGoalkeeper: false, hx: defX, hz: -wz * 0.35 },
            { number: 1, role: 'goalkeeper', isGoalkeeper: true, hx: gkX, hz: 0 },
          );
        } else if (size === 5) {
          slots.push(
            { number: 10, role: 'attacker', isGoalkeeper: false, hx: attX, hz: -wz * 0.35 },
            { number: 9, role: 'attacker', isGoalkeeper: false, hx: attX, hz: wz * 0.35 },
            { number: 8, role: 'midfielder', isGoalkeeper: false, hx: midX, hz: 0 },
            { number: 4, role: 'defender', isGoalkeeper: false, hx: defX, hz: 0 },
            { number: 1, role: 'goalkeeper', isGoalkeeper: true, hx: gkX, hz: 0 },
          );
        } else if (size === 7) {
          slots.push(
            { number: 10, role: 'attacker', isGoalkeeper: false, hx: attX, hz: -wz * 0.4 },
            { number: 9, role: 'attacker', isGoalkeeper: false, hx: attX, hz: wz * 0.4 },
            { number: 8, role: 'midfielder', isGoalkeeper: false, hx: midX, hz: -wz * 0.55 },
            { number: 7, role: 'midfielder', isGoalkeeper: false, hx: midX, hz: wz * 0.55 },
            { number: 4, role: 'defender', isGoalkeeper: false, hx: defX, hz: -wz * 0.4 },
            { number: 5, role: 'defender', isGoalkeeper: false, hx: defX, hz: wz * 0.4 },
            { number: 1, role: 'goalkeeper', isGoalkeeper: true, hx: gkX, hz: 0 },
          );
        } else {
          // 11 vs 11 Regulation Formation (4-3-3)
          slots.push(
            { number: 9, role: 'attacker', isGoalkeeper: false, hx: attX, hz: 0 },
            { number: 10, role: 'attacker', isGoalkeeper: false, hx: attX * 1.15, hz: -wz * 0.72 },
            { number: 11, role: 'attacker', isGoalkeeper: false, hx: attX * 1.15, hz: wz * 0.72 },
            { number: 8, role: 'midfielder', isGoalkeeper: false, hx: midX, hz: -wz * 0.52 },
            { number: 6, role: 'midfielder', isGoalkeeper: false, hx: midX * 1.15, hz: 0 },
            { number: 7, role: 'midfielder', isGoalkeeper: false, hx: midX, hz: wz * 0.52 },
            { number: 2, role: 'defender', isGoalkeeper: false, hx: defX, hz: -wz * 0.82 },
            { number: 4, role: 'defender', isGoalkeeper: false, hx: defX * 1.05, hz: -wz * 0.28 },
            { number: 5, role: 'defender', isGoalkeeper: false, hx: defX * 1.05, hz: wz * 0.28 },
            { number: 3, role: 'defender', isGoalkeeper: false, hx: defX, hz: wz * 0.82 },
            { number: 1, role: 'goalkeeper', isGoalkeeper: true, hx: gkX, hz: 0 },
          );
        }

        // Ensure Player 0 on Blue team matches the user's chosen PlayerCategoryId
        if (team === 'blue') {
          if (userRole === 'goalkeeper') {
            const gkIdx = slots.findIndex((s) => s.isGoalkeeper);
            if (gkIdx > 0) {
              const tmp = slots[0];
              slots[0] = slots[gkIdx];
              slots[gkIdx] = tmp;
            }
          } else {
            slots[0].role = userRole;
            if (userRole === 'defender') {
              slots[0].hx = defX;
              slots[0].number = 4;
            } else if (userRole === 'midfielder') {
              slots[0].hx = midX;
              slots[0].number = 8;
            } else {
              slots[0].hx = attX;
              slots[0].number = 10;
            }
          }
        }

        return slots.map((s, i) => ({
          id: `${team}_${i + 1}`,
          team,
          ...s,
        }));
      };

      const blueSide = makeSideFormation('blue');
      const redSide = makeSideFormation('red');
      const combined = [...blueSide, ...redSide];

      activeBlueIdx = 0;
      activeRedIdx = blueSide.length;

      combined.forEach((cfg, idx) => {
        const rig = createStreetPlayerModel(cfg.team, cfg.number, idx === activeBlueIdx, cfg.isGoalkeeper);
        rig.root.position.set(cfg.hx, 0, cfg.hz);
        scene.add(rig.root);
        const initYaw = cfg.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
        players.push({
          id: cfg.id,
          team: cfg.team,
          number: cfg.number,
          role: cfg.role,
          isGoalkeeper: cfg.isGoalkeeper,
          x: cfg.hx,
          y: 0,
          z: cfg.hz,
          prevX: cfg.hx,
          prevY: 0,
          prevZ: cfg.hz,
          vx: 0,
          vy: 0,
          vz: 0,
          yaw: initYaw,
          prevYaw: initYaw,
          pitchLook: -0.12,
          homeX: cfg.hx,
          homeZ: cfg.hz,
          stamina: 1.0,
          kickAnimTimer: 0,
          slideTimer: 0,
          slideViolent: false,
          slideTouchedBall: false,
          slideHasFouled: false,
          feintTimer: 0,
          dribbleExposure: 0,
          rig,
        });
      });
    };

    const initDims = getEffectivePitchDimensions(currentBuiltPitch, currentBuiltTeamSize);
    buildTeamFormation(currentBuiltTeamSize, currentBuiltPlayerCategory, initDims);

    // Ball physical & interpolation state
    const ball = {
      x: 0,
      y: 0.42,
      z: 0,
      prevX: 0,
      prevY: 0.42,
      prevZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotZ: 0,
      prevRotX: 0,
      prevRotZ: 0,
      spinY: 0,
      currentRadius: 0.42,
      mudBonusMass: 0,
      lastTouchTeam: 'blue' as 'blue' | 'red',
      lastTouchPlayerId: 'blue_1',
      lastTouchStep: -999,
      lastTouchX: 0,
      lastTouchZ: 0,
      bouncedOffWall: false,
      hiddenByGag: false,
    };

    // Deterministic PRNG and simulation step counter
    const rng = new SeededRNG(stateRef.current.matchSeed);
    let simSteps = 0;

    // Match State, Set-Pieces (Punizione con Barriera / Calcio di Rigore), Tactics & Shouts
    let scoreBlue = 0;
    let scoreRed = 0;
    let paliBlue = 0;
    let paliRed = 0;
    let stylePointsBlue = 0;
    let stylePointsRed = 0;
    let timeRemaining = 180;
    let rainExposureTimer = 0;
    let goalCelebrationTimer = 0;
    let markingCallTimer = 0;
    let gkRushActive = false;
    let activeShout: { text: string; team: 'blue' | 'red' } | null = null;
    let activeShoutTimer = 0;
    let setPieceState: {
      kind: 'free_kick' | 'penalty';
      attackingTeam: 'blue' | 'red';
      spotX: number;
      spotZ: number;
      wallPlayerIds: string[];
      timer: number;
    } | null = null;

    let gagState = createInitialGagSystemState();
    let activeGag: ActiveGagNotification | null = null;
    let activeGagBannerSteps = 0;
    let lastBanner: { title: string; subtitle: string } | null = null;
    let lastBannerTimer = 0;
    let trickPopup: { label: 'TUNNEL +1' | 'CAPPELLO +1'; team: 'blue' | 'red' } | null = null;
    let trickPopupSteps = 0;

    const trickPairCooldown = new Map<string, number>();

    let pendingTunnel: {
      attackerId: string;
      attackerTeam: 'blue' | 'red';
      defenderId: string;
      exitSign: number;
      crossStep: number;
    } | null = null;

    let pendingCappello: {
      attackerId: string;
      attackerTeam: 'blue' | 'red';
      defenderId: string;
      passedStep: number;
      expiresAtStep: number;
    } | null = null;

    const glassShards: GlassShard[] = [];

    let remoteClientInput: PlayerInputState | null = null;
    let latestHostSnapshot: WorldSnapshotPayload | null = null;
    const snapshotBuffer: Array<{ recvTime: number; snap: WorldSnapshotPayload }> = [];
    let clientInputSeq = 0;
    let snapshotsReceivedInWindow = 0;
    let snapshotsWindowTimer = 0;
    let snapshotsPerSec = 0;

    const resetDogRigPose = () => {
      const dog = envRefs.dogRig;
      dog.root.position.set(dog.homeX, 0, dog.homeZ);
      dog.root.rotation.y = Math.PI;
      dog.legs.forEach((leg) => {
        leg.rotation.x = 0;
      });
      dog.tail.rotation.z = 0;
    };

    const resetSeagullRigPose = () => {
      const gull = envRefs.seagullRig;
      gull.root.position.set(gull.homeX, gull.homeY, gull.homeZ);
      gull.root.rotation.set(0, 0, 0);
      gull.leftWing.rotation.z = 0;
      gull.rightWing.rotation.z = 0;
    };

    const resetPositions = (kickoffTeam: 'blue' | 'red' = 'blue') => {
      const startX = kickoffTeam === 'blue' ? -0.5 : 0.5;
      ball.x = startX;
      ball.y = 0.6;
      ball.z = 0;
      ball.prevX = startX;
      ball.prevY = 0.6;
      ball.prevZ = 0;
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      ball.rotX = 0;
      ball.rotZ = 0;
      ball.prevRotX = 0;
      ball.prevRotZ = 0;
      ball.spinY = 0;
      ball.mudBonusMass = 0;
      ball.bouncedOffWall = false;
      ball.hiddenByGag = false;
      pendingTunnel = null;
      pendingCappello = null;
      setPieceState = null;
      markingCallTimer = 0;
      gkRushActive = false;
      resetDogRigPose();
      resetSeagullRigPose();

      players.forEach((p) => {
        const initYaw = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
        p.x = p.homeX;
        p.y = 0;
        p.z = p.homeZ;
        p.prevX = p.homeX;
        p.prevY = 0;
        p.prevZ = p.homeZ;
        p.vx = 0;
        p.vy = 0;
        p.vz = 0;
        p.yaw = initYaw;
        p.prevYaw = initYaw;
        p.slideTimer = 0;
        p.feintTimer = 0;
        p.dribbleExposure = 0;
      });
    };

    /**
     * Sets up either a Free Kick with a Defensive Wall ("Punizione con Barriera")
     * or a Penalty Kick ("Calcio di Rigore") when a foul or GK outside-box handball occurs.
     */
    const setupSetPiece = (
      kind: 'free_kick' | 'penalty',
      attackingTeam: 'blue' | 'red',
      foulX: number,
      foulZ: number,
      reasonTitle: string,
      reasonSub: string,
    ) => {
      const dims = getEffectivePitchDimensions(stateRef.current.pitch, stateRef.current.teamSize);
      soundEngine.playFoulWhistle();
      lastBanner = { title: reasonTitle, subtitle: reasonSub };
      lastBannerTimer = 4.2;

      const targetGoalX = attackingTeam === 'blue' ? dims.halfX : -dims.halfX;
      const spotX =
        kind === 'penalty'
          ? attackingTeam === 'blue'
            ? dims.halfX - dims.boxDepth * 0.72
            : -dims.halfX + dims.boxDepth * 0.72
          : THREE.MathUtils.clamp(foulX, -dims.halfX + 2.5, dims.halfX - 2.5);
      const spotZ =
        kind === 'penalty'
          ? 0
          : THREE.MathUtils.clamp(foulZ, -dims.halfZ + 1.8, dims.halfZ - 1.8);

      ball.x = spotX;
      ball.y = ball.currentRadius;
      ball.z = spotZ;
      ball.prevX = spotX;
      ball.prevY = ball.currentRadius;
      ball.prevZ = spotZ;
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      ball.spinY = 0;

      // Pick kicker from attacking team (prefer human controlled player if on attacking team)
      const attackers = players.filter((pl) => pl.team === attackingTeam && !pl.isGoalkeeper);
      const kicker =
        (attackingTeam === 'blue' ? players[activeBlueIdx] : players.find((pl) => pl.team === 'red')) ||
        attackers[0] ||
        players[0];

      const dirToGoalX = targetGoalX - spotX;
      const dirToGoalZ = 0 - spotZ;
      const lenToGoal = Math.hypot(dirToGoalX, dirToGoalZ) || 1;
      const nx = dirToGoalX / lenToGoal;
      const nz = dirToGoalZ / lenToGoal;

      if (kicker) {
        kicker.x = spotX - nx * 0.85;
        kicker.z = spotZ - nz * 0.85;
        kicker.vx = 0;
        kicker.vz = 0;
        kicker.yaw = Math.atan2(nx, nz);
        if (attackingTeam === 'blue') {
          const kIdx = players.indexOf(kicker);
          if (kIdx >= 0) activeBlueIdx = kIdx;
        }
      }

      // Position defending Goalkeeper on the goal line
      const defTeam = attackingTeam === 'blue' ? 'red' : 'blue';
      const defGk = players.find((pl) => pl.team === defTeam && pl.isGoalkeeper);
      if (defGk) {
        defGk.x = targetGoalX + (attackingTeam === 'blue' ? -0.6 : 0.6);
        defGk.z = 0;
        defGk.vx = 0;
        defGk.vz = 0;
        defGk.yaw = attackingTeam === 'blue' ? -Math.PI / 2 : Math.PI / 2;
      }

      const wallPlayerIds: string[] = [];
      if (kind === 'free_kick') {
        // Build a 2 or 3-man Defensive Wall ("Barriera") 4.6m from the ball toward the goal
        const wallDist = Math.min(4.8, lenToGoal * 0.48);
        const wallCenterX = spotX + nx * wallDist;
        const wallCenterZ = spotZ + nz * wallDist;
        const perpX = -nz;
        const perpZ = nx;

        const wallCandidates = players.filter(
          (pl) => pl.team === defTeam && !pl.isGoalkeeper,
        );
        const wallCount = Math.min(3, Math.max(1, wallCandidates.length));
        for (let w = 0; w < wallCount; w++) {
          const wp = wallCandidates[w];
          const offset = (w - (wallCount - 1) / 2) * 0.68;
          wp.x = wallCenterX + perpX * offset;
          wp.z = wallCenterZ + perpZ * offset;
          wp.vx = 0;
          wp.vz = 0;
          wp.yaw = Math.atan2(-nx, -nz);
          wallPlayerIds.push(wp.id);
        }
      } else {
        // Penalty kick: clear all other players outside the penalty box
        players.forEach((pl) => {
          if (pl === kicker || pl === defGk) return;
          const safeX =
            attackingTeam === 'blue'
              ? dims.halfX - dims.boxDepth - 2.0
              : -dims.halfX + dims.boxDepth + 2.0;
          pl.x = safeX + (pl.team === 'blue' ? -0.8 : 0.8);
          pl.vx = 0;
          pl.vz = 0;
        });
      }

      setPieceState = {
        kind,
        attackingTeam,
        spotX,
        spotZ,
        wallPlayerIds,
        timer: 6.5, // 6.5 seconds to take the free kick or penalty
      };
    };

    const triggerVoiceShout = (shoutId: VoiceShoutId, team: 'blue' | 'red') => {
      const cfg = VOICE_SHOUTS[shoutId];
      if (!cfg) return;
      soundEngine.playVoiceShout(shoutId);
      activeShout = { text: cfg.bubbleText, team };
      activeShoutTimer = 2.4;

      // Tactical effect of shouting:
      if (shoutId === 'passala' && team === 'blue') {
        // If a Blue AI teammate currently has the ball, they immediately pass it to the user!
        const userPlayer = players[activeBlueIdx];
        const ballCarrier = players.find(
          (pl) =>
            pl.team === 'blue' &&
            pl !== userPlayer &&
            Math.hypot(pl.x - ball.x, pl.z - ball.z) < 1.85,
        );
        if (ballCarrier && userPlayer) {
          const dx = userPlayer.x - ball.x;
          const dz = userPlayer.z - ball.z;
          const dLen = Math.hypot(dx, dz) || 1;
          ball.vx = (dx / dLen) * 16.5;
          ball.vz = (dz / dLen) * 16.5;
          ball.vy = 1.4;
          ballCarrier.kickAnimTimer = 0.28;
          soundEngine.playKick(stateRef.current.ballProfile, 0.6);
        }
      } else if (shoutId === 'uomo' && team === 'blue') {
        markingCallTimer = 3.8;
      }
    };

    const sendReliableGameEvent = (event: ReliableGameEventPayload) => {
      const st = stateRef.current;
      if (
        st.gameMode === 'online_lan' &&
        st.isOnlineHost &&
        st.onlineRoomCode &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        wsRef.current.send(
          JSON.stringify({
            type: 'game_event',
            event,
          }),
        );
      }
    };

    const buildHostWorldSnapshot = (): WorldSnapshotPayload => ({
      simSteps,
      ball: {
        x: Number(ball.x.toFixed(3)),
        y: Number(ball.y.toFixed(3)),
        z: Number(ball.z.toFixed(3)),
        vx: Number(ball.vx.toFixed(3)),
        vy: Number(ball.vy.toFixed(3)),
        vz: Number(ball.vz.toFixed(3)),
        rotX: Number(ball.rotX.toFixed(3)),
        rotZ: Number(ball.rotZ.toFixed(3)),
        mudBonusMass: Number(ball.mudBonusMass.toFixed(3)),
        hiddenByGag: ball.hiddenByGag,
      },
      ballProfile: stateRef.current.ballProfile,
      scoreBlue,
      scoreRed,
      paliBlue,
      paliRed,
      stylePointsBlue,
      stylePointsRed,
      timeRemaining: Number(timeRemaining.toFixed(2)),
      players: players.map((p) => ({
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        z: Number(p.z.toFixed(3)),
        vx: Number(p.vx.toFixed(3)),
        vz: Number(p.vz.toFixed(3)),
        yaw: Number(p.yaw.toFixed(3)),
        kickAnimTimer: Number(p.kickAnimTimer.toFixed(2)),
        slideTimer: Number(p.slideTimer.toFixed(2)),
      })),
    });

    const showGagBanner = (id: GagId, step: number) => {
      const cfg = GAG_CONFIGS[id];
      soundEngine.playGagSound(id);
      activeGag = {
        id,
        title: cfg.title,
        subtitle: cfg.subtitle,
        timestamp: Math.round(step * FIXED_DT * 1000),
      };
      activeGagBannerSteps = 312;
    };

    const gagRegistry: GagActionRegistry = {
      vecchia_buca: {
        onTriggered: (_item: GagStateItem, step: number) => {
          showGagBanner('vecchia_buca', step);
          callbacksRef.current.onBallProfileChange('bucato');
          ball.x = -7.0;
          ball.y = 2.5;
          ball.z = -8.5;
          ball.prevX = ball.x;
          ball.prevY = ball.y;
          ball.prevZ = ball.z;
          ball.vx = 2.5;
          ball.vy = 2.0;
          ball.vz = 5.5;
          ball.mudBonusMass = 0;
        },
        onResolveEnter: () => {
          if (stateRef.current.ballProfile === 'bucato') {
            ball.mudBonusMass = 0;
            callbacksRef.current.onBallProfileChange('supersantos');
            lastBanner = {
              title: 'PALLA NUOVA IN CAMPO!',
              subtitle: 'È uscito un pallone di plastica nuovo di zecca!',
            };
            lastBannerTimer = 3.2;
          }
        },
      },
      finestra_rotta: {
        onTriggered: (_item: GagStateItem, step: number) => {
          showGagBanner('finestra_rotta', step);
          envRefs.windowGlassMesh.visible = false;

          const shardGeo = new THREE.TetrahedronGeometry(0.14, 0);
          const shardMat = new THREE.MeshStandardMaterial({
            color: 0xbae6fd,
            roughness: 0.1,
            metalness: 0.5,
          });
          for (let i = 0; i < 20; i++) {
            const m = new THREE.Mesh(shardGeo, shardMat);
            m.position.set((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.6, 0);
            envRefs.shardsGroup.add(m);
            glassShards.push({
              mesh: m,
              vx: (Math.random() - 0.5) * 4,
              vy: Math.random() * 3 + 1,
              vz: Math.random() * 5 + 2,
              life: 2.2,
            });
          }
          ball.vz = Math.abs(ball.vz) * 0.6 + 4;
        },
        onResolveEnter: () => {
          envRefs.windowGlassMesh.visible = true;
        },
        onCooldownEnter: () => {
          envRefs.windowGlassMesh.visible = true;
        },
      },
      palla_tetto: {
        onTriggered: (_item: GagStateItem, step: number) => {
          showGagBanner('palla_tetto', step);
          ball.x = 0;
          ball.y = 9.2;
          ball.z = -11.2;
          ball.prevX = 0;
          ball.prevY = 9.2;
          ball.prevZ = -11.2;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onBeatStep: () => {
          ball.x = 0;
          ball.y = 9.2;
          ball.z = -11.2;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onResolveEnter: () => {
          ball.x = 0;
          ball.y = 4.5;
          ball.z = -4.0;
          ball.prevX = 0;
          ball.prevY = 4.5;
          ball.prevZ = -4.0;
          ball.vx = rng.range(-1.5, 1.5);
          ball.vy = 2;
          ball.vz = 5.5;
          ball.mudBonusMass = 0;
        },
      },
      allarme_auto: {
        onTriggered: (_item: GagStateItem, step: number) => {
          showGagBanner('allarme_auto', step);
          ball.vx = 6.0;
          ball.vy = 5.0;
          ball.vz = -7.5;
        },
        onBeatStep: (item: GagStateItem, step: number) => {
          const flashOn = Math.floor((step - item.stateStartStep) / 7) % 2 === 0;
          envRefs.carHeadlights.forEach((hl) => {
            hl.visible = flashOn;
          });
        },
        onResolveEnter: () => {
          envRefs.carHeadlights.forEach((hl) => {
            hl.visible = true;
          });
        },
        onCooldownEnter: () => {
          envRefs.carHeadlights.forEach((hl) => {
            hl.visible = true;
          });
        },
      },
      tombino_fogna: {
        onTriggered: (_item: GagStateItem, step: number) => {
          showGagBanner('tombino_fogna', step);
          ball.x = 9.5;
          ball.y = -0.25;
          ball.z = 8.8;
          ball.prevX = 9.5;
          ball.prevY = -0.25;
          ball.prevZ = 8.8;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onBeatStep: () => {
          ball.x = 9.5;
          ball.y = -0.25;
          ball.z = 8.8;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onResolveEnter: () => {
          callbacksRef.current.onBallProfileChange('supersantos');
          ball.x = 0;
          ball.y = 3.5;
          ball.z = 0;
          ball.prevX = 0;
          ball.prevY = 3.5;
          ball.prevZ = 0;
          ball.vx = rng.range(-2, 2);
          ball.vy = 4;
          ball.vz = rng.range(-2, 2);
          ball.mudBonusMass = 0;
        },
      },
      cane_palla: {
        onTriggered: (item: GagStateItem, step: number) => {
          showGagBanner('cane_palla', step);
          item.payload.targetX = typeof item.payload.targetX === 'number' ? item.payload.targetX : ball.x;
          item.payload.targetZ = typeof item.payload.targetZ === 'number' ? item.payload.targetZ : ball.z;
          item.payload.grabbed = false;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onBeatStep: (item: GagStateItem, step: number, progress: number) => {
          const dog = envRefs.dogRig;
          const tx = item.payload.targetX ?? 0;
          const tz = item.payload.targetZ ?? 0;
          const simTime = step * FIXED_DT;

          let dogX = dog.homeX;
          let dogZ = dog.homeZ;
          let dirX = 0;
          let dirZ = -1;

          if (progress < 0.5) {
            const t = progress * 2;
            dogX = THREE.MathUtils.lerp(dog.homeX, tx, t);
            dogZ = THREE.MathUtils.lerp(dog.homeZ, tz, t);
            dirX = tx - dog.homeX;
            dirZ = tz - dog.homeZ;
          } else {
            if (!item.payload.grabbed) {
              item.payload.grabbed = true;
              soundEngine.playDogGrab();
            }
            const t = (progress - 0.5) * 2;
            dogX = THREE.MathUtils.lerp(tx, dog.homeX, t);
            dogZ = THREE.MathUtils.lerp(tz, dog.homeZ, t);
            dirX = dog.homeX - tx;
            dirZ = dog.homeZ - tz;
          }

          const yaw = Math.hypot(dirX, dirZ) > 0.01 ? Math.atan2(dirX, dirZ) : Math.PI;
          dog.root.position.set(dogX, 0, dogZ);
          dog.root.rotation.y = yaw;

          const legSwing = Math.sin(simTime * 26) * 0.72;
          dog.legs[0].rotation.x = legSwing;
          dog.legs[1].rotation.x = -legSwing;
          dog.legs[2].rotation.x = -legSwing;
          dog.legs[3].rotation.x = legSwing;
          dog.tail.rotation.z = Math.sin(simTime * 30) * 0.45;

          if (item.payload.grabbed) {
            ball.x = dogX + Math.sin(yaw) * 0.52;
            ball.y = 0.45;
            ball.z = dogZ + Math.cos(yaw) * 0.52;
            ball.vx = 0;
            ball.vy = 0;
            ball.vz = 0;
          }
        },
        onResolveEnter: () => {
          resetDogRigPose();
          ball.hiddenByGag = true;
          ball.x = envRefs.dogRig.homeX;
          ball.y = -5;
          ball.z = envRefs.dogRig.homeZ;
          ball.prevX = ball.x;
          ball.prevY = ball.y;
          ball.prevZ = ball.z;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onResolveStep: (_item: GagStateItem, step: number) => {
          envRefs.dogRig.tail.rotation.z = Math.sin(step * FIXED_DT * 18) * 0.35;
          ball.hiddenByGag = true;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onCooldownEnter: () => {
          resetDogRigPose();
          ball.hiddenByGag = false;
          ball.x = 0;
          ball.y = 0.5;
          ball.z = 0;
          ball.prevX = 0;
          ball.prevY = 0.5;
          ball.prevZ = 0;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
          ball.rotX = 0;
          ball.rotZ = 0;
          ball.prevRotX = 0;
          ball.prevRotZ = 0;
          ball.spinY = 0;
          ball.mudBonusMass = 0;
          ball.bouncedOffWall = false;
          lastBanner = {
            title: 'PALLA RESTITUITA DAL CANE!',
            subtitle: 'Il cane ha lasciato il pallone a centrocampo: si riparte!',
          };
          lastBannerTimer = 3.0;
        },
      },
      gabbiano_palla: {
        onTriggered: (item: GagStateItem, step: number) => {
          showGagBanner('gabbiano_palla', step);
          item.payload.targetX = typeof item.payload.targetX === 'number' ? item.payload.targetX : ball.x;
          item.payload.targetY = typeof item.payload.targetY === 'number' ? item.payload.targetY : Math.max(0.5, ball.y);
          item.payload.targetZ = typeof item.payload.targetZ === 'number' ? item.payload.targetZ : ball.z;
          item.payload.grabbed = false;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onBeatStep: (item: GagStateItem, step: number, progress: number) => {
          const gull = envRefs.seagullRig;
          gull.root.visible = true;
          const tx = item.payload.targetX ?? 0;
          const ty = item.payload.targetY ?? 0.6;
          const tz = item.payload.targetZ ?? -6.0;
          const simTime = step * FIXED_DT;

          let gx = gull.homeX;
          let gy = gull.homeY;
          let gz = gull.homeZ;
          let dirX = 0;
          let dirZ = 1;

          if (progress < 0.5) {
            const t = progress * 2;
            gx = THREE.MathUtils.lerp(gull.homeX, tx, t);
            gy = THREE.MathUtils.lerp(gull.homeY, ty + 0.4, t);
            gz = THREE.MathUtils.lerp(gull.homeZ, tz, t);
            dirX = tx - gull.homeX;
            dirZ = tz - gull.homeZ;
          } else {
            if (!item.payload.grabbed) {
              item.payload.grabbed = true;
              soundEngine.playDogGrab();
            }
            const t = (progress - 0.5) * 2;
            gx = THREE.MathUtils.lerp(tx, 0, t);
            gy = THREE.MathUtils.lerp(ty + 0.4, 4.6, t);
            gz = THREE.MathUtils.lerp(tz, -16.5, t);
            dirX = 0 - tx;
            dirZ = -16.5 - tz;
          }

          const yaw = Math.hypot(dirX, dirZ) > 0.01 ? Math.atan2(dirX, dirZ) : 0;
          gull.root.position.set(gx, gy, gz);
          gull.root.rotation.y = yaw;

          const wingFlap = Math.sin(simTime * 34) * 0.58;
          gull.leftWing.rotation.z = wingFlap;
          gull.rightWing.rotation.z = -wingFlap;

          if (item.payload.grabbed) {
            ball.x = gx;
            ball.y = gy - 0.38;
            ball.z = gz;
            ball.vx = 0;
            ball.vy = 0;
            ball.vz = 0;
          }
        },
        onResolveEnter: () => {
          resetSeagullRigPose();
          ball.hiddenByGag = true;
          ball.x = 0;
          ball.y = -5;
          ball.z = -16.5;
          ball.prevX = ball.x;
          ball.prevY = ball.y;
          ball.prevZ = ball.z;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onResolveStep: () => {
          ball.hiddenByGag = true;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onCooldownEnter: () => {
          resetSeagullRigPose();
          ball.hiddenByGag = false;
          ball.x = 0;
          ball.y = 0.5;
          ball.z = 0;
          ball.prevX = 0;
          ball.prevY = 0.5;
          ball.prevZ = 0;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
          ball.rotX = 0;
          ball.rotZ = 0;
          ball.prevRotX = 0;
          ball.prevRotZ = 0;
          ball.spinY = 0;
          ball.mudBonusMass = 0;
          ball.bouncedOffWall = false;
          lastBanner = {
            title: 'UN’ONDA RIPORTA LA PALLA A RIVA!',
            subtitle: 'Il mare ha restituito il pallone al centro della spiaggia!',
          };
          lastBannerTimer = 3.0;
        },
      },
    };

    const onHostGagStateChanged = () => {
      sendReliableGameEvent({
        kind: 'gag_state',
        gagState,
        simSteps,
      });
    };

    const applyGagSystemStateFromHost = (incoming: GagSystemState, hostStep: number) => {
      const prevActiveId = gagState.activeGagId;
      const prevActiveState = prevActiveId ? gagState.items[prevActiveId]?.state : 'Idle';

      gagState = incoming;
      const nextActiveId = gagState.activeGagId;
      const nextItem = nextActiveId ? gagState.items[nextActiveId] : null;

      if (nextActiveId && nextItem) {
        const actions = gagRegistry[nextActiveId];
        if (prevActiveId !== nextActiveId || (prevActiveState === 'Idle' && nextItem.state === 'Beat')) {
          actions?.onTriggered?.(nextItem, hostStep);
        } else if (prevActiveState !== 'Resolve' && nextItem.state === 'Resolve') {
          actions?.onResolveEnter?.(nextItem, hostStep);
        }
      } else if (prevActiveId && !nextActiveId) {
        const prevItem = gagState.items[prevActiveId];
        if (prevItem) {
          gagRegistry[prevActiveId]?.onCooldownEnter?.(prevItem, hostStep);
        }
      }
    };

    const applyMatchStartFromHost = (m: MatchStartPayload) => {
      rng.reset(m.seed >>> 0);
      simSteps = 0;
      scoreBlue = 0;
      scoreRed = 0;
      paliBlue = 0;
      paliRed = 0;
      stylePointsBlue = 0;
      stylePointsRed = 0;
      timeRemaining = 180;
      gagState = createInitialGagSystemState();
      snapshotBuffer.length = 0;
      latestHostSnapshot = null;
      resetPositions('blue');
      callbacksRef.current.onRemoteSyncState({
        seed: m.seed >>> 0,
        weather: m.weather,
        pitch: m.pitch,
        ballProfile: m.ballProfile,
        streetRule: m.streetRule,
        ruleTunnelEnabled: m.ruleTunnelEnabled,
        ruleCappelloEnabled: m.ruleCappelloEnabled,
        isPlaying: true,
      });
    };

    const handleWsMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'match_start') {
          if (!stateRef.current.isOnlineHost) {
            if (msg.match && typeof msg.match.seed === 'number') {
              applyMatchStartFromHost(msg.match as MatchStartPayload);
            } else if (typeof msg.seed === 'number') {
              rng.reset(msg.seed >>> 0);
              simSteps = 0;
              snapshotBuffer.length = 0;
              resetPositions('blue');
            }
          }
        } else if (msg.type === 'client_joined_room' && stateRef.current.isOnlineHost) {
          const st = stateRef.current;
          sendReliableGameEvent({
            kind: 'full_sync',
            matchStart: {
              seed: st.matchSeed >>> 0,
              weather: st.weather,
              pitch: st.pitch,
              ballProfile: st.ballProfile,
              streetRule: st.streetRule,
              ruleTunnelEnabled: st.ruleTunnelEnabled,
              ruleCappelloEnabled: st.ruleCappelloEnabled,
            },
            snapshot: buildHostWorldSnapshot(),
            gagState,
            isPlaying: st.isPlaying,
          });
        } else if (msg.type === 'client_input' && stateRef.current.isOnlineHost) {
          remoteClientInput = msg.input;
        } else if (msg.type === 'world_state' && !stateRef.current.isOnlineHost) {
          const s = msg.state as WorldSnapshotPayload;
          if (!s || !s.ball) return;
          const recvNow = performance.now();
          latestHostSnapshot = s;
          snapshotBuffer.push({ recvTime: recvNow, snap: s });
          while (snapshotBuffer.length > 12) {
            snapshotBuffer.shift();
          }
          snapshotsReceivedInWindow += 1;

          if (typeof s.simSteps === 'number') {
            simSteps = s.simSteps;
          }
          scoreBlue = s.scoreBlue;
          scoreRed = s.scoreRed;
          if (typeof s.paliBlue === 'number') paliBlue = s.paliBlue;
          if (typeof s.paliRed === 'number') paliRed = s.paliRed;
          if (typeof s.stylePointsBlue === 'number') stylePointsBlue = s.stylePointsBlue;
          if (typeof s.stylePointsRed === 'number') stylePointsRed = s.stylePointsRed;
          timeRemaining = s.timeRemaining;
          if (typeof s.ball.mudBonusMass === 'number') {
            ball.mudBonusMass = s.ball.mudBonusMass;
          }
          if (typeof s.ball.hiddenByGag === 'boolean') {
            ball.hiddenByGag = s.ball.hiddenByGag;
          }
          if (s.ballProfile && s.ballProfile !== stateRef.current.ballProfile) {
            callbacksRef.current.onBallProfileChange(s.ballProfile);
          }
        } else if (msg.type === 'game_event' && !stateRef.current.isOnlineHost) {
          const evPayload = msg.event as ReliableGameEventPayload;
          if (!evPayload) return;
          switch (evPayload.kind) {
            case 'weather_change':
              ball.mudBonusMass = 0;
              callbacksRef.current.onRemoteSyncState({ weather: evPayload.weather });
              break;
            case 'pitch_change':
              ball.mudBonusMass = 0;
              callbacksRef.current.onRemoteSyncState({ pitch: evPayload.pitch });
              break;
            case 'ball_profile_change':
              ball.mudBonusMass = 0;
              callbacksRef.current.onBallProfileChange(evPayload.ballProfile);
              break;
            case 'rules_change':
              callbacksRef.current.onRemoteSyncState({
                streetRule: evPayload.streetRule,
                ruleTunnelEnabled: evPayload.ruleTunnelEnabled,
                ruleCappelloEnabled: evPayload.ruleCappelloEnabled,
              });
              break;
            case 'goal':
              scoreBlue = evPayload.scoreBlue;
              scoreRed = evPayload.scoreRed;
              paliBlue = evPayload.paliBlue;
              paliRed = evPayload.paliRed;
              soundEngine.playGoalCheer();
              lastBanner = {
                title:
                  evPayload.scoredByTeam === 'blue'
                    ? evPayload.bonusPoints > 1
                      ? 'GOL DI SPONDA DOPPIO! (+2)'
                      : 'GOOOL DEGLI AZZURRI!'
                    : evPayload.bonusPoints > 1
                      ? 'GOL DI SPONDA RIVALI! (+2)'
                      : 'GOL DEI RIVALI DEL RIONE!',
                subtitle: 'Palla in rete!',
              };
              lastBannerTimer = 3.6;
              break;
            case 'trick_score':
              scoreBlue = evPayload.scoreBlue;
              scoreRed = evPayload.scoreRed;
              stylePointsBlue = evPayload.stylePointsBlue;
              stylePointsRed = evPayload.stylePointsRed;
              trickPopup = { label: evPayload.label, team: evPayload.team };
              trickPopupSteps = 48;
              soundEngine.playTrickCheer();
              break;
            case 'gag_state':
              applyGagSystemStateFromHost(evPayload.gagState, evPayload.simSteps);
              break;
            case 'full_sync': {
              const m = evPayload.matchStart;
              rng.reset(m.seed >>> 0);
              simSteps = evPayload.snapshot.simSteps;
              scoreBlue = evPayload.snapshot.scoreBlue;
              scoreRed = evPayload.snapshot.scoreRed;
              paliBlue = evPayload.snapshot.paliBlue;
              paliRed = evPayload.snapshot.paliRed;
              stylePointsBlue = evPayload.snapshot.stylePointsBlue;
              stylePointsRed = evPayload.snapshot.stylePointsRed;
              timeRemaining = evPayload.snapshot.timeRemaining;
              ball.x = evPayload.snapshot.ball.x;
              ball.y = evPayload.snapshot.ball.y;
              ball.z = evPayload.snapshot.ball.z;
              ball.prevX = ball.x;
              ball.prevY = ball.y;
              ball.prevZ = ball.z;
              ball.vx = evPayload.snapshot.ball.vx;
              ball.vy = evPayload.snapshot.ball.vy;
              ball.vz = evPayload.snapshot.ball.vz;
              ball.rotX = evPayload.snapshot.ball.rotX;
              ball.rotZ = evPayload.snapshot.ball.rotZ;
              ball.mudBonusMass = evPayload.snapshot.ball.mudBonusMass;
              ball.hiddenByGag = Boolean(evPayload.snapshot.ball.hiddenByGag);
              snapshotBuffer.length = 0;
              snapshotBuffer.push({ recvTime: performance.now(), snap: evPayload.snapshot });
              latestHostSnapshot = evPayload.snapshot;
              applyGagSystemStateFromHost(evPayload.gagState, evPayload.snapshot.simSteps);
              callbacksRef.current.onRemoteSyncState({
                seed: m.seed >>> 0,
                weather: m.weather,
                pitch: m.pitch,
                ballProfile: m.ballProfile,
                streetRule: m.streetRule,
                ruleTunnelEnabled: m.ruleTunnelEnabled,
                ruleCappelloEnabled: m.ruleCappelloEnabled,
                isPlaying: evPayload.isPlaying,
              });
              break;
            }
          }
        }
      } catch {
        // Ignore parse error
      }
    };

    if (wsRef.current) {
      wsRef.current.addEventListener('message', handleWsMessage);
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let lastTime = performance.now();
    let accumulator = 0;
    let lastPhysicsSteps = 1;
    let frameId = 0;
    let lastRenderedBallProfile: BallProfileId = stateRef.current.ballProfile;
    let lastWeather: WeatherId = stateRef.current.weather;
    let lastRenderedScale = stateRef.current.renderScale;
    let wasPlaying = stateRef.current.isPlaying;
    const initWeatherCfg = WEATHER_CONFIGS[stateRef.current.weather];
    let currentCameraFar = initWeatherCfg.cameraFar;
    let currentFogNear = initWeatherCfg.fogNear;
    let currentFogFar = initWeatherCfg.fogFar;
    let telemetryAccumulator = 0;
    let networkBroadcastAccumulator = 0;
    let framesInWindow = 0;
    let smoothedFps = 60;
    let smoothedFrameMs = 4.2;
    let latestSampledShootCharge = 0;
    let latestSampledRightHoldCharge = 0;
    let latestHasBall = false;

    const fpsRingTimestamps = new Float64Array(256);
    let fpsRingHead = 0;
    let fpsRingCount = 0;
    let autoScaleFpsAvg = 60;
    let lowFpsAccumSec = 0;
    let highFpsAccumSec = 0;
    let scaleCooldownUntil = 0;
    let matchStartGraceUntil = performance.now() + 3000;
    let visibilityResumeGraceUntil = 0;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const resumeNow = performance.now();
        accumulator = 0;
        lastTime = resumeNow;
        visibilityResumeGraceUntil = resumeNow + 2000;
        lowFpsAccumSec = 0;
        highFpsAccumSec = 0;
        fpsRingCount = 0;
        fpsRingHead = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    /**
     * Executes a single deterministic physics & gameplay step of duration FIXED_DT (1/60 s).
     */
    const stepPhysics = (fixedDt: number) => {
      const st = stateRef.current;
      const dims = getEffectivePitchDimensions(st.pitch, st.teamSize);
      const botCfg = BOT_DIFFICULTIES[st.botDifficulty];

      // Save previous state for alpha rendering interpolation
      ball.prevX = ball.x;
      ball.prevY = ball.y;
      ball.prevZ = ball.z;
      ball.prevRotX = ball.rotX;
      ball.prevRotZ = ball.rotZ;
      for (let i = 0; i < players.length; i++) {
        players[i].prevX = players[i].x;
        players[i].prevY = players[i].y;
        players[i].prevZ = players[i].z;
        players[i].prevYaw = players[i].yaw;
      }

      const inputMgr = inputManagerRef.current;
      const p1Input = inputMgr ? inputMgr.samplePlayer1(fixedDt, st.gameMode !== 'local_2p') : null;
      const p2Input =
        inputMgr && st.gameMode === 'local_2p' ? inputMgr.samplePlayer2(fixedDt) : remoteClientInput;
      inputMgr?.endFrame();

      latestSampledShootCharge = p1Input?.shootCharge || 0;
      latestSampledRightHoldCharge = p1Input?.rightHoldCharge || 0;

      if (p1Input?.cameraToggleJustPressed) {
        const nextCam: CameraMode = st.cameraMode === 'classic' ? 'fps' : 'classic';
        callbacksRef.current.onCameraModeChange(nextCam);
      }

      if (p1Input?.ballCycleJustPressed && (st.gameMode !== 'online_lan' || st.isOnlineHost)) {
        const order: BallProfileId[] = ['supersantos', 'classico', 'bagnato', 'bucato'];
        const nextProfile = order[(order.indexOf(st.ballProfile) + 1) % order.length];
        callbacksRef.current.onBallProfileChange(nextProfile);
        sendReliableGameEvent({ kind: 'ball_profile_change', ballProfile: nextProfile });
      }

      if (p1Input?.shoutJustPressed) {
        triggerVoiceShout(p1Input.shoutJustPressed, 'blue');
      }
      if (manualShoutTriggerRef.current) {
        const req = manualShoutTriggerRef.current;
        manualShoutTriggerRef.current = null;
        triggerVoiceShout(req.shout, 'blue');
      }

      // Gradual interpolation of camera.far and fog near/far
      const targetWCfg = WEATHER_CONFIGS[st.weather];
      currentCameraFar = THREE.MathUtils.damp(currentCameraFar, Math.max(targetWCfg.cameraFar, dims.halfX * 3.2), 1.4, fixedDt);
      currentFogNear = THREE.MathUtils.damp(currentFogNear, targetWCfg.fogNear, 1.4, fixedDt);
      currentFogFar = THREE.MathUtils.damp(currentFogFar, Math.max(targetWCfg.fogFar, dims.halfX * 3.0), 1.4, fixedDt);

      if (!st.isPlaying || st.isPaused) {
        return;
      }

      simSteps += 1;
      const simTime = simSteps * fixedDt;

      if (lastBannerTimer > 0) {
        lastBannerTimer -= fixedDt;
        if (lastBannerTimer <= 0) lastBanner = null;
      }
      if (activeShoutTimer > 0) {
        activeShoutTimer -= fixedDt;
        if (activeShoutTimer <= 0) activeShout = null;
      }
      if (markingCallTimer > 0) {
        markingCallTimer = Math.max(0, markingCallTimer - fixedDt);
      }
      if (setPieceState) {
        setPieceState.timer -= fixedDt;
        if (setPieceState.timer <= 0) {
          setPieceState = null;
        }
      }
      if (activeGagBannerSteps > 0) {
        activeGagBannerSteps -= 1;
        if (activeGagBannerSteps <= 0) activeGag = null;
      }
      if (trickPopupSteps > 0) {
        trickPopupSteps -= 1;
        if (trickPopupSteps <= 0) trickPopup = null;
      }

      for (let i = glassShards.length - 1; i >= 0; i--) {
        const sh = glassShards[i];
        sh.life -= fixedDt;
        sh.vy -= 14 * fixedDt;
        sh.mesh.position.x += sh.vx * fixedDt;
        sh.mesh.position.y += sh.vy * fixedDt;
        sh.mesh.position.z += sh.vz * fixedDt;
        sh.mesh.rotation.x += 6 * fixedDt;
        sh.mesh.rotation.y += 5 * fixedDt;
        if (sh.life <= 0) {
          envRefs.shardsGroup.remove(sh.mesh);
          glassShards.splice(i, 1);
        }
      }

      const isMultiplayerClient =
        st.gameMode === 'online_lan' && !st.isOnlineHost && Boolean(st.onlineRoomCode);

      if (isMultiplayerClient) {
        if (snapshotBuffer.length >= 2) {
          const targetRenderTime = performance.now() - SNAPSHOT_INTERP_DELAY_MS;
          let idx0 = 0;
          for (let i = 0; i < snapshotBuffer.length - 1; i++) {
            if (snapshotBuffer[i + 1].recvTime <= targetRenderTime) {
              idx0 = i + 1;
            } else {
              break;
            }
          }
          const entry0 = snapshotBuffer[idx0];
          const entry1 = snapshotBuffer[Math.min(idx0 + 1, snapshotBuffer.length - 1)];
          const span = Math.max(1, entry1.recvTime - entry0.recvTime);
          const tInterp =
            entry0 === entry1 ? 1 : THREE.MathUtils.clamp((targetRenderTime - entry0.recvTime) / span, 0, 1.25);

          const b0 = entry0.snap.ball;
          const b1 = entry1.snap.ball;
          ball.x = THREE.MathUtils.lerp(b0.x, b1.x, tInterp);
          ball.y = THREE.MathUtils.lerp(b0.y, b1.y, tInterp);
          ball.z = THREE.MathUtils.lerp(b0.z, b1.z, tInterp);
          ball.vx = THREE.MathUtils.lerp(b0.vx, b1.vx, tInterp);
          ball.vy = THREE.MathUtils.lerp(b0.vy, b1.vy, tInterp);
          ball.vz = THREE.MathUtils.lerp(b0.vz, b1.vz, tInterp);
          ball.rotX = THREE.MathUtils.lerp(b0.rotX, b1.rotX, tInterp);
          ball.rotZ = THREE.MathUtils.lerp(b0.rotZ, b1.rotZ, tInterp);

          for (let i = 0; i < players.length; i++) {
            const p = players[i];
            const sp0 = entry0.snap.players[i];
            const sp1 = entry1.snap.players[i];
            if (!p || !sp0 || !sp1) continue;
            p.x = THREE.MathUtils.lerp(sp0.x, sp1.x, tInterp);
            p.y = THREE.MathUtils.lerp(sp0.y ?? 0, sp1.y ?? 0, tInterp);
            p.z = THREE.MathUtils.lerp(sp0.z, sp1.z, tInterp);
            p.vx = THREE.MathUtils.lerp(sp0.vx, sp1.vx, tInterp);
            p.vz = THREE.MathUtils.lerp(sp0.vz, sp1.vz, tInterp);
            p.yaw = lerpAngle(sp0.yaw, sp1.yaw, Math.min(1, tInterp));
            if (typeof sp1.kickAnimTimer === 'number') p.kickAnimTimer = sp1.kickAnimTimer;
            if (typeof sp1.slideTimer === 'number') p.slideTimer = sp1.slideTimer;
          }
        } else if (latestHostSnapshot) {
          const sb = latestHostSnapshot.ball;
          ball.vx = sb.vx;
          ball.vy = sb.vy;
          ball.vz = sb.vz;
          ball.x = THREE.MathUtils.lerp(ball.x + ball.vx * fixedDt, sb.x, 0.35);
          ball.y = THREE.MathUtils.lerp(ball.y + ball.vy * fixedDt, sb.y, 0.35);
          ball.z = THREE.MathUtils.lerp(ball.z + ball.vz * fixedDt, sb.z, 0.35);
          ball.rotX = THREE.MathUtils.lerp(ball.rotX + ball.vz * fixedDt * 2.1, sb.rotX, 0.35);
          ball.rotZ = THREE.MathUtils.lerp(ball.rotZ - ball.vx * fixedDt * 2.1, sb.rotZ, 0.35);

          latestHostSnapshot.players.forEach((sp, idx) => {
            const p = players[idx];
            if (!p) return;
            p.vx = sp.vx;
            p.vz = sp.vz;
            p.x = THREE.MathUtils.lerp(p.x + p.vx * fixedDt, sp.x, 0.35);
            p.y = sp.y ?? 0;
            p.z = THREE.MathUtils.lerp(p.z + p.vz * fixedDt, sp.z, 0.35);
            p.yaw = lerpAngle(p.yaw, sp.yaw, 0.35);
            if (typeof sp.kickAnimTimer === 'number') p.kickAnimTimer = sp.kickAnimTimer;
            if (typeof sp.slideTimer === 'number') p.slideTimer = sp.slideTimer;
          });
        }

        applyClientGagVisualStep(gagState, simSteps, gagRegistry);

        networkBroadcastAccumulator += fixedDt;
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          p1Input &&
          networkBroadcastAccumulator >= 0.033
        ) {
          networkBroadcastAccumulator = 0;
          clientInputSeq += 1;
          wsRef.current.send(
            JSON.stringify({
              type: 'client_input',
              seq: clientInputSeq,
              input: p1Input,
            }),
          );
        }
        return;
      }

      // Authoritative Simulation (Local or Online Host)
      const wCfg = WEATHER_CONFIGS[st.weather];
      const pitchCfg = PITCH_CONFIGS[st.pitch];

      timeRemaining = Math.max(0, timeRemaining - fixedDt);
      if (goalCelebrationTimer > 0) goalCelebrationTimer = Math.max(0, goalCelebrationTimer - fixedDt);

      if (st.weather === 'pioggia' && st.ballProfile === 'classico') {
        rainExposureTimer += fixedDt;
        if (rainExposureTimer > 45) {
          rainExposureTimer = 0;
          callbacksRef.current.onBallProfileChange('bagnato');
          sendReliableGameEvent({ kind: 'ball_profile_change', ballProfile: 'bagnato' });
          lastBanner = {
            title: 'PALLONE INZUPPATO!',
            subtitle: 'La pioggia ha reso il pallone di cuoio pesante come il piombo!',
          };
          lastBannerTimer = 4.0;
        }
      }

      stepGagStateMachine(gagState, simSteps, gagRegistry, onHostGagStateChanged);

      const controlledBlue = players[activeBlueIdx] || players[0];
      const distControlledToBall = controlledBlue
        ? Math.hypot(controlledBlue.x - ball.x, controlledBlue.z - ball.z)
        : 99;

      // Switch active Blue Player on 'K' when not holding the ball
      if (p1Input?.passJustPressed && distControlledToBall > 2.2) {
        let bestIdx = activeBlueIdx;
        let bestDist = Infinity;
        for (let i = 0; i < players.length; i++) {
          if (players[i].team !== 'blue' || i === activeBlueIdx) continue;
          const d2 = Math.hypot(players[i].x - ball.x, players[i].z - ball.z);
          if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
          }
        }
        activeBlueIdx = bestIdx;
      }

      const grip = wCfg.playerGripMultiplier / Math.sqrt(pitchCfg.groundFriction);
      const speedMult = wCfg.playerSpeedMultiplier * pitchCfg.playerSpeedMultiplier;
      const turnMult = wCfg.playerTurnMultiplier * pitchCfg.playerTurnMultiplier;

      const isBallLockedByGag =
        ball.hiddenByGag ||
        gagState.activeGagId === 'palla_tetto' ||
        gagState.activeGagId === 'tombino_fogna' ||
        gagState.activeGagId === 'cane_palla' ||
        gagState.activeGagId === 'gabbiano_palla';

      // Reset GK rush flag unless LMB is held while out of possession
      gkRushActive = false;

      players.forEach((p, idx) => {
        const isBlueControlled = idx === activeBlueIdx;
        const isRedControlled =
          (st.gameMode === 'local_2p' || (st.gameMode === 'online_lan' && st.onlineRoomCode)) &&
          idx === activeRedIdx;

        const roleCfg = PLAYER_CATEGORIES[p.role];
        const roleSpeedMult = roleCfg.sprintMultiplier;

        if (p.kickAnimTimer > 0) p.kickAnimTimer = Math.max(0, p.kickAnimTimer - fixedDt);
        if (p.slideTimer > 0) p.slideTimer = Math.max(0, p.slideTimer - fixedDt);
        if (p.feintTimer > 0) p.feintTimer = Math.max(0, p.feintTimer - fixedDt);

        // Vertical Jump Physics (Spacebar jump & gravity)
        if (p.y > 0 || p.vy > 0) {
          p.vy -= 18.5 * fixedDt;
          p.y += p.vy * fixedDt;
          if (p.y <= 0) {
            p.y = 0;
            p.vy = 0;
          }
        }

        const dBall = Math.hypot(ball.x - p.x, ball.z - p.z);
        const hasPossession = dBall < 1.48 && ball.y < p.y + 1.85 && !isBallLockedByGag;
        if (isBlueControlled) {
          latestHasBall = hasPossession;
        }

        // If player is part of a defensive Free Kick Wall ("Barriera"), hold wall position until ball is kicked!
        if (setPieceState && setPieceState.wallPlayerIds.includes(p.id)) {
          p.vx = 0;
          p.vz = 0;
          return;
        }

        let targetVx = 0;
        let targetVz = 0;

        if (isBlueControlled && p1Input) {
          // Spacebar Jump
          if (p1Input.jumpJustPressed && p.y <= 0.02) {
            p.vy = 6.9;
            soundEngine.playJumpSound();
          }

          const baseSpeed = (p1Input.sprint ? 8.6 : 6.2) * speedMult * roleSpeedMult;
          const speed = baseSpeed * (p.slideTimer > 0 ? 1.28 : p.feintTimer > 0 ? 1.38 : 1.0);

          if (st.cameraMode === 'fps') {
            p.yaw -= p1Input.lookDeltaX * turnMult;
            p.pitchLook = THREE.MathUtils.clamp(p.pitchLook - p1Input.lookDeltaY, -0.65, 0.45);
            if (!document.pointerLockElement && Math.abs(p1Input.moveX) > 0.1) {
              p.yaw -= p1Input.moveX * 2.1 * turnMult * fixedDt;
            }
            const forwardX = Math.sin(p.yaw);
            const forwardZ = Math.cos(p.yaw);
            const rightX = Math.cos(p.yaw);
            const rightZ = -Math.sin(p.yaw);

            const fwdInput = -p1Input.moveZ;
            const strafeInput = document.pointerLockElement ? p1Input.moveX : p1Input.moveX * 0.45;
            targetVx = (forwardX * fwdInput - rightX * strafeInput) * speed;
            targetVz = (forwardZ * fwdInput - rightZ * strafeInput) * speed;
          } else {
            targetVx = p1Input.moveX * speed;
            targetVz = p1Input.moveZ * speed;
            if (Math.hypot(targetVx, targetVz) > 0.25) {
              const desiredYaw = Math.atan2(targetVx, targetVz);
              p.yaw = lerpAngle(p.yaw, desiredYaw, Math.min(1, 14 * turnMult * fixedDt));
            }
          }

          // Out-of-possession Mouse Controls:
          if (!hasPossession) {
            p.dribbleExposure = Math.max(0, p.dribbleExposure - fixedDt * 2.5);

            // LMB single click = call teammate Marking ("richiama la marcatura")
            if (p1Input.shootJustReleased && p1Input.shootCharge < 0.24) {
              markingCallTimer = 3.2;
              lastBanner = {
                title: 'RADDOPPIO DI MARCATURA CHIAMATO!',
                subtitle: 'Il tuo compagno pressa il portatore di palla avversario!',
              };
              lastBannerTimer = 1.6;
            }
            // LMB held = Goalkeeper automatic rush ("uscita del portiere")
            if (p1Input.shootHeld && p1Input.shootCharge >= 0.2) {
              gkRushActive = true;
            }

            // RMB = Slide Tackle ("Scivolata") — single click = normal slide; hold & release = violent slide!
            if (
              (p1Input.tackleJustPressed || p1Input.rightClickSingle || p1Input.rightClickJustReleased) &&
              p.slideTimer <= 0
            ) {
              const isViolent = p1Input.rightHoldCharge >= 0.28;
              p.slideTimer = isViolent ? 0.62 : 0.4;
              p.slideViolent = isViolent;
              p.slideTouchedBall = false;
              p.slideHasFouled = false;
              const slideBoost = (isViolent ? 9.6 : 6.8) * speedMult;
              p.vx += Math.sin(p.yaw) * slideBoost;
              p.vz += Math.cos(p.yaw) * slideBoost;
              soundEngine.playSlideSound(isViolent);
            }

            // Goalkeeper Hand Save / Dive when playing as Goalkeeper
            if (
              p.isGoalkeeper &&
              (p1Input.shootJustReleased ||
                p1Input.tackleJustPressed ||
                p1Input.rightClickSingle ||
                p1Input.rightClickJustReleased) &&
              dBall < 2.35 &&
              !isBallLockedByGag
            ) {
              const insideBox = isInsideOwnPenaltyBox(p.x, p.z, p.team, dims);
              if (!insideBox) {
                // CRITICAL RULE: Goalkeeper touched the ball with hands OUTSIDE the penalty area -> PENALTY KICK!
                setupSetPiece(
                  'penalty',
                  'red',
                  p.x,
                  p.z,
                  'FALLO DI MANO DEL PORTIERE FUORI AREA!',
                  'Hai parato con le mani fuori dall’area di rigore: Calcio di Rigore per gli avversari!',
                );
                return;
              }
              soundEngine.playSaveSound();
              ball.vx = Math.sin(p.yaw) * 14.5;
              ball.vz = Math.cos(p.yaw) * 14.5;
              ball.vy = 3.8;
              p.kickAnimTimer = 0.35;
              triggerComicImpact(ball.x, ball.y + 0.3, ball.z, 1.15, 7);
            }
          }
        } else if (isRedControlled && p2Input) {
          if (p2Input.jumpJustPressed && p.y <= 0.02) {
            p.vy = 6.9;
            soundEngine.playJumpSound();
          }
          const speed = (p2Input.sprint ? 8.6 : 6.2) * speedMult * roleSpeedMult;
          targetVx = p2Input.moveX * speed;
          targetVz = p2Input.moveZ * speed;
          if (Math.hypot(targetVx, targetVz) > 0.25) {
            const desiredYaw = Math.atan2(targetVx, targetVz);
            p.yaw = lerpAngle(p.yaw, desiredYaw, Math.min(1, 14 * turnMult * fixedDt));
          }
          if (!hasPossession && p2Input.tackleJustPressed && p.slideTimer <= 0) {
            const isViolent = p2Input.rightHoldCharge >= 0.28;
            p.slideTimer = isViolent ? 0.62 : 0.4;
            p.slideViolent = isViolent;
            p.slideTouchedBall = false;
            p.slideHasFouled = false;
            p.vx += Math.sin(p.yaw) * (isViolent ? 9.2 : 6.5) * speedMult;
            p.vz += Math.cos(p.yaw) * (isViolent ? 9.2 : 6.5) * speedMult;
            soundEngine.playSlideSound(isViolent);
          }
        } else {
          // Tactical Bot AI (scaled by BotDifficulty + Goalkeeper logic + Marking Call + GK Rush)
          p.dribbleExposure = 0;
          const distBall = Math.hypot(ball.x - p.x, ball.z - p.z);

          if (p.isGoalkeeper) {
            const ownGoalX = p.team === 'blue' ? -dims.halfX + 0.9 : dims.halfX - 0.9;
            if (p.team === 'blue' && gkRushActive) {
              // Goalkeeper rushes out toward the ball carrier!
              const dx = ball.x - p.x;
              const dz = ball.z - p.z;
              const dLen = Math.hypot(dx, dz) || 1;
              targetVx = (dx / dLen) * 7.2 * speedMult;
              targetVz = (dz / dLen) * 7.2 * speedMult;
              p.yaw = lerpAngle(p.yaw, Math.atan2(targetVx, targetVz), Math.min(1, 12 * fixedDt));
            } else {
              // Patrol goal line & track ball Z within goal width
              const targetZ = THREE.MathUtils.clamp(ball.z * 0.72, -dims.goalHalfW + 0.4, dims.goalHalfW - 0.4);
              const targetX =
                distBall < 4.5 && isInsideOwnPenaltyBox(ball.x, ball.z, p.team, dims)
                  ? ball.x
                  : ownGoalX;
              const dx = targetX - p.x;
              const dz = targetZ - p.z;
              const dLen = Math.hypot(dx, dz);
              if (dLen > 0.2) {
                const gkSpeed = 5.4 * speedMult * botCfg.speedMultiplier;
                targetVx = (dx / dLen) * gkSpeed;
                targetVz = (dz / dLen) * gkSpeed;
              }
              const lookYaw = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
              p.yaw = lerpAngle(p.yaw, lookYaw, Math.min(1, 10 * fixedDt));
            }
          } else {
            const teamFieldPlayers = players.filter((tp) => tp.team === p.team && !tp.isGoalkeeper);
            const teamHasClosest = teamFieldPlayers.every(
              (tp) => tp === p || Math.hypot(ball.x - tp.x, ball.z - tp.z) >= distBall - 0.5,
            );

            let destX = THREE.MathUtils.clamp(p.homeX + ball.x * 0.35, -dims.halfX + 1.5, dims.halfX - 1.5);
            let destZ = THREE.MathUtils.clamp(p.homeZ + ball.z * 0.45, -dims.halfZ + 1.2, dims.halfZ - 1.2);

            const isCalledForMarking = p.team === 'blue' && markingCallTimer > 0 && teamHasClosest;
            if (teamHasClosest || distBall < 5.5 || isCalledForMarking) {
              destX = ball.x;
              destZ = ball.z;
            }

            const dx = destX - p.x;
            const dz = destZ - p.z;
            const dLen = Math.hypot(dx, dz);
            if (dLen > 0.35) {
              const aiBase = (p.role === 'attacker' ? 5.8 : 5.3) * speedMult * botCfg.speedMultiplier;
              const aiSpeed = isCalledForMarking ? aiBase * 1.22 : aiBase;
              targetVx = (dx / dLen) * aiSpeed;
              targetVz = (dz / dLen) * aiSpeed;
              const desiredYaw = Math.atan2(targetVx, targetVz);
              p.yaw = lerpAngle(p.yaw, desiredYaw, Math.min(1, 12 * turnMult * botCfg.reactionRate * fixedDt));
            }
          }
        }

        const accel = 11.5 * grip * turnMult;
        p.vx = THREE.MathUtils.damp(p.vx, targetVx, accel, fixedDt);
        p.vz = THREE.MathUtils.damp(p.vz, targetVz, accel, fixedDt);

        p.x = THREE.MathUtils.clamp(p.x + p.vx * fixedDt, -dims.halfX - 0.2, dims.halfX + 0.2);
        p.z = THREE.MathUtils.clamp(p.z + p.vz * fixedDt, -dims.halfZ - 0.2, dims.halfZ + 0.2);

        // SLIDE TACKLE BALL INTERCEPTION vs FOUL DETECTION ("Scivolata sul pallone o fallo da dietro/violento")
        if (p.slideTimer > 0 && !isBallLockedByGag) {
          const slideReach = 1.42 * roleCfg.slidePrecision;
          if (dBall < slideReach && ball.y < 1.1) {
            p.slideTouchedBall = true;
            ball.vx = Math.sin(p.yaw) * (p.slideViolent ? 15.5 : 11.5);
            ball.vz = Math.cos(p.yaw) * (p.slideViolent ? 15.5 : 11.5);
            ball.vy = 1.6;
            ball.lastTouchTeam = p.team;
            ball.lastTouchPlayerId = p.id;
            ball.lastTouchStep = simSteps;
            soundEngine.playKick(st.ballProfile, 0.55);
            triggerComicImpact(ball.x, ball.y + 0.2, ball.z, 0.9, 5);
          } else if (!p.slideTouchedBall && !p.slideHasFouled && !setPieceState) {
            // Check if the sliding player crashes into an opponent WITHOUT getting the ball first
            for (const opp of players) {
              if (opp.team === p.team) continue;
              const dOpp = Math.hypot(opp.x - p.x, opp.z - p.z);
              const oppBallDist = Math.hypot(opp.x - ball.x, opp.z - ball.z);
              if (dOpp < 1.15 && oppBallDist < 2.8) {
                // Check if tackle is from behind or violent or clumsy attacker tackle
                const slideDirX = Math.sin(p.yaw);
                const slideDirZ = Math.cos(p.yaw);
                const oppDirX = Math.sin(opp.yaw);
                const oppDirZ = Math.cos(opp.yaw);
                const fromBehindDot = slideDirX * oppDirX + slideDirZ * oppDirZ;
                const isFromBehind = fromBehindDot > 0.22;

                const foulRiskMult = 1 / Math.max(0.4, roleCfg.slidePrecision);
                const foulChance =
                  (isFromBehind ? 0.92 : p.slideViolent ? 0.78 : 0.45) * foulRiskMult;
                if (rng.next() < foulChance) {
                  p.slideHasFouled = true;
                  opp.slideTimer = 0.45; // Opponent knocked down by the foul!
                  triggerComicImpact(opp.x, 0.8, opp.z, 1.35, 8);

                  const inPenaltyBox = isInsideOwnPenaltyBox(opp.x, opp.z, p.team, dims);
                  if (inPenaltyBox) {
                    setupSetPiece(
                      'penalty',
                      opp.team,
                      opp.x,
                      opp.z,
                      isFromBehind
                        ? 'FALLO DA DIETRO IN AREA! CALCIO DI RIGORE!'
                        : 'SCIVOLATA FALLOSA IN AREA! CALCIO DI RIGORE!',
                      `Intervento sul giocatore anziché sulla palla: Rigore per ${
                        opp.team === 'blue' ? 'gli Azzurri' : 'i Rivali'
                      }!`,
                    );
                  } else {
                    setupSetPiece(
                      'free_kick',
                      opp.team,
                      opp.x,
                      opp.z,
                      isFromBehind
                        ? 'FALLO DA DIETRO! PUNIZIONE CON BARRIERA!'
                        : 'SCIVOLATA SULL’UOMO! PUNIZIONE CON BARRIERA!',
                      'Hai colpito le gambe dell’avversario senza prendere il pallone: barriera schierata!',
                    );
                  }
                  return;
                }
              }
            }
          }
        }

        // Ball Dribbling, Kicking, Passing, Aerial Header & Over-Dribbling Steal Exposure
        if (dBall < 1.45 && ball.y < p.y + 1.95 && !isBallLockedByGag) {
          // Cappello (+1) recovery check
          if (pendingCappello) {
            if (p.team !== pendingCappello.attackerTeam) {
              pendingCappello = null;
            } else if (
              st.ruleCappelloEnabled &&
              simSteps <= pendingCappello.expiresAtStep &&
              simSteps > pendingCappello.passedStep + 4
            ) {
              const pairKey = `cappello_${pendingCappello.attackerId}_${pendingCappello.defenderId}`;
              if (simSteps >= (trickPairCooldown.get(pairKey) ?? 0)) {
                trickPairCooldown.set(pairKey, simSteps + 180);
                if (p.team === 'blue') {
                  scoreBlue += 1;
                  stylePointsBlue += 1;
                } else {
                  scoreRed += 1;
                  stylePointsRed += 1;
                }
                trickPopup = { label: 'CAPPELLO +1', team: p.team };
                trickPopupSteps = 48;
                soundEngine.playTrickCheer();
                sendReliableGameEvent({
                  kind: 'trick_score',
                  label: 'CAPPELLO +1',
                  team: p.team,
                  scoreBlue,
                  scoreRed,
                  stylePointsBlue,
                  stylePointsRed,
                  simSteps,
                });
              }
              pendingCappello = null;
            }
          }

          const prof = BALL_PROFILES[st.ballProfile];
          const effectiveMass = prof.mass * (1 + ball.mudBonusMass);
          const massFactor = 0.43 / effectiveMass;
          ball.lastTouchTeam = p.team;
          ball.lastTouchPlayerId = p.id;
          ball.lastTouchStep = simSteps;
          ball.lastTouchX = p.x;
          ball.lastTouchZ = p.z;

          const kickDirX = Math.sin(p.yaw);
          const kickDirZ = Math.cos(p.yaw);

          // Aerial Header ("Colpo di Testa") if player jumped with Spacebar while ball is high!
          if (p.y > 0.25 && ball.y > 0.95) {
            ball.vx = kickDirX * 16.5 + p.vx * 0.4;
            ball.vz = kickDirZ * 16.5 + p.vz * 0.4;
            ball.vy = 3.2;
            p.kickAnimTimer = 0.25;
            soundEngine.playKick(st.ballProfile, 0.72);
            triggerComicImpact(ball.x, ball.y, ball.z, 1.05, 6);
            setPieceState = null;
            return;
          }

          if (isBlueControlled && p1Input) {
            // Aim direction combines player walking heading + Mouse Aim offset
            const aimYaw =
              st.cameraMode === 'fps'
                ? p.yaw
                : p.yaw + p1Input.mouseAimYaw * 0.72;
            const aimDirX = Math.sin(aimYaw);
            const aimDirZ = Math.cos(aimYaw);
            const precisionJitter = (1 - roleCfg.shotPrecision) * rng.range(-0.32, 0.32);
            const finalDirX = Math.sin(aimYaw + precisionJitter);
            const finalDirZ = Math.cos(aimYaw + precisionJitter);

            if (p1Input.shootJustReleased) {
              // If Free Kick Wall is active, make the wall jump when the shot is taken!
              if (setPieceState) {
                setPieceState.wallPlayerIds.forEach((wid) => {
                  const wp = players.find((pl) => pl.id === wid);
                  if (wp && wp.y <= 0.02) wp.vy = 5.8;
                });
                setPieceState = null;
              }

              if (p1Input.shootCharge < 0.22) {
                // Single Left Click = Quick Pass or Low Kick aimed with mouse
                const mates = players.filter((m) => m.team === 'blue' && m !== p);
                let passDirX = aimDirX;
                let passDirZ = aimDirZ;
                let bestScore = -1;
                for (const m of mates) {
                  const mx = m.x - p.x;
                  const mz = m.z - p.z;
                  const mLen = Math.hypot(mx, mz) || 1;
                  const dot = (mx / mLen) * aimDirX + (mz / mLen) * aimDirZ;
                  if (dot > 0.55 && dot > bestScore) {
                    bestScore = dot;
                    passDirX = mx / mLen;
                    passDirZ = mz / mLen;
                  }
                }
                ball.vx = passDirX * 16.0;
                ball.vz = passDirZ * 16.0;
                ball.vy = 1.2 + Math.max(0, p1Input.mouseAimPitch) * 2.2;
                p.kickAnimTimer = 0.26;
                soundEngine.playKick(st.ballProfile, 0.55);
                triggerComicImpact(ball.x, ball.y + 0.2, ball.z, 0.78, 4);
              } else {
                // Held Left Click & Release = Charged Shot aimed by Mouse (angle & height vary with mouse aim!)
                const pwr =
                  THREE.MathUtils.lerp(14, 28.5, p1Input.shootCharge) * Math.pow(massFactor, 0.35);
                const pitchElevation =
                  st.cameraMode === 'fps'
                    ? THREE.MathUtils.clamp((p.pitchLook + 0.35) * 1.4, 0, 1.2)
                    : THREE.MathUtils.clamp((p1Input.mouseAimPitch + 0.6) * 0.85, 0.1, 1.35);
                ball.vx = finalDirX * pwr + p.vx * 0.3;
                ball.vz = finalDirZ * pwr + p.vz * 0.3;
                ball.vy = THREE.MathUtils.lerp(2.2, 8.8, p1Input.shootCharge * 0.65 + pitchElevation * 0.45);
                ball.spinY = (p1Input.moveX || p1Input.mouseAimYaw) * 7.8;
                p.kickAnimTimer = 0.34;
                soundEngine.playKick(st.ballProfile, p1Input.shootCharge);
                triggerComicImpact(ball.x, ball.y + 0.25, ball.z, 0.95 + p1Input.shootCharge * 0.65, 7);
              }
              p.dribbleExposure = 0;
            } else if (p1Input.passJustPressed) {
              const mates = players.filter((m) => m.team === 'blue' && m !== p);
              let passDirX = aimDirX;
              let passDirZ = aimDirZ;
              if (mates.length > 0) {
                const targetMate = mates[0];
                const mx = targetMate.x - p.x;
                const mz = targetMate.z - p.z;
                const mLen = Math.hypot(mx, mz) || 1;
                passDirX = mx / mLen;
                passDirZ = mz / mLen;
              }
              ball.vx = passDirX * 15.5;
              ball.vz = passDirZ * 15.5;
              ball.vy = 1.1;
              p.kickAnimTimer = 0.25;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, 0.55);
              triggerComicImpact(ball.x, ball.y + 0.2, ball.z, 0.75, 4);
            } else if (p1Input.lobJustPressed) {
              ball.vx = aimDirX * 11.5;
              ball.vz = aimDirZ * 11.5;
              ball.vy = 9.4;
              p.kickAnimTimer = 0.3;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, 0.65);
              triggerComicImpact(ball.x, ball.y + 0.3, ball.z, 0.9, 5);
            } else if (p1Input.rightClickSingle) {
              // Single Right Click while holding ball = Quick Body Feint ("Finta di corpo")
              p.feintTimer = 0.28;
              const sideSign = p1Input.moveX !== 0 ? Math.sign(p1Input.moveX) : 1;
              const rightX = Math.cos(p.yaw) * sideSign;
              const rightZ = -Math.sin(p.yaw) * sideSign;
              p.vx += rightX * 5.8;
              p.vz += rightZ * 5.8;
              ball.x = p.x + kickDirX * 0.85 + rightX * 0.45;
              ball.z = p.z + kickDirZ * 0.85 + rightZ * 0.45;
              soundEngine.playKick(st.ballProfile, 0.28);
            } else if (p1Input.rightClickHeld) {
              // Held Right Click while holding ball = Continuous Skill Dribbling
              // The longer you hold RMB, the more you dribble, but dribbleExposure rises and exposes you to ball theft!
              p.dribbleExposure = Math.min(1, p.dribbleExposure + fixedDt * 0.65);
              const weave = Math.sin(simTime * 18) * 0.42;
              const rightX = Math.cos(p.yaw);
              const rightZ = -Math.sin(p.yaw);
              const dribbleDist = 0.72 + p.dribbleExposure * 0.42;
              ball.x = THREE.MathUtils.damp(
                ball.x,
                p.x + kickDirX * dribbleDist + rightX * weave,
                18,
                fixedDt,
              );
              ball.z = THREE.MathUtils.damp(
                ball.z,
                p.z + kickDirZ * dribbleDist + rightZ * weave,
                18,
                fixedDt,
              );
              ball.vx = p.vx * 1.05;
              ball.vz = p.vz * 1.05;
            } else if (!setPieceState) {
              p.dribbleExposure = Math.max(0, p.dribbleExposure - fixedDt * 1.8);
              const dribbleDist = 0.78;
              ball.x = THREE.MathUtils.damp(ball.x, p.x + kickDirX * dribbleDist, 14, fixedDt);
              ball.z = THREE.MathUtils.damp(ball.z, p.z + kickDirZ * dribbleDist, 14, fixedDt);
              ball.vx = p.vx * 1.08;
              ball.vz = p.vz * 1.08;
            }
          } else if (isRedControlled && p2Input) {
            if (p2Input.shootJustReleased) {
              const pwr = THREE.MathUtils.lerp(13, 26, p2Input.shootCharge);
              ball.vx = kickDirX * pwr;
              ball.vz = kickDirZ * pwr;
              ball.vy = THREE.MathUtils.lerp(2.5, 7.2, p2Input.shootCharge);
              p.kickAnimTimer = 0.32;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, p2Input.shootCharge);
              triggerComicImpact(ball.x, ball.y + 0.25, ball.z, 0.95 + p2Input.shootCharge * 0.65, 7);
            } else if (p2Input.passJustPressed) {
              ball.vx = kickDirX * 15;
              ball.vz = kickDirZ * 15;
              ball.vy = 1.1;
              p.kickAnimTimer = 0.25;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, 0.5);
              triggerComicImpact(ball.x, ball.y + 0.2, ball.z, 0.75, 4);
            } else if (p2Input.lobJustPressed) {
              ball.vx = kickDirX * 11;
              ball.vz = kickDirZ * 11;
              ball.vy = 9.0;
              p.kickAnimTimer = 0.3;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, 0.6);
              triggerComicImpact(ball.x, ball.y + 0.3, ball.z, 0.9, 5);
            } else if (!setPieceState) {
              ball.vx = p.vx * 1.05 + kickDirX * 1.5;
              ball.vz = p.vz * 1.05 + kickDirZ * 1.5;
            }
          } else {
            // Bot AI Action (steals ball easily if user over-dribbles with high dribbleExposure!)
            const userPlayer = players[activeBlueIdx];
            if (
              p.team === 'red' &&
              userPlayer &&
              userPlayer.dribbleExposure > 0.38 &&
              Math.hypot(p.x - userPlayer.x, p.z - userPlayer.z) < 1.85
            ) {
              userPlayer.dribbleExposure = 0;
              lastBanner = {
                title: 'PALLA PERSA PER TROPPO DRIBBLING!',
                subtitle: 'Tenere premuto a lungo il tasto destro ti ha esposto al recupero del difensore!',
              };
              lastBannerTimer = 2.4;
            }

            if (p.isGoalkeeper && isInsideOwnPenaltyBox(ball.x, ball.z, p.team, dims)) {
              // Bot Goalkeeper Save & Clearance
              soundEngine.playSaveSound();
              const clearDir = p.team === 'blue' ? 1 : -1;
              ball.vx = clearDir * 17.5;
              ball.vz = rng.range(-4.5, 4.5);
              ball.vy = 4.6;
              p.kickAnimTimer = 0.32;
              setPieceState = null;
              return;
            }

            const targetGoalX = p.team === 'blue' ? dims.halfX : -dims.halfX;
            const spread = (1 - botCfg.shotAccuracy) * 2.8;
            const gx = targetGoalX - p.x;
            const gz = rng.range(-dims.goalHalfW * 0.8 - spread, dims.goalHalfW * 0.8 + spread) - p.z;
            const gLen = Math.hypot(gx, gz) || 1;

            if (setPieceState && setPieceState.attackingTeam === p.team) {
              ball.vx = (gx / gLen) * 20.5;
              ball.vz = (gz / gLen) * 20.5;
              ball.vy = 4.2;
              p.kickAnimTimer = 0.32;
              setPieceState = null;
              soundEngine.playKick(st.ballProfile, 0.78);
            } else if (Math.abs(targetGoalX - p.x) < dims.halfX * 0.72 && rng.next() < 0.09 * botCfg.reactionRate) {
              ball.vx = (gx / gLen) * (17.5 * botCfg.speedMultiplier);
              ball.vz = (gz / gLen) * (17.5 * botCfg.speedMultiplier);
              ball.vy = 3.0 + rng.next() * 2.6;
              p.kickAnimTimer = 0.3;
              soundEngine.playKick(st.ballProfile, 0.7);
            } else if (rng.next() < botCfg.passProbability * 0.12) {
              // Bot passes to a better-positioned teammate
              const forwardMates = players.filter(
                (m) =>
                  m.team === p.team &&
                  m !== p &&
                  !m.isGoalkeeper &&
                  (p.team === 'blue' ? m.x > p.x + 1.5 : m.x < p.x - 1.5),
              );
              if (forwardMates.length > 0) {
                const mate = forwardMates[0];
                const mx = mate.x - p.x;
                const mz = mate.z - p.z;
                const mLen = Math.hypot(mx, mz) || 1;
                ball.vx = (mx / mLen) * 14.5;
                ball.vz = (mz / mLen) * 14.5;
                ball.vy = 1.1;
                p.kickAnimTimer = 0.24;
                soundEngine.playKick(st.ballProfile, 0.5);
              } else {
                ball.vx = (gx / gLen) * 7.2 * botCfg.speedMultiplier;
                ball.vz = (gz / gLen) * 7.2 * botCfg.speedMultiplier;
              }
            } else {
              ball.vx = (gx / gLen) * 7.2 * botCfg.speedMultiplier;
              ball.vz = (gz / gLen) * 7.2 * botCfg.speedMultiplier;
            }
          }
        }
      });

      // Update Ball Physics
      const bProf = BALL_PROFILES[st.ballProfile];
      const ballCapturedByGag =
        ball.hiddenByGag ||
        gagState.activeGagId === 'palla_tetto' ||
        gagState.activeGagId === 'tombino_fogna' ||
        gagState.activeGagId === 'cane_palla' ||
        gagState.activeGagId === 'gabbiano_palla';

      if (!ballCapturedByGag) {
        if (bProf.deflate && ball.currentRadius > bProf.deflate.minRadius) {
          ball.currentRadius = Math.max(
            bProf.deflate.minRadius,
            ball.currentRadius - bProf.deflate.rate * fixedDt,
          );
        }

        const speedXZ = Math.hypot(ball.vx, ball.vz);
        const totalSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);

        if (
          pitchCfg.allowsMudAccumulation &&
          wCfg.mudAccumulationRate > 0 &&
          ball.y <= ball.currentRadius + 0.04 &&
          (speedXZ > 0.15 || Math.abs(ball.vy) > 0.3)
        ) {
          ball.mudBonusMass = Math.min(
            wCfg.mudMaxMassBonus,
            ball.mudBonusMass + wCfg.mudAccumulationRate * fixedDt,
          );
        }

        // 1. Gravity
        ball.vy -= 17.5 * fixedDt;

        // 2. Wind Vector * Ball Wind Factor
        const mudInvMass = 1 / (1 + ball.mudBonusMass);
        ball.vx += wCfg.windVector[0] * bProf.windFactor * 0.25 * mudInvMass * fixedDt;
        ball.vz += wCfg.windVector[2] * bProf.windFactor * 0.25 * mudInvMass * fixedDt;

        // 3. Magnus Effect (Lateral Spin Curve)
        if (speedXZ > 1.5 && Math.abs(ball.spinY) > 0.05) {
          const perpX = -ball.vz / speedXZ;
          const perpZ = ball.vx / speedXZ;
          const magnusForce = ball.spinY * bProf.magnus * 1.4 * mudInvMass;
          ball.vx += perpX * magnusForce * fixedDt;
          ball.vz += perpZ * magnusForce * fixedDt;
          ball.spinY *= Math.pow(0.45, fixedDt);
        }

        // 4. Aerodynamic Wobble
        if (bProf.wobble && totalSpeed > bProf.wobble.speedMin && ball.y > 0.55) {
          const perpX = -ball.vz / (speedXZ || 1);
          const perpZ = ball.vx / (speedXZ || 1);
          const wobbleOsc =
            Math.sin(simTime * bProf.wobble.freqHz * Math.PI * 2) + rng.range(-0.18, 0.18);
          ball.vx += perpX * wobbleOsc * bProf.wobble.force * mudInvMass * fixedDt;
          ball.vz += perpZ * wobbleOsc * bProf.wobble.force * mudInvMass * fixedDt;
        }

        // 5. Air & Ground Rolling Drag
        const drag = Math.pow(1 - bProf.linearDrag, fixedDt * 60);
        ball.vx *= drag;
        ball.vz *= drag;

        if (ball.y <= ball.currentRadius + 0.03) {
          const effectiveRollFriction = Math.min(
            0.95,
            bProf.rollFriction *
              pitchCfg.groundFriction *
              wCfg.ballRollFrictionMultiplier *
              (1 + ball.mudBonusMass * 0.6),
          );
          const rollDrag = Math.pow(1 - effectiveRollFriction, fixedDt * 60);
          ball.vx *= rollDrag;
          ball.vz *= rollDrag;
        }

        ball.x += ball.vx * fixedDt;
        ball.y += ball.vy * fixedDt;
        ball.z += ball.vz * fixedDt;
        ball.rotX += ball.vz * fixedDt * 2.1;
        ball.rotZ -= ball.vx * fixedDt * 2.1;

        // 6. Geometric Detection of Street Rules: TUNNEL (+1) and CAPPELLO (+1)
        if (simSteps - ball.lastTouchStep <= 135) {
          const attacker = players.find((pl) => pl.id === ball.lastTouchPlayerId);

          if (st.ruleTunnelEnabled && Math.min(ball.prevY, ball.y) <= Math.max(0.45, ball.currentRadius + 0.05)) {
            for (const def of players) {
              if (def.team === ball.lastTouchTeam) continue;
              const pairKey = `tunnel_${ball.lastTouchPlayerId}_${def.id}`;
              if (simSteps < (trickPairCooldown.get(pairKey) ?? 0)) continue;

              const distTouchToDef = Math.hypot(ball.lastTouchX - def.x, ball.lastTouchZ - def.z);
              const distAttToDef = attacker ? Math.hypot(attacker.x - def.x, attacker.z - def.z) : distTouchToDef;
              if (Math.min(distTouchToDef, distAttToDef) > 2.6) continue;

              const fwdX = Math.sin(def.yaw);
              const fwdZ = Math.cos(def.yaw);
              const rightX = Math.cos(def.yaw);
              const rightZ = -Math.sin(def.yaw);

              const dx0 = ball.prevX - def.x;
              const dz0 = ball.prevZ - def.z;
              const s0 = dx0 * fwdX + dz0 * fwdZ;
              const u0 = dx0 * rightX + dz0 * rightZ;

              const dx1 = ball.x - def.x;
              const dz1 = ball.z - def.z;
              const s1 = dx1 * fwdX + dz1 * fwdZ;
              const u1 = dx1 * rightX + dz1 * rightZ;

              if ((s0 <= 0 && s1 > 0) || (s0 >= 0 && s1 < 0)) {
                const denom = s0 - s1;
                const tCross = Math.abs(denom) > 1e-6 ? s0 / denom : 0.5;
                const uCross = u0 + tCross * (u1 - u0);
                if (Math.abs(uCross) <= 0.46) {
                  pendingTunnel = {
                    attackerId: ball.lastTouchPlayerId,
                    attackerTeam: ball.lastTouchTeam,
                    defenderId: def.id,
                    exitSign: s1 >= s0 ? 1 : -1,
                    crossStep: simSteps,
                  };
                }
              }

              if (
                pendingTunnel &&
                pendingTunnel.defenderId === def.id &&
                simSteps - pendingTunnel.crossStep <= 24 &&
                s1 * pendingTunnel.exitSign >= 0.16 &&
                Math.hypot(dx1, dz1) <= 1.5
              ) {
                trickPairCooldown.set(pairKey, simSteps + 180);
                if (pendingTunnel.attackerTeam === 'blue') {
                  scoreBlue += 1;
                  stylePointsBlue += 1;
                } else {
                  scoreRed += 1;
                  stylePointsRed += 1;
                }
                trickPopup = { label: 'TUNNEL +1', team: pendingTunnel.attackerTeam };
                trickPopupSteps = 48;
                soundEngine.playTrickCheer();
                sendReliableGameEvent({
                  kind: 'trick_score',
                  label: 'TUNNEL +1',
                  team: pendingTunnel.attackerTeam,
                  scoreBlue,
                  scoreRed,
                  stylePointsBlue,
                  stylePointsRed,
                  simSteps,
                });
                pendingTunnel = null;
              }
            }
          }

          if (st.ruleCappelloEnabled) {
            const segDx = ball.x - ball.prevX;
            const segDz = ball.z - ball.prevZ;
            const segLenSq = segDx * segDx + segDz * segDz;
            for (const def of players) {
              if (def.team === ball.lastTouchTeam) continue;
              const pairKey = `cappello_${ball.lastTouchPlayerId}_${def.id}`;
              if (simSteps < (trickPairCooldown.get(pairKey) ?? 0)) continue;

              const tProj =
                segLenSq > 1e-6
                  ? THREE.MathUtils.clamp(
                      ((def.x - ball.prevX) * segDx + (def.z - ball.prevZ) * segDz) / segLenSq,
                      0,
                      1,
                    )
                  : 1;
              const closestX = ball.prevX + tProj * segDx;
              const closestZ = ball.prevZ + tProj * segDz;
              const closestY = ball.prevY + tProj * (ball.y - ball.prevY);
              const horizDist = Math.hypot(closestX - def.x, closestZ - def.z);

              if (horizDist <= 1.2 && closestY >= 1.8 && closestY <= 4.0) {
                pendingCappello = {
                  attackerId: ball.lastTouchPlayerId,
                  attackerTeam: ball.lastTouchTeam,
                  defenderId: def.id,
                  passedStep: simSteps,
                  expiresAtStep: simSteps + 150,
                };
              }
            }
          }
        }

        // Ground Bounce
        if (ball.y < ball.currentRadius) {
          const impactSpeed = Math.abs(ball.vy);
          ball.y = ball.currentRadius;
          if (impactSpeed > 1.4) {
            if (pitchCfg.allowsMudAccumulation && wCfg.mudAccumulationRate > 0) {
              ball.mudBonusMass = Math.min(
                wCfg.mudMaxMassBonus,
                ball.mudBonusMass + wCfg.mudAccumulationRate * 3 * fixedDt,
              );
            }
            soundEngine.playBounce(
              st.ballProfile,
              impactSpeed,
              st.weather === 'fango' || pitchCfg.muffledBounceAudio,
            );
            ball.vy =
              impactSpeed *
              bProf.restitution *
              wCfg.ballRestitutionMultiplier *
              pitchCfg.ballRestitutionMultiplier *
              (1 / (1 + ball.mudBonusMass * 0.35));
            if (st.ballProfile === 'bucato') {
              ball.vx += rng.range(-1.1, 1.1);
              ball.vz += rng.range(-1.1, 1.1);
            }
          } else {
            ball.vy = 0;
          }
        }

        // Goalpost Collisions
        for (const post of envRefs.goalPosts) {
          const dx = ball.x - post.x;
          const dz = ball.z - post.z;
          const distPost = Math.hypot(dx, dz);
          if (distPost < 0.72 && ball.y < 2.45) {
            soundEngine.playPostHit();
            triggerComicImpact(post.x, Math.max(0.8, ball.y), post.z, 1.35, 9);
            const nx = dx / (distPost || 1);
            const nz = dz / (distPost || 1);
            ball.x = post.x + nx * 0.75;
            ball.z = post.z + nz * 0.75;
            ball.vx = nx * Math.max(6, speedXZ * 0.85);
            ball.vz = nz * Math.max(6, speedXZ * 0.85);

            if (ball.lastTouchTeam === 'blue') {
              paliBlue += 1;
              if (st.streetRule === 'tre_pali' && paliBlue % 3 === 0) {
                scoreBlue += 1;
                soundEngine.playGoalCheer();
                lastBanner = {
                  title: '3 PALI = GOL AZZURRI!',
                  subtitle: 'Terzo palo colpito: scatta il gol automatico secondo la regola del cortile!',
                };
                lastBannerTimer = 3.5;
                sendReliableGameEvent({
                  kind: 'goal',
                  scoredByTeam: 'blue',
                  scoreBlue,
                  scoreRed,
                  paliBlue,
                  paliRed,
                  bonusPoints: 1,
                  simSteps,
                });
              } else {
                lastBanner = {
                  title: 'PALO PIENO!',
                  subtitle: `Scheggiato il palo! (Pali Blu: ${paliBlue})`,
                };
                lastBannerTimer = 2.2;
              }
            } else {
              paliRed += 1;
              if (st.streetRule === 'tre_pali' && paliRed % 3 === 0) {
                scoreRed += 1;
                soundEngine.playGoalCheer();
                sendReliableGameEvent({
                  kind: 'goal',
                  scoredByTeam: 'red',
                  scoreBlue,
                  scoreRed,
                  paliBlue,
                  paliRed,
                  bonusPoints: 1,
                  simSteps,
                });
              }
            }
          }
        }

        // Goal Detection scaled to dims.halfX and dims.goalHalfW
        if (
          Math.abs(ball.x) > dims.halfX &&
          Math.abs(ball.z) < dims.goalHalfW &&
          ball.y < 2.45 &&
          goalCelebrationTimer <= 0
        ) {
          const scoredByBlue = ball.x > dims.halfX;
          const bonusSponda = st.streetRule === 'palla_avvelenata' && ball.bouncedOffWall ? 2 : 1;

          if (scoredByBlue) {
            scoreBlue += bonusSponda;
            lastBanner = {
              title: bonusSponda > 1 ? 'GOL DI SPONDA DOPPIO! (+2)' : 'GOOOL DEGLI AZZURRI!',
              subtitle:
                st.streetRule === 'chi_segna_vince'
                  ? 'Regola Chi Segna Vince: Vittoria immediata!'
                  : `Palla insaccata con il ${bProf.name}!`,
            };
            lastBannerTimer = 3.6;
          } else {
            scoreRed += bonusSponda;
            lastBanner = {
              title: bonusSponda > 1 ? 'GOL DI SPONDA RIVALI! (+2)' : 'GOL DEI RIVALI DEL RIONE!',
              subtitle: 'Palla in rete!',
            };
            lastBannerTimer = 3.6;
          }

          soundEngine.playGoalCheer();
          goalCelebrationTimer = 2.0;
          sendReliableGameEvent({
            kind: 'goal',
            scoredByTeam: scoredByBlue ? 'blue' : 'red',
            scoreBlue,
            scoreRed,
            paliBlue,
            paliRed,
            bonusPoints: bonusSponda,
            simSteps,
          });
          resetPositions(scoredByBlue ? 'red' : 'blue');
        }

        // Per-Pitch Gag Volume Triggers
        if (st.gagsEnabled && gagState.activeGagId === null) {
          if (ball.z < -dims.halfZ + 0.5 && ball.x > -10.8 && ball.x < -5.2 && ball.y > 1.8) {
            tryTriggerGag(gagState, 'vecchia_buca', simSteps, rng, gagRegistry, {}, false, st.pitch, onHostGagStateChanged);
          } else if (ball.z < -dims.halfZ + 0.5 && ball.x > 5.2 && ball.x < 9.8 && ball.y > 1.8) {
            tryTriggerGag(gagState, 'finestra_rotta', simSteps, rng, gagRegistry, {}, false, st.pitch, onHostGagStateChanged);
          } else if (ball.z < -dims.halfZ + 1.0 && ball.y > 5.8) {
            tryTriggerGag(gagState, 'palla_tetto', simSteps, rng, gagRegistry, {}, false, st.pitch, onHostGagStateChanged);
          } else if (ball.z > dims.halfZ - 0.5 && ball.x < -8.2) {
            tryTriggerGag(gagState, 'allarme_auto', simSteps, rng, gagRegistry, {}, false, st.pitch, onHostGagStateChanged);
          } else if (
            Math.hypot(ball.x - dims.halfX * 0.6, ball.z - (dims.halfZ - 1.0)) < 0.78 &&
            ball.y < 0.5 &&
            speedXZ < 5.5
          ) {
            tryTriggerGag(gagState, 'tombino_fogna', simSteps, rng, gagRegistry, {}, false, st.pitch, onHostGagStateChanged);
          } else if (st.pitch === 'spiaggia' && ball.z < -6.8 && (ball.y > 1.6 || speedXZ < 2.2)) {
            tryTriggerGag(
              gagState,
              'gabbiano_palla',
              simSteps,
              rng,
              gagRegistry,
              { targetX: ball.x, targetY: ball.y, targetZ: ball.z, grabbed: false },
              false,
              st.pitch,
              onHostGagStateChanged,
            );
          }

          const distToDog = Math.hypot(ball.x - envRefs.dogRig.homeX, ball.z - envRefs.dogRig.homeZ);
          if (
            ball.y < 0.55 &&
            speedXZ < 2.4 &&
            (distToDog < 4.2 || (ball.z > dims.halfZ - 3.0 && Math.abs(ball.x - envRefs.dogRig.homeX) < 5.2))
          ) {
            gagState.dogNearBallSteps += 1;
            if (gagState.dogNearBallSteps >= 35) {
              gagState.dogNearBallSteps = 0;
              tryTriggerGag(
                gagState,
                'cane_palla',
                simSteps,
                rng,
                gagRegistry,
                { targetX: ball.x, targetZ: ball.z, grabbed: false },
                false,
                st.pitch,
                onHostGagStateChanged,
              );
            }
          } else {
            gagState.dogNearBallSteps = 0;
          }
        } else {
          gagState.dogNearBallSteps = 0;
        }

        // Perimeter Bounce Walls ("Sponda") scaled to dims.halfX and dims.halfZ
        if (Math.abs(ball.z) > dims.halfZ) {
          ball.z = Math.sign(ball.z) * dims.halfZ;
          ball.vz = -ball.vz * pitchCfg.wallRestitution;
          ball.bouncedOffWall = true;
          triggerComicImpact(ball.x, Math.max(0.6, ball.y), ball.z, 1.0, 5);
          soundEngine.playBounce(
            st.ballProfile,
            Math.abs(ball.vz),
            st.weather === 'fango' || pitchCfg.muffledBounceAudio,
          );
        }
        if (Math.abs(ball.x) > dims.halfX + 0.3 && Math.abs(ball.z) >= dims.goalHalfW) {
          ball.x = Math.sign(ball.x) * (dims.halfX + 0.3);
          ball.vx = -ball.vx * pitchCfg.wallRestitution;
          ball.bouncedOffWall = true;
          triggerComicImpact(ball.x, Math.max(0.6, ball.y), ball.z, 1.0, 5);
          soundEngine.playBounce(
            st.ballProfile,
            Math.abs(ball.vx),
            st.weather === 'fango' || pitchCfg.muffledBounceAudio,
          );
        }
      }

      // Broadcast Host WorldSnapshotPayload at 25Hz
      networkBroadcastAccumulator += fixedDt;
      if (
        st.gameMode === 'online_lan' &&
        st.isOnlineHost &&
        st.onlineRoomCode &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        networkBroadcastAccumulator >= 0.04
      ) {
        networkBroadcastAccumulator = 0;
        snapshotsReceivedInWindow += 1;
        wsRef.current.send(
          JSON.stringify({
            type: 'world_state',
            state: buildHostWorldSnapshot(),
          }),
        );
      }
    };

    const tick = () => {
      const now = performance.now();
      const rawDt = Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
      const frameDt = Math.min(rawDt, 0.05);

      const st = stateRef.current;

      if (st.isPlaying && !wasPlaying) {
        matchStartGraceUntil = now + 3000;
        lowFpsAccumSec = 0;
        highFpsAccumSec = 0;
      }
      wasPlaying = st.isPlaying;

      snapshotsWindowTimer += frameDt;
      if (snapshotsWindowTimer >= 1.0) {
        snapshotsPerSec = Math.round(snapshotsReceivedInWindow / snapshotsWindowTimer);
        snapshotsReceivedInWindow = 0;
        snapshotsWindowTimer = 0;
      }

      // 2-second moving window for FPS + Auto-Scale with hysteresis
      if (rawDt > 0 && rawDt < 0.5 && now >= visibilityResumeGraceUntil) {
        const writeIdx = (fpsRingHead + fpsRingCount) & 255;
        fpsRingTimestamps[writeIdx] = now;
        if (fpsRingCount < 256) {
          fpsRingCount += 1;
        } else {
          fpsRingHead = (fpsRingHead + 1) & 255;
        }
        while (fpsRingCount > 1 && now - fpsRingTimestamps[fpsRingHead] > 2000) {
          fpsRingHead = (fpsRingHead + 1) & 255;
          fpsRingCount -= 1;
        }
        if (fpsRingCount >= 2) {
          const oldest = fpsRingTimestamps[fpsRingHead];
          const windowSec = (now - oldest) / 1000;
          if (windowSec >= 0.25) {
            autoScaleFpsAvg = Math.min(120, Math.round((fpsRingCount - 1) / windowSec));
          }
        }
      }

      if (
        st.autoRenderScale &&
        st.isPlaying &&
        !st.isPaused &&
        !isSoftwareGl &&
        now >= matchStartGraceUntil &&
        now >= visibilityResumeGraceUntil &&
        now >= scaleCooldownUntil
      ) {
        if (autoScaleFpsAvg < 32) {
          lowFpsAccumSec += rawDt;
          highFpsAccumSec = 0;
          if (lowFpsAccumSec >= 3.0) {
            lowFpsAccumSec = 0;
            const curIdx = RENDER_SCALE_LEVELS.indexOf(
              lastRenderedScale as (typeof RENDER_SCALE_LEVELS)[number],
            );
            const resolvedIdx = curIdx >= 0 ? curIdx : 2;
            if (resolvedIdx > 0) {
              const nextScale = RENDER_SCALE_LEVELS[resolvedIdx - 1];
              lastRenderedScale = nextScale;
              renderer.setPixelRatio(baseRatio * nextScale);
              callbacksRef.current.onRenderScaleChange(nextScale);
              scaleCooldownUntil = now + 5000;
            }
          }
        } else if (autoScaleFpsAvg > 55) {
          highFpsAccumSec += rawDt;
          lowFpsAccumSec = 0;
          if (highFpsAccumSec >= 5.0) {
            highFpsAccumSec = 0;
            const curIdx = RENDER_SCALE_LEVELS.indexOf(
              lastRenderedScale as (typeof RENDER_SCALE_LEVELS)[number],
            );
            const resolvedIdx = curIdx >= 0 ? curIdx : 0;
            if (resolvedIdx < RENDER_SCALE_LEVELS.length - 1) {
              const nextScale = RENDER_SCALE_LEVELS[resolvedIdx + 1];
              lastRenderedScale = nextScale;
              renderer.setPixelRatio(baseRatio * nextScale);
              callbacksRef.current.onRenderScaleChange(nextScale);
              scaleCooldownUntil = now + 5000;
            }
          }
        } else {
          lowFpsAccumSec = 0;
          highFpsAccumSec = 0;
        }
      } else if (!st.autoRenderScale) {
        lowFpsAccumSec = 0;
        highFpsAccumSec = 0;
      }

      if (st.renderScale !== lastRenderedScale) {
        lastRenderedScale = st.renderScale;
        renderer.setPixelRatio(baseRatio * st.renderScale);
      }

      // Dynamic Pitch, TeamSize, or PlayerCategory rebuild
      if (
        st.pitch !== currentBuiltPitch ||
        st.teamSize !== currentBuiltTeamSize ||
        st.playerCategory !== currentBuiltPlayerCategory
      ) {
        const pitchOrSizeChanged =
          st.pitch !== currentBuiltPitch || st.teamSize !== currentBuiltTeamSize;
        currentBuiltPitch = st.pitch;
        currentBuiltTeamSize = st.teamSize;
        currentBuiltPlayerCategory = st.playerCategory;

        if (pitchOrSizeChanged) {
          scene.remove(envRefs.group);
          envRefs = buildCourtyardEnvironment(currentBuiltPitch, currentBuiltTeamSize, maxAniso);
          scene.add(envRefs.group);
        }
        const nextDims = getEffectivePitchDimensions(currentBuiltPitch, currentBuiltTeamSize);
        buildTeamFormation(currentBuiltTeamSize, currentBuiltPlayerCategory, nextDims);
        if (!PITCH_CONFIGS[currentBuiltPitch].allowsMudAccumulation) {
          ball.mudBonusMass = 0;
        }
        gagState = createInitialGagSystemState();
        ball.hiddenByGag = false;
        resetPositions('blue');
      }

      soundEngine.setBeachWavesActive(st.isPlaying && !st.isPaused && st.pitch === 'spiaggia');

      if (shouldResetMatchRef.current) {
        shouldResetMatchRef.current = false;
        matchStartGraceUntil = now + 3000;
        lowFpsAccumSec = 0;
        highFpsAccumSec = 0;
        rng.reset(st.matchSeed);
        simSteps = 0;
        accumulator = 0;
        scoreBlue = 0;
        scoreRed = 0;
        paliBlue = 0;
        paliRed = 0;
        stylePointsBlue = 0;
        stylePointsRed = 0;
        timeRemaining = 180;
        gagState = createInitialGagSystemState();
        activeGag = null;
        activeGagBannerSteps = 0;
        lastBanner = null;
        lastBannerTimer = 0;
        trickPopup = null;
        trickPopupSteps = 0;
        trickPairCooldown.clear();
        snapshotBuffer.length = 0;
        latestHostSnapshot = null;
        envRefs.windowGlassMesh.visible = true;
        envRefs.carHeadlights.forEach((hl) => {
          hl.visible = true;
        });
        resetPositions('blue');
        soundEngine.playWhistle(false);
      }

      if (manualGagTriggerRef.current) {
        const req = manualGagTriggerRef.current;
        manualGagTriggerRef.current = null;
        if (st.gameMode !== 'online_lan' || st.isOnlineHost) {
          tryTriggerGag(
            gagState,
            req.gag,
            simSteps,
            rng,
            gagRegistry,
            req.gag === 'cane_palla' || req.gag === 'gabbiano_palla'
              ? { targetX: ball.x, targetY: ball.y, targetZ: ball.z, grabbed: false }
              : {},
            true,
            st.pitch,
            onHostGagStateChanged,
          );
        }
      }

      if (st.weather !== lastWeather) {
        lastWeather = st.weather;
        ball.mudBonusMass = 0;
      }

      // Weather lighting + Time-of-Day override (Giorno / Tramonto / Notte)
      const wCfg = WEATHER_CONFIGS[st.weather];
      const isNightOverride = st.timeOfDay === 'notte' && st.weather !== 'notte';
      const isSunsetOverride = st.timeOfDay === 'tramonto' && st.weather === 'sole';

      const skyHex = isNightOverride
        ? '#0f172a'
        : isSunsetOverride
          ? '#fb7185'
          : wCfg.skyColor;
      const fogHex = isNightOverride
        ? '#1e293b'
        : isSunsetOverride
          ? '#fda4af'
          : wCfg.fogColor;

      scene.background = _vec3A.set(0, 0, 0) && new THREE.Color(skyHex);
      if (!scene.fog || !(scene.fog instanceof THREE.Fog)) {
        scene.fog = new THREE.Fog(fogHex, currentFogNear, currentFogFar);
      } else {
        scene.fog.color.set(fogHex);
        scene.fog.near = currentFogNear;
        scene.fog.far = currentFogFar;
      }
      sunLight.color.set(isNightOverride ? '#93c5fd' : isSunsetOverride ? '#fdba74' : wCfg.sunColor);
      sunLight.intensity = isNightOverride ? 1.45 : wCfg.sunIntensity;
      hemiLight.color.set(wCfg.hemiSky);
      hemiLight.groundColor.set(wCfg.hemiGround);
      envRefs.groundMat.color.set(wCfg.groundTint);

      // Weather particles update (Rain, Wind, or Snow)
      weatherParticles.visible =
        st.weather === 'pioggia' || st.weather === 'vento' || st.weather === 'neve';
      if (weatherParticles.visible) {
        particleMat.color.setHex(st.weather === 'neve' ? 0xffffff : 0xbae6fd);
        particleMat.size = st.weather === 'neve' ? 0.22 : 0.14;
        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const vy = st.weather === 'pioggia' ? -18 : st.weather === 'neve' ? -4.2 : -2.2;
        const vx = wCfg.windVector[0] * 1.8;
        for (let i = 0; i < particleCount; i++) {
          arr[i * 3] += vx * frameDt;
          arr[i * 3 + 1] += vy * frameDt;
          if (arr[i * 3 + 1] < 0) {
            arr[i * 3 + 1] = 16;
            arr[i * 3] = (Math.random() - 0.5) * 54;
          }
          if (arr[i * 3] > 28) arr[i * 3] = -28;
          if (arr[i * 3] < -28) arr[i * 3] = 28;
        }
        posAttr.needsUpdate = true;
      }

      if (st.ballProfile !== lastRenderedBallProfile) {
        lastRenderedBallProfile = st.ballProfile;
        ballMat.map = ballTextures[st.ballProfile];
        ballMat.needsUpdate = true;
        ball.currentRadius = BALL_PROFILES[st.ballProfile].visualRadius;
        ball.mudBonusMass = 0;
      }

      if (wCfg.mudMaxMassBonus > 0) {
        _colorMudTarget.set(wCfg.ballMudTint);
        const mudVisualRatio = Math.min(1, 0.28 + (ball.mudBonusMass / wCfg.mudMaxMassBonus) * 0.72);
        ballMat.color.copy(_colorWhite).lerp(_colorMudTarget, mudVisualRatio);
      } else {
        ballMat.color.copy(_colorWhite);
      }

      // Fixed Timestep Accumulator
      accumulator += Math.min(rawDt, 0.25);
      let stepsThisFrame = 0;
      while (accumulator >= FIXED_DT && stepsThisFrame < MAX_STEPS_PER_FRAME) {
        stepPhysics(FIXED_DT);
        accumulator -= FIXED_DT;
        stepsThisFrame += 1;
      }
      if (accumulator >= FIXED_DT) {
        accumulator = 0;
      }
      lastPhysicsSteps = stepsThisFrame;

      const alpha = THREE.MathUtils.clamp(accumulator / FIXED_DT, 0, 1);
      const simTimeRender = (simSteps + alpha) * FIXED_DT;

      const renderBallX = THREE.MathUtils.lerp(ball.prevX, ball.x, alpha);
      const renderBallY = THREE.MathUtils.lerp(ball.prevY, ball.y, alpha);
      const renderBallZ = THREE.MathUtils.lerp(ball.prevZ, ball.z, alpha);
      const renderBallRotX = THREE.MathUtils.lerp(ball.prevRotX, ball.rotX, alpha);
      const renderBallRotZ = THREE.MathUtils.lerp(ball.prevRotZ, ball.rotZ, alpha);

      ballMesh.visible = !ball.hiddenByGag;
      ballShadow.visible = !ball.hiddenByGag;
      ballMesh.position.set(renderBallX, renderBallY, renderBallZ);
      ballMesh.rotation.set(renderBallRotX, 0, renderBallRotZ);
      if (st.ballProfile === 'bucato') {
        ballMesh.scale.set(1.08, 0.72, 1.08);
      } else {
        ballMesh.scale.set(1, 1, 1);
      }

      ballShadow.position.set(renderBallX, 0.02, renderBallZ);
      const shadowScale = Math.max(0.35, 1 - (renderBallY - 0.4) * 0.12);
      ballShadow.scale.set(shadowScale, shadowScale, 1);

      players.forEach((p, idx) => {
        const isBlueControlled = idx === activeBlueIdx;
        const isRedControlled =
          (st.gameMode === 'local_2p' || (st.gameMode === 'online_lan' && st.onlineRoomCode)) &&
          idx === activeRedIdx;

        const rX = THREE.MathUtils.lerp(p.prevX, p.x, alpha);
        const rY = THREE.MathUtils.lerp(p.prevY, p.y, alpha);
        const rZ = THREE.MathUtils.lerp(p.prevZ, p.z, alpha);
        const rYaw = lerpAngle(p.prevYaw, p.yaw, alpha);

        p.rig.root.position.set(rX, rY + (p.slideTimer > 0 ? 0.08 : 0), rZ);
        p.rig.root.rotation.y = rYaw;
        p.rig.upperBodyGroup.rotation.x = p.slideTimer > 0 ? -1.15 : 0;
        p.rig.upperBodyGroup.position.y = p.slideTimer > 0 ? -0.45 : 0;
        p.rig.upperBodyGroup.visible = !(isBlueControlled && st.cameraMode === 'fps');

        const ringMat = p.rig.selectionRing.material as THREE.MeshBasicMaterial;
        if (isBlueControlled) {
          ringMat.color.setHex(0xfacc15);
        } else if (isRedControlled) {
          ringMat.color.setHex(0x38bdf8);
        } else {
          ringMat.color.setHex(p.team === 'blue' ? 0x38bdf8 : 0xf43f5e);
        }

        const moveSpeed = Math.hypot(p.vx, p.vz);
        const swing = Math.sin(simTimeRender * 14 + idx) * Math.min(1, moveSpeed / 5.5) * 0.72;
        if (p.slideTimer > 0) {
          p.rig.leftLeg.rotation.x = -1.25;
          p.rig.rightLeg.rotation.x = 0.85;
          p.rig.leftArm.rotation.z = 0.95;
          p.rig.rightArm.rotation.z = -0.95;
        } else if (p.kickAnimTimer > 0) {
          p.rig.rightLeg.rotation.x = -1.25;
          p.rig.leftLeg.rotation.x = 0.35;
          p.rig.leftArm.rotation.z = 0;
          p.rig.rightArm.rotation.z = 0;
        } else {
          p.rig.leftLeg.rotation.x = swing;
          p.rig.rightLeg.rotation.x = -swing;
          p.rig.leftArm.rotation.z = 0;
          p.rig.rightArm.rotation.z = 0;
        }
        p.rig.leftArm.rotation.x = -swing * 0.75;
        p.rig.rightArm.rotation.x = swing * 0.75;
      });

      // Camera Choreography
      const activePlayer = players[activeBlueIdx] || players[0];
      const activeRenderX = THREE.MathUtils.lerp(activePlayer.prevX, activePlayer.x, alpha);
      const activeRenderY = THREE.MathUtils.lerp(activePlayer.prevY, activePlayer.y, alpha);
      const activeRenderZ = THREE.MathUtils.lerp(activePlayer.prevZ, activePlayer.z, alpha);
      const activeRenderYaw = lerpAngle(activePlayer.prevYaw, activePlayer.yaw, alpha);
      const dims = getEffectivePitchDimensions(st.pitch, st.teamSize);

      let projNeedsUpdate = false;
      if (Math.abs(camera.far - currentCameraFar) > 0.05) {
        camera.far = currentCameraFar;
        projNeedsUpdate = true;
      }

      if (!st.isPlaying) {
        const orbitAngle = now * 0.00022;
        camera.position.set(Math.sin(orbitAngle) * 18, 9.5, Math.cos(orbitAngle) * 18);
        camera.lookAt(0, 1.4, 0);
      } else if (st.cameraMode === 'fps') {
        const speed = Math.hypot(activePlayer.vx, activePlayer.vz);
        const headBob = Math.sin(simTimeRender * 16) * Math.min(1, speed / 6) * 0.055;
        const eyeX = activeRenderX + Math.sin(activeRenderYaw) * 0.18;
        const eyeY = activeRenderY + (activePlayer.slideTimer > 0 ? 1.05 : 1.68) + headBob;
        const eyeZ = activeRenderZ + Math.cos(activeRenderYaw) * 0.18;

        camera.position.set(eyeX, eyeY, eyeZ);

        const lookDist = 10;
        const lookX = eyeX + Math.sin(activeRenderYaw) * Math.cos(activePlayer.pitchLook) * lookDist;
        const lookY = eyeY + Math.sin(activePlayer.pitchLook) * lookDist;
        const lookZ = eyeZ + Math.cos(activeRenderYaw) * Math.cos(activePlayer.pitchLook) * lookDist;
        camera.lookAt(lookX, lookY, lookZ);

        const targetFov = speed > 6.5 ? 76 : 68;
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 8, frameDt);
        projNeedsUpdate = true;
      } else {
        const maxPanX = dims.halfX * 0.65;
        const maxPanZ = dims.halfZ * 0.5;
        const focusX = THREE.MathUtils.clamp(renderBallX * 0.65 + activeRenderX * 0.35, -maxPanX, maxPanX);
        const focusZ = THREE.MathUtils.clamp(renderBallZ * 0.5, -maxPanZ, maxPanZ);

        const heightScale = dims.halfX > 22 ? 15.6 : 12.8;
        const distScale = dims.halfX > 22 ? 22.0 : 18.2;
        _camTargetPos.set(focusX, heightScale, focusZ + distScale);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, 5.5, frameDt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, 5.5, frameDt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, 5.5, frameDt);

        _camLookAt.set(focusX, 0.7, focusZ - 1.2);
        camera.lookAt(_camLookAt);

        if (Math.abs(camera.fov - 52) > 0.2) {
          camera.fov = THREE.MathUtils.damp(camera.fov, 52, 8, frameDt);
          projNeedsUpdate = true;
        }
      }

      if (projNeedsUpdate) {
        camera.updateProjectionMatrix();
      }

      if (starburstTimer > 0) {
        starburstTimer -= frameDt;
        if (starburstTimer <= 0) {
          comicStarburst.visible = false;
        } else {
          comicStarburst.quaternion.copy(camera.quaternion);
          const popScale = starburstBaseScale * (0.85 + Math.sin((starburstTimer / 0.24) * Math.PI) * 0.65);
          comicStarburst.scale.setScalar(popScale);
          comicStarburst.rotateZ(frameDt * 6.5);
        }
      }

      for (const blob of inkBlobs) {
        if (blob.life > 0) {
          blob.life -= frameDt;
          if (blob.life <= 0) {
            blob.mesh.visible = false;
          } else {
            blob.vy -= 18 * frameDt;
            blob.mesh.position.x += blob.vx * frameDt;
            blob.mesh.position.y = Math.max(0.08, blob.mesh.position.y + blob.vy * frameDt);
            blob.mesh.position.z += blob.vz * frameDt;
            blob.mesh.rotation.x += 5 * frameDt;
            blob.mesh.rotation.z += 5 * frameDt;
          }
        }
      }

      const renderStart = performance.now();
      renderer.render(scene, camera);
      const renderElapsed = performance.now() - renderStart;
      framesInWindow += 1;
      smoothedFrameMs = smoothedFrameMs * 0.85 + renderElapsed * 0.15;

      telemetryAccumulator += frameDt;
      if (telemetryAccumulator >= 0.25) {
        const instantFps = Math.min(120, Math.round(framesInWindow / telemetryAccumulator));
        smoothedFps = Math.round(smoothedFps * 0.65 + instantFps * 0.35);
        framesInWindow = 0;
        telemetryAccumulator = 0;

        let drawCalls = 0;
        let triangles = 0;
        let cameraFarVal = 0;
        let activeGagStateLabel = '';

        if (st.showPerfMonitor) {
          drawCalls = renderer.info.render.calls;
          triangles = renderer.info.render.triangles;
          cameraFarVal = Number(camera.far.toFixed(1));
          const activeGagItem = gagState.activeGagId ? gagState.items[gagState.activeGagId] : null;
          activeGagStateLabel = activeGagItem
            ? `${activeGagItem.id} (${activeGagItem.state})`
            : 'nessuna gag';
        }

        const ballSpeedKmh = Math.round(Math.hypot(ball.vx, ball.vy, ball.vz) * 3.6);
        callbacksRef.current.onTelemetryUpdate({
          scoreBlue,
          scoreRed,
          paliBlue,
          paliRed,
          stylePointsBlue,
          stylePointsRed,
          timeRemaining: Math.ceil(timeRemaining),
          ballProfile: st.ballProfile,
          ballSpeedKmh,
          shootCharge: latestSampledShootCharge,
          rightHoldCharge: latestSampledRightHoldCharge,
          dribbleExposure: Number((activePlayer?.dribbleExposure ?? 0).toFixed(2)),
          hasBall: latestHasBall,
          markingCallActive: markingCallTimer > 0,
          gkRushActive,
          setPieceState: setPieceState
            ? setPieceState.kind === 'penalty'
              ? 'CALCIO DI RIGORE'
              : 'PUNIZIONE CON BARRIERA'
            : null,
          activeShout: activeShout ? { ...activeShout } : null,
          cameraMode: st.cameraMode,
          connectedGamepads: inputManagerRef.current?.connectedGamepads || [],
          activeGag,
          lastBanner: lastBanner ? { title: lastBanner.title, subtitle: lastBanner.subtitle } : null,
          pointerLocked: Boolean(document.pointerLockElement),
          fps: smoothedFps,
          autoScaleFpsAvg,
          frameTimeMs: Number(smoothedFrameMs.toFixed(1)),
          drawCalls,
          triangles,
          isSoftwareGl,
          physicsStepsLastFrame: lastPhysicsSteps,
          cameraFar: cameraFarVal,
          activeGagStateLabel,
          trickPopup: trickPopup ? { label: trickPopup.label, team: trickPopup.team } : null,
          snapshotsPerSec,
        });
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      soundEngine.setBeachWavesActive(false);
      if (wsRef.current) {
        wsRef.current.removeEventListener('message', handleWsMessage);
      }
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.dispose();
    };
  }, [inputManagerRef, wsRef]);

  const handleCanvasClick = () => {
    if (
      stateRef.current.isPlaying &&
      !stateRef.current.isPaused &&
      stateRef.current.cameraMode === 'fps' &&
      mountRef.current &&
      !document.pointerLockElement &&
      mountRef.current.requestPointerLock
    ) {
      mountRef.current.requestPointerLock();
    }
  };

  return (
    <div
      ref={mountRef}
      onClick={handleCanvasClick}
      className="fixed inset-0 w-full h-full overflow-hidden bg-stone-950 select-none"
    />
  );
};
