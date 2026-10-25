import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import {
  createInitialGagSystemState,
  GagActionRegistry,
  GagStateItem,
  stepGagStateMachine,
  tryTriggerGag,
} from '../game/gags';
import { InputManager } from '../game/inputManager';
import {
  buildCourtyardEnvironment,
  createBallTexture,
  createStreetPlayerModel,
  detectSoftwareWebGL,
  PlayerRig,
} from '../game/proceduralModels';
import { SeededRNG } from '../game/rng';
import {
  ActiveGagNotification,
  BALL_PROFILES,
  BallProfileId,
  CameraMode,
  GAG_CONFIGS,
  GagId,
  GameMode,
  PITCH_CONFIGS,
  PitchId,
  PlayerInputState,
  StreetRuleId,
  WEATHER_CONFIGS,
  WeatherId,
} from '../types/game';

// Costante passo fisso (60 step fisici al secondo) definita in un unico punto
export const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;

interface SimPlayer {
  id: string;
  team: 'blue' | 'red';
  number: number;
  role: 'attacker' | 'midfielder' | 'defender';
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  yaw: number;
  prevYaw: number;
  pitchLook: number;
  homeX: number;
  homeZ: number;
  stamina: number;
  kickAnimTimer: number;
  slideTimer: number;
  rig: PlayerRig;
}

interface GlassShard {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface HostWorldSnapshot {
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rotX?: number;
    rotZ?: number;
  };
  scoreBlue: number;
  scoreRed: number;
  timeRemaining: number;
  players: Array<{
    x: number;
    z: number;
    vx?: number;
    vz?: number;
    yaw: number;
  }>;
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
  cameraMode: CameraMode;
  connectedGamepads: string[];
  activeGag: ActiveGagNotification | null;
  lastBanner: { title: string; subtitle: string } | null;
  pointerLocked: boolean;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  isSoftwareGl: boolean;
  physicsStepsLastFrame: number;
  cameraFar: number;
  activeGagStateLabel: string;
  trickPopup: { label: 'TUNNEL +1' | 'CAPPELLO +1'; team: 'blue' | 'red' } | null;
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
  pitch: PitchId;
  streetRule: StreetRuleId;
  ruleTunnelEnabled: boolean;
  ruleCappelloEnabled: boolean;
  renderScale: number;
  gagsEnabled: boolean;
  triggerGagRequest: { gag: GagId; seq: number } | null;
  resetMatchSeq: number;
  matchSeed: number;
  inputManagerRef: React.MutableRefObject<InputManager | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  isOnlineHost: boolean;
  onlineRoomCode: string | null;
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

export const StreetPitchCanvas: React.FC<StreetPitchCanvasProps> = ({
  isPlaying,
  isPaused,
  gameMode,
  cameraMode,
  onCameraModeChange,
  ballProfile,
  onBallProfileChange,
  weather,
  pitch,
  streetRule,
  ruleTunnelEnabled,
  ruleCappelloEnabled,
  renderScale,
  gagsEnabled,
  triggerGagRequest,
  resetMatchSeq,
  matchSeed,
  inputManagerRef,
  wsRef,
  isOnlineHost,
  onlineRoomCode,
  onTelemetryUpdate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store mutable props in refs so React UI updates never recreate the WebGL context
  const stateRef = useRef({
    isPlaying,
    isPaused,
    gameMode,
    cameraMode,
    ballProfile,
    weather,
    pitch,
    streetRule,
    ruleTunnelEnabled,
    ruleCappelloEnabled,
    renderScale,
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
      pitch,
      streetRule,
      ruleTunnelEnabled,
      ruleCappelloEnabled,
      renderScale,
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
    pitch,
    streetRule,
    ruleTunnelEnabled,
    ruleCappelloEnabled,
    renderScale,
    gagsEnabled,
    matchSeed,
    isOnlineHost,
    onlineRoomCode,
  ]);

  const callbacksRef = useRef({
    onCameraModeChange,
    onBallProfileChange,
    onTelemetryUpdate,
  });
  useEffect(() => {
    callbacksRef.current = {
      onCameraModeChange,
      onBallProfileChange,
      onTelemetryUpdate,
    };
  }, [onCameraModeChange, onBallProfileChange, onTelemetryUpdate]);

  const manualGagTriggerRef = useRef<{ gag: GagId; seq: number } | null>(null);
  useEffect(() => {
    if (triggerGagRequest) {
      manualGagTriggerRef.current = triggerGagRequest;
    }
  }, [triggerGagRequest]);

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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    const baseRatio = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(baseRatio * stateRef.current.renderScale);
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
      140,
    );
    camera.position.set(0, 13, 21);
    camera.lookAt(0, 0.8, 0);

    // 3-Point Warm/Cool Studio + Courtyard Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xf4a261, 0x3d405b, 0.85);
    hemiLight.position.set(0, 30, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffb703, 2.2);
    sunLight.position.set(14, 24, 12);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    const d = 20;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 60;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-16, 12, -14);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Build Environment
    let currentBuiltPitch: PitchId = stateRef.current.pitch;
    let envRefs = buildCourtyardEnvironment(currentBuiltPitch, maxAniso);
    scene.add(envRefs.group);

    // Pre-generate textures for the 4 ball profiles
    const ballTextures: Record<BallProfileId, THREE.CanvasTexture> = {
      supersantos: createBallTexture('supersantos', maxAniso),
      classico: createBallTexture('classico', maxAniso),
      bagnato: createBallTexture('bagnato', maxAniso),
      bucato: createBallTexture('bucato', maxAniso),
    };

    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTextures[stateRef.current.ballProfile],
      roughness: 0.35,
      metalness: 0.05,
    });
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), ballMat);
    ballMesh.castShadow = true;
    ballMesh.position.set(0, 0.42, 0);
    scene.add(ballMesh);

    // Ball ground shadow ring
    const ballShadowGeo = new THREE.CircleGeometry(0.42, 16);
    ballShadowGeo.rotateX(-Math.PI / 2);
    const ballShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const ballShadow = new THREE.Mesh(ballShadowGeo, ballShadowMat);
    ballShadow.position.set(0, 0.02, 0);
    scene.add(ballShadow);

    // Rain / Wind Weather Particle System (Purely visual — Math.random() allowed)
    const particleCount = 360;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 38;
      particlePositions[i * 3 + 1] = Math.random() * 14;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xbae6fd,
      size: 0.14,
      transparent: true,
      opacity: 0.65,
    });
    const weatherParticles = new THREE.Points(particleGeo, particleMat);
    scene.add(weatherParticles);

    // Create 3v3 Players (3 Azzurri Blue vs 3 Rivali Red)
    const players: SimPlayer[] = [];
    const lineup: Array<{
      id: string;
      team: 'blue' | 'red';
      number: number;
      role: 'attacker' | 'midfielder' | 'defender';
      hx: number;
      hz: number;
    }> = [
      { id: 'b1', team: 'blue', number: 10, role: 'attacker', hx: -3.5, hz: 0 },
      { id: 'b2', team: 'blue', number: 8, role: 'midfielder', hx: -7.5, hz: -3.8 },
      { id: 'b3', team: 'blue', number: 4, role: 'defender', hx: -11.5, hz: 2.2 },
      { id: 'r1', team: 'red', number: 9, role: 'attacker', hx: 3.5, hz: 0 },
      { id: 'r2', team: 'red', number: 7, role: 'midfielder', hx: 7.5, hz: 3.8 },
      { id: 'r3', team: 'red', number: 5, role: 'defender', hx: 11.5, hz: -2.2 },
    ];

    lineup.forEach((cfg, idx) => {
      const rig = createStreetPlayerModel(cfg.team, cfg.number, idx === 0);
      rig.root.position.set(cfg.hx, 0, cfg.hz);
      scene.add(rig.root);
      const initYaw = cfg.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
      players.push({
        id: cfg.id,
        team: cfg.team,
        number: cfg.number,
        role: cfg.role,
        x: cfg.hx,
        z: cfg.hz,
        prevX: cfg.hx,
        prevZ: cfg.hz,
        vx: 0,
        vz: 0,
        yaw: initYaw,
        prevYaw: initYaw,
        pitchLook: -0.12,
        homeX: cfg.hx,
        homeZ: cfg.hz,
        stamina: 1.0,
        kickAnimTimer: 0,
        slideTimer: 0,
        rig,
      });
    });

    let activeBlueIdx = 0; // Index in players (0..2)
    const activeRedIdx = 3; // Index in players (3..5)

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
      spinY: 0, // Lateral curve spin
      currentRadius: 0.42,
      mudBonusMass: 0, // Accumulated mud mass fraction in [0, 0.40] (+40% max)
      lastTouchTeam: 'blue' as 'blue' | 'red',
      lastTouchPlayerId: 'b1',
      lastTouchStep: -999,
      lastTouchX: 0,
      lastTouchZ: 0,
      bouncedOffWall: false,
      hiddenByGag: false,
    };

    // Deterministic PRNG and simulation step counter
    const rng = new SeededRNG(stateRef.current.matchSeed);
    let simSteps = 0;

    // Match State & Unified Serializable Gag State Machine (all durations in simSteps)
    let scoreBlue = 0;
    let scoreRed = 0;
    let paliBlue = 0;
    let paliRed = 0;
    let stylePointsBlue = 0;
    let stylePointsRed = 0;
    let timeRemaining = 180; // 3-minute street match
    let rainExposureTimer = 0;
    let goalCelebrationTimer = 0;
    let gagState = createInitialGagSystemState();
    let activeGag: ActiveGagNotification | null = null;
    let activeGagBannerSteps = 0;
    let lastBanner: { title: string; subtitle: string } | null = null;
    let lastBannerTimer = 0;
    let trickPopup: { label: 'TUNNEL +1' | 'CAPPELLO +1'; team: 'blue' | 'red' } | null = null;
    let trickPopupSteps = 0;

    // Cooldown in simSteps per ogni coppia (attaccante, difensore) per Tunnel e Cappello (3s = 180 step)
    const trickPairCooldown = new Map<string, number>();

    // Stato temporaneo per il passaggio tra le gambe (Tunnel) e sopra la testa (Cappello)
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

    // Remote client input & authoritative host snapshot in Online/LAN mode
    let remoteClientInput: PlayerInputState | null = null;
    let latestHostSnapshot: HostWorldSnapshot | null = null;

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
      resetDogRigPose();
      resetSeagullRigPose();

      players.forEach((p) => {
        const initYaw = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
        p.x = p.homeX;
        p.z = p.homeZ;
        p.prevX = p.homeX;
        p.prevZ = p.homeZ;
        p.vx = 0;
        p.vz = 0;
        p.yaw = initYaw;
        p.prevYaw = initYaw;
      });
    };

    const handleWsMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'match_start' && typeof msg.seed === 'number') {
          rng.reset(msg.seed >>> 0);
          simSteps = 0;
          resetPositions('blue');
        } else if (msg.type === 'client_input' && stateRef.current.isOnlineHost) {
          remoteClientInput = msg.input;
        } else if (msg.type === 'world_state' && !stateRef.current.isOnlineHost) {
          const s = msg.state as HostWorldSnapshot;
          if (!s) return;
          latestHostSnapshot = s;
          scoreBlue = s.scoreBlue;
          scoreRed = s.scoreRed;
          timeRemaining = s.timeRemaining;
        }
      } catch {
        // Ignore parse error
      }
    };

    if (wsRef.current) {
      wsRef.current.addEventListener('message', handleWsMessage);
    }

    const showGagBanner = (id: GagId, step: number) => {
      const cfg = GAG_CONFIGS[id];
      soundEngine.playGagSound(id);
      activeGag = {
        id,
        title: cfg.title,
        subtitle: cfg.subtitle,
        timestamp: Math.round(step * FIXED_DT * 1000),
      };
      activeGagBannerSteps = 312; // 5.2s simulated
    };

    // Action handlers separated from serializable GagSystemState
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

          // Purely visual glass shards (Math.random() allowed for visual particles only)
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
            // Phase 1: Dog runs from sideline home toward the ball
            const t = progress * 2;
            dogX = THREE.MathUtils.lerp(dog.homeX, tx, t);
            dogZ = THREE.MathUtils.lerp(dog.homeZ, tz, t);
            dirX = tx - dog.homeX;
            dirZ = tz - dog.homeZ;
          } else {
            // Phase 2: Dog grabs ball and runs back to the sideline
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

          // Fixed-step leg stride & tail wag animation using sin(simTime)
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
          // Ball is occupied off-field (hidden and unplayable for 6s simulated)
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
          // Gentle tail wag while the dog chews/holds the ball on the sideline
          envRefs.dogRig.tail.rotation.z = Math.sin(step * FIXED_DT * 18) * 0.35;
          ball.hiddenByGag = true;
          ball.vx = 0;
          ball.vy = 0;
          ball.vz = 0;
        },
        onCooldownEnter: () => {
          // Return ball near the center of the field with zero velocity and reset mud/state
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

    // Reset accumulator when browser tab returns from background
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        accumulator = 0;
        lastTime = performance.now();
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

      // Save previous state for alpha rendering interpolation
      ball.prevX = ball.x;
      ball.prevY = ball.y;
      ball.prevZ = ball.z;
      ball.prevRotX = ball.rotX;
      ball.prevRotZ = ball.rotZ;
      for (let i = 0; i < players.length; i++) {
        players[i].prevX = players[i].x;
        players[i].prevZ = players[i].z;
        players[i].prevYaw = players[i].yaw;
      }

      const inputMgr = inputManagerRef.current;
      const p1Input = inputMgr ? inputMgr.samplePlayer1(fixedDt, st.gameMode !== 'local_2p') : null;
      const p2Input =
        inputMgr && st.gameMode === 'local_2p' ? inputMgr.samplePlayer2(fixedDt) : remoteClientInput;
      inputMgr?.endFrame();

      latestSampledShootCharge = p1Input?.shootCharge || 0;

      if (p1Input?.cameraToggleJustPressed) {
        const nextCam: CameraMode = st.cameraMode === 'classic' ? 'fps' : 'classic';
        callbacksRef.current.onCameraModeChange(nextCam);
      }

      if (p1Input?.ballCycleJustPressed) {
        const order: BallProfileId[] = ['supersantos', 'classico', 'bagnato', 'bucato'];
        const nextProfile = order[(order.indexOf(st.ballProfile) + 1) % order.length];
        callbacksRef.current.onBallProfileChange(nextProfile);
      }

      // Gradual interpolation of camera.far and fog near/far in fixed simulation steps
      const targetWCfg = WEATHER_CONFIGS[st.weather];
      currentCameraFar = THREE.MathUtils.damp(currentCameraFar, targetWCfg.cameraFar, 1.4, fixedDt);
      currentFogNear = THREE.MathUtils.damp(currentFogNear, targetWCfg.fogNear, 1.4, fixedDt);
      currentFogFar = THREE.MathUtils.damp(currentFogFar, targetWCfg.fogFar, 1.4, fixedDt);

      if (!st.isPlaying || st.isPaused) {
        return;
      }

      simSteps += 1;
      const simTime = simSteps * fixedDt;

      // Countdown UI toast & trick popup timers in simulated steps / time
      if (lastBannerTimer > 0) {
        lastBannerTimer -= fixedDt;
        if (lastBannerTimer <= 0) {
          lastBanner = null;
        }
      }
      if (activeGagBannerSteps > 0) {
        activeGagBannerSteps -= 1;
        if (activeGagBannerSteps <= 0) {
          activeGag = null;
        }
      }
      if (trickPopupSteps > 0) {
        trickPopupSteps -= 1;
        if (trickPopupSteps <= 0) {
          trickPopup = null;
        }
      }

      const isMultiplayerClient =
        st.gameMode === 'online_lan' && !st.isOnlineHost && Boolean(st.onlineRoomCode);

      // Requirement 5: Authoritative Host — clients do not re-simulate physics;
      // they receive position, velocity and rotation of ball & players and interpolate them.
      if (isMultiplayerClient) {
        if (latestHostSnapshot) {
          const sb = latestHostSnapshot.ball;
          ball.vx = sb.vx;
          ball.vy = sb.vy;
          ball.vz = sb.vz;
          // Dead-reckoning step + smooth convergence toward authoritative host state
          ball.x = THREE.MathUtils.lerp(ball.x + ball.vx * fixedDt, sb.x, 0.35);
          ball.y = THREE.MathUtils.lerp(ball.y + ball.vy * fixedDt, sb.y, 0.35);
          ball.z = THREE.MathUtils.lerp(ball.z + ball.vz * fixedDt, sb.z, 0.35);
          if (typeof sb.rotX === 'number' && typeof sb.rotZ === 'number') {
            ball.rotX = THREE.MathUtils.lerp(ball.rotX + ball.vz * fixedDt * 2.1, sb.rotX, 0.35);
            ball.rotZ = THREE.MathUtils.lerp(ball.rotZ - ball.vx * fixedDt * 2.1, sb.rotZ, 0.35);
          } else {
            ball.rotX += ball.vz * fixedDt * 2.1;
            ball.rotZ -= ball.vx * fixedDt * 2.1;
          }

          if (Array.isArray(latestHostSnapshot.players)) {
            latestHostSnapshot.players.forEach((sp, idx) => {
              const p = players[idx];
              if (!p) return;
              p.vx = typeof sp.vx === 'number' ? sp.vx : (sp.x - p.x) / fixedDt;
              p.vz = typeof sp.vz === 'number' ? sp.vz : (sp.z - p.z) / fixedDt;
              p.x = THREE.MathUtils.lerp(p.x + p.vx * fixedDt, sp.x, 0.35);
              p.z = THREE.MathUtils.lerp(p.z + p.vz * fixedDt, sp.z, 0.35);
              p.yaw = lerpAngle(p.yaw, sp.yaw, 0.35);
            });
          }
        }

        // Send client input to host at 25Hz
        networkBroadcastAccumulator += fixedDt;
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          p1Input &&
          networkBroadcastAccumulator >= 0.04
        ) {
          networkBroadcastAccumulator = 0;
          wsRef.current.send(
            JSON.stringify({
              type: 'client_input',
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

      // Rain auto-soaks the ball after 45 simulated seconds of heavy rain
      if (st.weather === 'pioggia' && st.ballProfile === 'classico') {
        rainExposureTimer += fixedDt;
        if (rainExposureTimer > 45) {
          rainExposureTimer = 0;
          callbacksRef.current.onBallProfileChange('bagnato');
          lastBanner = {
            title: 'PALLONE INZUPPATO!',
            subtitle: 'La pioggia ha reso il pallone di cuoio pesante come il piombo!',
          };
          lastBannerTimer = 4.0;
        }
      }

      // Advance unified gag state machine (Host / Local authoritative only)
      stepGagStateMachine(gagState, simSteps, gagRegistry);

      // Update purely visual glass shards
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

      // Switch active Blue Player on 'K' when not close to the ball
      const controlledBlue = players[activeBlueIdx];
      const distControlledToBall = Math.hypot(controlledBlue.x - ball.x, controlledBlue.z - ball.z);
      if (p1Input?.passJustPressed && distControlledToBall > 2.3) {
        let bestIdx = activeBlueIdx;
        let bestDist = Infinity;
        for (let i = 0; i < 3; i++) {
          if (i === activeBlueIdx) continue;
          const d2 = Math.hypot(players[i].x - ball.x, players[i].z - ball.z);
          if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
          }
        }
        activeBlueIdx = bestIdx;
      }

      // Update Players (Controlled + AI) using weather AND pitch grip, speed & turn multipliers
      const grip = wCfg.playerGripMultiplier / Math.sqrt(pitchCfg.groundFriction);
      const speedMult = wCfg.playerSpeedMultiplier * pitchCfg.playerSpeedMultiplier;
      const turnMult = wCfg.playerTurnMultiplier * pitchCfg.playerTurnMultiplier;

      players.forEach((p, idx) => {
        const isBlueControlled = idx === activeBlueIdx;
        const isRedControlled =
          (st.gameMode === 'local_2p' || (st.gameMode === 'online_lan' && st.onlineRoomCode)) &&
          idx === activeRedIdx;

        if (p.kickAnimTimer > 0) p.kickAnimTimer = Math.max(0, p.kickAnimTimer - fixedDt);
        if (p.slideTimer > 0) p.slideTimer = Math.max(0, p.slideTimer - fixedDt);

        let targetVx = 0;
        let targetVz = 0;

        if (isBlueControlled && p1Input) {
          const speed = (p1Input.sprint ? 8.6 : 6.2) * speedMult * (p.slideTimer > 0 ? 1.25 : 1.0);
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

          if (p1Input.tackleJustPressed && p.slideTimer <= 0) {
            p.slideTimer = 0.42;
            p.vx += Math.sin(p.yaw) * 6.5 * speedMult;
            p.vz += Math.cos(p.yaw) * 6.5 * speedMult;
          }
        } else if (isRedControlled && p2Input) {
          const speed = (p2Input.sprint ? 8.6 : 6.2) * speedMult;
          targetVx = p2Input.moveX * speed;
          targetVz = p2Input.moveZ * speed;
          if (Math.hypot(targetVx, targetVz) > 0.25) {
            const desiredYaw = Math.atan2(targetVx, targetVz);
            p.yaw = lerpAngle(p.yaw, desiredYaw, Math.min(1, 14 * turnMult * fixedDt));
          }
        } else {
          // Street Football Tactical AI
          const distBall = Math.hypot(ball.x - p.x, ball.z - p.z);
          const teamHasClosest = players
            .filter((tp) => tp.team === p.team)
            .every((tp) => tp === p || Math.hypot(ball.x - tp.x, ball.z - tp.z) >= distBall - 0.5);

          let destX = p.homeX + ball.x * 0.35;
          let destZ = p.homeZ + ball.z * 0.45;

          if (teamHasClosest || distBall < 5.5) {
            destX = ball.x;
            destZ = ball.z;
          }

          const dx = destX - p.x;
          const dz = destZ - p.z;
          const dLen = Math.hypot(dx, dz);
          if (dLen > 0.35) {
            const aiSpeed = (p.role === 'attacker' ? 5.6 : 5.1) * speedMult;
            targetVx = (dx / dLen) * aiSpeed;
            targetVz = (dz / dLen) * aiSpeed;
            const desiredYaw = Math.atan2(targetVx, targetVz);
            p.yaw = lerpAngle(p.yaw, desiredYaw, Math.min(1, 12 * turnMult * fixedDt));
          }
        }

        // Smooth velocity damping with weather & pitch grip & turn multiplier
        const accel = 11.5 * grip * turnMult;
        p.vx = THREE.MathUtils.damp(p.vx, targetVx, accel, fixedDt);
        p.vz = THREE.MathUtils.damp(p.vz, targetVz, accel, fixedDt);

        p.x = THREE.MathUtils.clamp(p.x + p.vx * fixedDt, -15.6, 15.6);
        p.z = THREE.MathUtils.clamp(p.z + p.vz * fixedDt, -9.6, 9.6);

        // Ball Dribbling, Kicking, Passing & Cappello Recovery Check
        const isBallLockedByGag =
          ball.hiddenByGag ||
          gagState.activeGagId === 'palla_tetto' ||
          gagState.activeGagId === 'tombino_fogna' ||
          gagState.activeGagId === 'cane_palla' ||
          gagState.activeGagId === 'gabbiano_palla';
        const dBall = Math.hypot(ball.x - p.x, ball.z - p.z);
        if (dBall < 1.25 && ball.y < 1.75 && !isBallLockedByGag) {
          // Cappello (+1) recovery check: if a lobbed ball passed over an opponent's head (1.8m-4.0m within 1.2m),
          // award +1 point ONLY if the attacker or a teammate recovers the ball within 2.5s simulated before an opponent touches it!
          if (pendingCappello) {
            if (p.team !== pendingCappello.attackerTeam) {
              // Opponent touched the ball first: cappello cancelled
              pendingCappello = null;
            } else if (
              st.ruleCappelloEnabled &&
              simSteps <= pendingCappello.expiresAtStep &&
              simSteps > pendingCappello.passedStep + 4
            ) {
              const pairKey = `cappello_${pendingCappello.attackerId}_${pendingCappello.defenderId}`;
              if (simSteps >= (trickPairCooldown.get(pairKey) ?? 0)) {
                trickPairCooldown.set(pairKey, simSteps + 180); // 3s simulated cooldown per pair
                if (p.team === 'blue') {
                  scoreBlue += 1;
                  stylePointsBlue += 1;
                } else {
                  scoreRed += 1;
                  stylePointsRed += 1;
                }
                trickPopup = { label: 'CAPPELLO +1', team: p.team };
                trickPopupSteps = 48; // ~800ms simulated HUD popup
                soundEngine.playTrickCheer();
                // TODO (Fase F): Inviare evento punteggio CAPPELLO +1 ai client via WebSocket
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

          if (isBlueControlled && p1Input) {
            if (p1Input.shootJustReleased) {
              const pwr = THREE.MathUtils.lerp(13, 27, p1Input.shootCharge) * Math.pow(massFactor, 0.35);
              ball.vx = kickDirX * pwr + p.vx * 0.35;
              ball.vz = kickDirZ * pwr + p.vz * 0.35;
              ball.vy = THREE.MathUtils.lerp(2.8, 7.6, p1Input.shootCharge);
              ball.spinY = (p1Input.moveX || rng.range(-0.5, 0.5)) * 7.5;
              p.kickAnimTimer = 0.32;
              soundEngine.playKick(st.ballProfile, p1Input.shootCharge);
            } else if (p1Input.passJustPressed) {
              const mates = players.filter((m) => m.team === 'blue' && m !== p);
              let passDirX = kickDirX;
              let passDirZ = kickDirZ;
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
              soundEngine.playKick(st.ballProfile, 0.55);
            } else if (p1Input.lobJustPressed) {
              ball.vx = kickDirX * 11.5;
              ball.vz = kickDirZ * 11.5;
              ball.vy = 9.4;
              p.kickAnimTimer = 0.3;
              soundEngine.playKick(st.ballProfile, 0.65);
            } else {
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
              soundEngine.playKick(st.ballProfile, p2Input.shootCharge);
            } else if (p2Input.passJustPressed) {
              ball.vx = kickDirX * 15;
              ball.vz = kickDirZ * 15;
              ball.vy = 1.1;
              p.kickAnimTimer = 0.25;
              soundEngine.playKick(st.ballProfile, 0.5);
            } else if (p2Input.lobJustPressed) {
              ball.vx = kickDirX * 11;
              ball.vz = kickDirZ * 11;
              ball.vy = 9.0;
              p.kickAnimTimer = 0.3;
              soundEngine.playKick(st.ballProfile, 0.6);
            } else {
              ball.vx = p.vx * 1.05 + kickDirX * 1.5;
              ball.vz = p.vz * 1.05 + kickDirZ * 1.5;
            }
          } else {
            // Deterministic AI Action using PRNG
            const targetGoalX = p.team === 'blue' ? 15.5 : -15.5;
            const gx = targetGoalX - p.x;
            const gz = rng.range(-1.6, 1.6) - p.z;
            const gLen = Math.hypot(gx, gz) || 1;

            if (Math.abs(targetGoalX - p.x) < 11.5 && rng.next() < 0.08) {
              ball.vx = (gx / gLen) * 18.5;
              ball.vz = (gz / gLen) * 18.5;
              ball.vy = 3.2 + rng.next() * 2.5;
              p.kickAnimTimer = 0.3;
              soundEngine.playKick(st.ballProfile, 0.7);
            } else {
              ball.vx = (gx / gLen) * 7.2;
              ball.vz = (gz / gLen) * 7.2;
            }
          }
        }
      });

      // Update Ball Physics (Plastic Ball Wobble, Magnus Spin, Wind, Deflation, Courtyard Collisions)
      const bProf = BALL_PROFILES[st.ballProfile];
      const ballCapturedByGag =
        ball.hiddenByGag ||
        gagState.activeGagId === 'palla_tetto' ||
        gagState.activeGagId === 'tombino_fogna' ||
        gagState.activeGagId === 'cane_palla' ||
        gagState.activeGagId === 'gabbiano_palla';

      if (!ballCapturedByGag) {
        // Deflation logic for 'bucato' in simulated time
        if (bProf.deflate && ball.currentRadius > bProf.deflate.minRadius) {
          ball.currentRadius = Math.max(
            bProf.deflate.minRadius,
            ball.currentRadius - bProf.deflate.rate * fixedDt,
          );
        }

        const speedXZ = Math.hypot(ball.vx, ball.vz);
        const totalSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);

        // Mud accumulation in simulated time while rolling or bouncing on the ground (disabled on Spiaggia)
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

        // 2. Wind Vector * Ball Wind Factor (scaled inversely by mud mass bonus)
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

        // 4. Plastic Ball & Punctured Ball Aerodynamic Wobble (uses simTime & deterministic PRNG)
        if (bProf.wobble && totalSpeed > bProf.wobble.speedMin && ball.y > 0.55) {
          const perpX = -ball.vz / (speedXZ || 1);
          const perpZ = ball.vx / (speedXZ || 1);
          const wobbleOsc =
            Math.sin(simTime * bProf.wobble.freqHz * Math.PI * 2) + rng.range(-0.18, 0.18);
          ball.vx += perpX * wobbleOsc * bProf.wobble.force * mudInvMass * fixedDt;
          ball.vz += perpZ * wobbleOsc * bProf.wobble.force * mudInvMass * fixedDt;
        }

        // 5. Air & Ground Rolling Drag (with weather rollFrictionMultiplier, pitch groundFriction & mud drag)
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

        // Advance position & rotation
        ball.x += ball.vx * fixedDt;
        ball.y += ball.vy * fixedDt;
        ball.z += ball.vz * fixedDt;
        ball.rotX += ball.vz * fixedDt * 2.1;
        ball.rotZ -= ball.vx * fixedDt * 2.1;

        // 6. Geometric Detection of Street Rules: TUNNEL (+1) and CAPPELLO (+1) (Host / Local only)
        if (simSteps - ball.lastTouchStep <= 135) {
          const attacker = players.find((pl) => pl.id === ball.lastTouchPlayerId);

          // A) TUNNEL (+1): Low ball (center height <= ~0.4m / ground radius) passing through the segment
          // between an opponent's two feet in close range (~1.5m) after an attacker touch, then exiting the other side.
          if (st.ruleTunnelEnabled && Math.min(ball.prevY, ball.y) <= Math.max(0.45, ball.currentRadius + 0.05)) {
            for (const def of players) {
              if (def.team === ball.lastTouchTeam) continue;
              const pairKey = `tunnel_${ball.lastTouchPlayerId}_${def.id}`;
              if (simSteps < (trickPairCooldown.get(pairKey) ?? 0)) continue;

              // Attacker must have played the ball from close range (<= 1.5m..2.8m)
              const distTouchToDef = Math.hypot(ball.lastTouchX - def.x, ball.lastTouchZ - def.z);
              const distAttToDef = attacker ? Math.hypot(attacker.x - def.x, attacker.z - def.z) : distTouchToDef;
              if (Math.min(distTouchToDef, distAttToDef) > 2.6) continue;

              // Local coordinate system of the defender's two feet:
              // fwd = direction defender faces; right = segment axis connecting left foot to right foot
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

              // Geometric segment intersection test between ball movement (prev -> curr) and the inter-foot line (s = 0)
              if ((s0 <= 0 && s1 > 0) || (s0 >= 0 && s1 < 0)) {
                const denom = s0 - s1;
                const tCross = Math.abs(denom) > 1e-6 ? s0 / denom : 0.5;
                const uCross = u0 + tCross * (u1 - u0);
                // Segment between the two feet has half-width ~0.46m
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

              // Confirm Tunnel (+1) as soon as the ball exits the other side within close radius (~1.5m)
              if (
                pendingTunnel &&
                pendingTunnel.defenderId === def.id &&
                simSteps - pendingTunnel.crossStep <= 24 &&
                s1 * pendingTunnel.exitSign >= 0.16 &&
                Math.hypot(dx1, dz1) <= 1.5
              ) {
                trickPairCooldown.set(pairKey, simSteps + 180); // 3s simulated cooldown per pair
                if (pendingTunnel.attackerTeam === 'blue') {
                  scoreBlue += 1;
                  stylePointsBlue += 1;
                } else {
                  scoreRed += 1;
                  stylePointsRed += 1;
                }
                trickPopup = { label: 'TUNNEL +1', team: pendingTunnel.attackerTeam };
                trickPopupSteps = 48; // ~800ms simulated HUD popup
                soundEngine.playTrickCheer();
                // TODO (Fase F): Inviare evento punteggio TUNNEL +1 ai client via WebSocket
                pendingTunnel = null;
              }
            }
          }

          // B) CAPPELLO (+1): Ball passes over an opponent's head (height 1.8m..4.0m) within 1.2m horizontally;
          // point is awarded when recovered by the attacker or a teammate within 2.5s simulated (150 steps).
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
                  expiresAtStep: simSteps + 150, // 2.5s simulated recovery window
                };
              }
            }
          }
        }

        // Ground Bounce (with muffled mud/sand audio & pitch restitution multiplier)
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

        // Goalpost Collisions ("Pali / Giubbotti / Secchielli")
        for (const post of envRefs.goalPosts) {
          const dx = ball.x - post.x;
          const dz = ball.z - post.z;
          const distPost = Math.hypot(dx, dz);
          if (distPost < 0.72 && ball.y < 2.45) {
            soundEngine.playPostHit();
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
              }
            }
          }
        }

        // Goal Detection (X beyond +-15.5, |Z| < 2.65, Y < 2.4)
        if (Math.abs(ball.x) > 15.5 && Math.abs(ball.z) < 2.65 && ball.y < 2.45 && goalCelebrationTimer <= 0) {
          const scoredByBlue = ball.x > 15.5;
          const bonusSponda = st.streetRule === 'palla_avvelenata' && ball.bouncedOffWall ? 2 : 1;

          if (scoredByBlue) {
            scoreBlue += bonusSponda;
            lastBanner = {
              title: bonusSponda > 1 ? 'GOL DI SPONDA DOPPIO! (+2)' : 'GOOOL DEGLI AZZURRI!',
              subtitle:
                st.streetRule === 'chi_segna_vince'
                  ? ' Regola Chi Segna Vince: Vittoria immediata!'
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
          resetPositions(scoredByBlue ? 'red' : 'blue');
        }

        // Per-Pitch Gag Volume Triggers (When Classic Gags Enabled — filtered by GAG_CONFIGS[id].allowedPitches)
        if (st.gagsEnabled && gagState.activeGagId === null) {
          // 1. Signora Maria Balcony
          if (ball.z < -9.3 && ball.x > -10.8 && ball.x < -5.2 && ball.y > 1.8) {
            tryTriggerGag(gagState, 'vecchia_buca', simSteps, rng, gagRegistry, {}, false, st.pitch);
          }
          // 2. Breakable Window
          else if (ball.z < -9.3 && ball.x > 5.2 && ball.x < 9.8 && ball.y > 1.8) {
            tryTriggerGag(gagState, 'finestra_rotta', simSteps, rng, gagRegistry, {}, false, st.pitch);
          }
          // 3. Ball on the Roof
          else if (ball.z < -8.8 && ball.y > 5.8) {
            tryTriggerGag(gagState, 'palla_tetto', simSteps, rng, gagRegistry, {}, false, st.pitch);
          }
          // 4. Parked Car Alarm
          else if (ball.z > 9.3 && ball.x < -8.2) {
            tryTriggerGag(gagState, 'allarme_auto', simSteps, rng, gagRegistry, {}, false, st.pitch);
          }
          // 5. Storm Drain Tombino (100% probability in GAG_CONFIGS)
          else if (Math.hypot(ball.x - 9.5, ball.z - 8.8) < 0.78 && ball.y < 0.5 && speedXZ < 5.5) {
            tryTriggerGag(gagState, 'tombino_fogna', simSteps, rng, gagRegistry, {}, false, st.pitch);
          }
          // 6. Beach Seagull Swoop ('gabbiano_palla' — valid on 'spiaggia' when ball is kicked high or near North shore)
          else if (st.pitch === 'spiaggia' && ball.z < -6.8 && (ball.y > 1.6 || speedXZ < 2.2)) {
            tryTriggerGag(
              gagState,
              'gabbiano_palla',
              simSteps,
              rng,
              gagRegistry,
              { targetX: ball.x, targetY: ball.y, targetZ: ball.z, grabbed: false },
              false,
              st.pitch,
            );
          }

          // 7. Courtyard / Beach Dog Steals Ball: ball slow/stopped on the ground near South sideline dog for >= 35 steps
          const distToDog = Math.hypot(ball.x - envRefs.dogRig.homeX, ball.z - envRefs.dogRig.homeZ);
          if (ball.y < 0.55 && speedXZ < 2.4 && (distToDog < 4.2 || (ball.z > 6.8 && Math.abs(ball.x - envRefs.dogRig.homeX) < 5.2))) {
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
              );
            }
          } else {
            gagState.dogNearBallSteps = 0;
          }
        } else {
          gagState.dogNearBallSteps = 0;
        }

        // Courtyard / Beach Perimeter Bounce Walls ("Sponda")
        if (Math.abs(ball.z) > 9.8) {
          ball.z = Math.sign(ball.z) * 9.8;
          ball.vz = -ball.vz * pitchCfg.wallRestitution;
          ball.bouncedOffWall = true;
          soundEngine.playBounce(
            st.ballProfile,
            Math.abs(ball.vz),
            st.weather === 'fango' || pitchCfg.muffledBounceAudio,
          );
        }
        if (Math.abs(ball.x) > 15.8 && Math.abs(ball.z) >= 2.65) {
          ball.x = Math.sign(ball.x) * 15.8;
          ball.vx = -ball.vx * pitchCfg.wallRestitution;
          ball.bouncedOffWall = true;
          soundEngine.playBounce(
            st.ballProfile,
            Math.abs(ball.vx),
            st.weather === 'fango' || pitchCfg.muffledBounceAudio,
          );
        }
      }

      // Broadcast Host state to Online/LAN room at 25Hz (includes position, velocity & rotation)
      // TODO (Fase F): Includere nel pacchetto dell'host anche il campo scelto (st.pitch)
      // e gli eventi di punteggio Tunnel (+1) / Cappello (+1) per sincronizzare i client.
      networkBroadcastAccumulator += fixedDt;
      if (
        st.gameMode === 'online_lan' &&
        st.isOnlineHost &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        networkBroadcastAccumulator >= 0.04
      ) {
        networkBroadcastAccumulator = 0;
        wsRef.current.send(
          JSON.stringify({
            type: 'world_state',
            state: {
              ball: {
                x: ball.x,
                y: ball.y,
                z: ball.z,
                vx: ball.vx,
                vy: ball.vy,
                vz: ball.vz,
                rotX: ball.rotX,
                rotZ: ball.rotZ,
              },
              scoreBlue,
              scoreRed,
              timeRemaining,
              players: players.map((p) => ({
                x: p.x,
                z: p.z,
                vx: p.vx,
                vz: p.vz,
                yaw: p.yaw,
              })),
            },
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

      // Dynamic render scale update for weak hardware
      if (st.renderScale !== lastRenderedScale) {
        lastRenderedScale = st.renderScale;
        renderer.setPixelRatio(baseRatio * st.renderScale);
      }

      // Dynamic Pitch rebuild if changed + reset mud & active gag if not allowed on new pitch
      if (st.pitch !== currentBuiltPitch) {
        currentBuiltPitch = st.pitch;
        scene.remove(envRefs.group);
        envRefs = buildCourtyardEnvironment(currentBuiltPitch, maxAniso);
        scene.add(envRefs.group);
        if (!PITCH_CONFIGS[currentBuiltPitch].allowsMudAccumulation) {
          ball.mudBonusMass = 0;
        }
        gagState = createInitialGagSystemState();
        ball.hiddenByGag = false;
      }

      // Keep optional synthesized beach waves in sync with pitch & play state
      soundEngine.setBeachWavesActive(st.isPlaying && !st.isPaused && st.pitch === 'spiaggia');

      // Match reset or seed initialization check
      if (shouldResetMatchRef.current) {
        shouldResetMatchRef.current = false;
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
        envRefs.windowGlassMesh.visible = true;
        envRefs.carHeadlights.forEach((hl) => {
          hl.visible = true;
        });
        resetPositions('blue');
        soundEngine.playWhistle(false);
      }

      // Manual Gag Trigger from UI dock button (force = true: ignores probability & cooldown, checks allowedPitches)
      if (manualGagTriggerRef.current) {
        const req = manualGagTriggerRef.current;
        manualGagTriggerRef.current = null;
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
        );
      }

      // Reset mud accumulation when weather changes
      if (st.weather !== lastWeather) {
        lastWeather = st.weather;
        ball.mudBonusMass = 0;
      }

      // Weather lighting, ground tint & linear Fog (with short near and interpolated far for Nebbia culling)
      const wCfg = WEATHER_CONFIGS[st.weather];
      scene.background = _vec3A.set(0, 0, 0) && new THREE.Color(wCfg.skyColor);
      if (!scene.fog || !(scene.fog instanceof THREE.Fog)) {
        scene.fog = new THREE.Fog(wCfg.fogColor, currentFogNear, currentFogFar);
      } else {
        scene.fog.color.set(wCfg.fogColor);
        scene.fog.near = currentFogNear;
        scene.fog.far = currentFogFar;
      }
      sunLight.color.set(wCfg.sunColor);
      sunLight.intensity = wCfg.sunIntensity;
      hemiLight.color.set(wCfg.hemiSky);
      hemiLight.groundColor.set(wCfg.hemiGround);
      envRefs.groundMat.color.set(wCfg.groundTint);

      // Purely visual weather particles update (no heavy particles in Fango)
      weatherParticles.visible = st.weather === 'pioggia' || st.weather === 'vento';
      if (weatherParticles.visible) {
        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const vy = st.weather === 'pioggia' ? -18 : -2.2;
        const vx = wCfg.windVector[0] * 1.8;
        for (let i = 0; i < particleCount; i++) {
          arr[i * 3] += vx * frameDt;
          arr[i * 3 + 1] += vy * frameDt;
          if (arr[i * 3 + 1] < 0) {
            arr[i * 3 + 1] = 14;
            arr[i * 3] = (Math.random() - 0.5) * 36;
          }
          if (arr[i * 3] > 19) arr[i * 3] = -19;
          if (arr[i * 3] < -19) arr[i * 3] = 19;
        }
        posAttr.needsUpdate = true;
      }

      // Ball Texture & Squash/Deflate visual update + Mud reset on profile change
      if (st.ballProfile !== lastRenderedBallProfile) {
        lastRenderedBallProfile = st.ballProfile;
        ballMat.map = ballTextures[st.ballProfile];
        ballMat.needsUpdate = true;
        ball.currentRadius = BALL_PROFILES[st.ballProfile].visualRadius;
        ball.mudBonusMass = 0;
      }

      // Visual brown tint on the ball proportional to accumulated mud
      if (wCfg.mudMaxMassBonus > 0) {
        _colorMudTarget.set(wCfg.ballMudTint);
        const mudVisualRatio = Math.min(1, 0.28 + (ball.mudBonusMass / wCfg.mudMaxMassBonus) * 0.72);
        ballMat.color.copy(_colorWhite).lerp(_colorMudTarget, mudVisualRatio);
      } else {
        ballMat.color.copy(_colorWhite);
      }

      // Requirement 3: Fixed Timestep Accumulator with max 4 steps per frame
      accumulator += Math.min(rawDt, 0.25);
      let stepsThisFrame = 0;
      while (accumulator >= FIXED_DT && stepsThisFrame < MAX_STEPS_PER_FRAME) {
        stepPhysics(FIXED_DT);
        accumulator -= FIXED_DT;
        stepsThisFrame += 1;
      }
      if (accumulator >= FIXED_DT) {
        // Discard residual accumulator if > 4 steps to prevent spiral of death
        accumulator = 0;
      }
      lastPhysicsSteps = stepsThisFrame;

      // Interpolate rendered positions & rotations between previous and current physics state
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
        const rZ = THREE.MathUtils.lerp(p.prevZ, p.z, alpha);
        const rYaw = lerpAngle(p.prevYaw, p.yaw, alpha);

        p.rig.root.position.set(rX, p.slideTimer > 0 ? -0.25 : 0, rZ);
        p.rig.root.rotation.y = rYaw;
        p.rig.upperBodyGroup.visible = !(isBlueControlled && st.cameraMode === 'fps');

        const ringMat = p.rig.selectionRing.material as THREE.MeshBasicMaterial;
        if (isBlueControlled) {
          ringMat.color.setHex(0xfacc15);
          ringMat.opacity = 0.92;
        } else if (isRedControlled) {
          ringMat.color.setHex(0x38bdf8);
          ringMat.opacity = 0.92;
        } else {
          ringMat.color.setHex(p.team === 'blue' ? 0x0284c7 : 0xe11d48);
          ringMat.opacity = 0.32;
        }

        const moveSpeed = Math.hypot(p.vx, p.vz);
        const swing = Math.sin(simTimeRender * 14 + idx) * Math.min(1, moveSpeed / 5.5) * 0.68;
        if (p.kickAnimTimer > 0) {
          p.rig.rightLeg.rotation.x = -1.15;
          p.rig.leftLeg.rotation.x = 0.35;
        } else {
          p.rig.leftLeg.rotation.x = swing;
          p.rig.rightLeg.rotation.x = -swing;
        }
        p.rig.leftArm.rotation.x = -swing * 0.7;
        p.rig.rightArm.rotation.x = swing * 0.7;
      });

      // Camera Choreography using interpolated positions
      const activePlayer = players[activeBlueIdx];
      const activeRenderX = THREE.MathUtils.lerp(activePlayer.prevX, activePlayer.x, alpha);
      const activeRenderZ = THREE.MathUtils.lerp(activePlayer.prevZ, activePlayer.z, alpha);
      const activeRenderYaw = lerpAngle(activePlayer.prevYaw, activePlayer.yaw, alpha);

      // Apply interpolated camera.far across all camera modes (TV, FPS, Title) for Nebbia frustum culling
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
        const headBob = Math.sin(simTimeRender * 16) * Math.min(1, speed / 6) * 0.065;
        const eyeX = activeRenderX + Math.sin(activeRenderYaw) * 0.18;
        const eyeY = (activePlayer.slideTimer > 0 ? 1.05 : 1.66) + headBob;
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
        const focusX = THREE.MathUtils.clamp(renderBallX * 0.65 + activeRenderX * 0.35, -9.5, 9.5);
        const focusZ = THREE.MathUtils.clamp(renderBallZ * 0.5, -4.5, 4.5);

        _camTargetPos.set(focusX, 12.8, focusZ + 18.2);
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

      const renderStart = performance.now();
      renderer.render(scene, camera);
      const renderElapsed = performance.now() - renderStart;
      framesInWindow += 1;
      smoothedFrameMs = smoothedFrameMs * 0.85 + renderElapsed * 0.15;

      // Update React HUD Telemetry at ~12Hz so React never slows down the render loop
      telemetryAccumulator += frameDt;
      if (telemetryAccumulator >= 0.12) {
        const instantFps = Math.min(120, Math.round(framesInWindow / telemetryAccumulator));
        smoothedFps = Math.round(smoothedFps * 0.65 + instantFps * 0.35);
        framesInWindow = 0;
        telemetryAccumulator = 0;

        const activeGagItem = gagState.activeGagId ? gagState.items[gagState.activeGagId] : null;
        const activeGagStateLabel = activeGagItem
          ? `${activeGagItem.id} (${activeGagItem.state})`
          : 'nessuna gag';

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
          cameraMode: st.cameraMode,
          connectedGamepads: inputManagerRef.current?.connectedGamepads || [],
          activeGag,
          lastBanner: lastBanner ? { title: lastBanner.title, subtitle: lastBanner.subtitle } : null,
          pointerLocked: Boolean(document.pointerLockElement),
          fps: smoothedFps,
          frameTimeMs: Number(smoothedFrameMs.toFixed(1)),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          isSoftwareGl,
          physicsStepsLastFrame: lastPhysicsSteps,
          cameraFar: Number(camera.far.toFixed(1)),
          activeGagStateLabel,
          trickPopup: trickPopup ? { label: trickPopup.label, team: trickPopup.team } : null,
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
