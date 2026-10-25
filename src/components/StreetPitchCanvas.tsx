import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { InputManager } from '../game/inputManager';
import {
  buildCourtyardEnvironment,
  createBallTexture,
  createStreetPlayerModel,
  detectSoftwareWebGL,
  PlayerRig,
} from '../game/proceduralModels';
import {
  ActiveGagNotification,
  BALL_PROFILES,
  BallProfileId,
  CameraMode,
  GagId,
  GameMode,
  PITCH_CONFIGS,
  PitchId,
  PlayerInputState,
  StreetRuleId,
  WEATHER_CONFIGS,
  WeatherId,
} from '../types/game';

interface SimPlayer {
  id: string;
  team: 'blue' | 'red';
  number: number;
  role: 'attacker' | 'midfielder' | 'defender';
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
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
  renderScale: number;
  gagsEnabled: boolean;
  triggerGagRequest: { gag: GagId; seq: number } | null;
  resetMatchSeq: number;
  inputManagerRef: React.MutableRefObject<InputManager | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  isOnlineHost: boolean;
  onlineRoomCode: string | null;
  onTelemetryUpdate: (telemetry: HudTelemetry) => void;
}

// Pre-allocated math objects to guarantee zero GC inside the 60fps loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();

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
  renderScale,
  gagsEnabled,
  triggerGagRequest,
  resetMatchSeq,
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
    renderScale,
    gagsEnabled,
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
      renderScale,
      gagsEnabled,
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
    renderScale,
    gagsEnabled,
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
  const shouldResetMatchRef = useRef(false);
  useEffect(() => {
    if (resetMatchSeq !== resetSeqRef.current) {
      resetSeqRef.current = resetMatchSeq;
      shouldResetMatchRef.current = true;
    }
  }, [resetMatchSeq]);

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

    // Rain / Wind Weather Particle System (Single Draw Call Points)
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

    // Create 3v3 Players (3 Celestini Blue vs 3 Rivali Red)
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
      players.push({
        id: cfg.id,
        team: cfg.team,
        number: cfg.number,
        role: cfg.role,
        x: cfg.hx,
        z: cfg.hz,
        vx: 0,
        vz: 0,
        yaw: cfg.team === 'blue' ? Math.PI / 2 : -Math.PI / 2,
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
    let activeRedIdx = 3; // Index in players (3..5)

    // Ball physical state
    const ball = {
      x: 0,
      y: 0.42,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spinY: 0, // Lateral curve spin
      currentRadius: 0.42,
      lastTouchTeam: 'blue' as 'blue' | 'red',
      bouncedOffWall: false,
      roofStuckTimer: 0,
    };

    // Match & Gag State
    let scoreBlue = 0;
    let scoreRed = 0;
    let paliBlue = 0;
    let paliRed = 0;
    let stylePointsBlue = 0;
    let stylePointsRed = 0;
    let timeRemaining = 180; // 3-minute street match
    let rainExposureTimer = 0;
    let gagCooldown = 0;
    let carAlarmTimer = 0;
    let windowBrokenTimer = 0;
    let bucatoRevertTimer = 0;
    let goalCelebrationTimer = 0;
    let activeGag: ActiveGagNotification | null = null;
    let lastBanner: { title: string; subtitle: string; expiresAt: number } | null = null;
    const glassShards: GlassShard[] = [];

    // Remote client input in Online/LAN mode
    let remoteClientInput: PlayerInputState | null = null;
    const handleWsMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'client_input' && stateRef.current.isOnlineHost) {
          remoteClientInput = msg.input;
        } else if (msg.type === 'world_state' && !stateRef.current.isOnlineHost) {
          const s = msg.state;
          if (!s) return;
          ball.x = s.ball.x;
          ball.y = s.ball.y;
          ball.z = s.ball.z;
          ball.vx = s.ball.vx;
          ball.vy = s.ball.vy;
          ball.vz = s.ball.vz;
          scoreBlue = s.scoreBlue;
          scoreRed = s.scoreRed;
          timeRemaining = s.timeRemaining;
          if (Array.isArray(s.players)) {
            s.players.forEach((sp: { x: number; z: number; yaw: number }, idx: number) => {
              if (players[idx]) {
                players[idx].x = sp.x;
                players[idx].z = sp.z;
                players[idx].yaw = sp.yaw;
              }
            });
          }
        }
      } catch {
        // Ignore parse error
      }
    };

    if (wsRef.current) {
      wsRef.current.addEventListener('message', handleWsMessage);
    }

    const resetPositions = (kickoffTeam: 'blue' | 'red' = 'blue') => {
      ball.x = kickoffTeam === 'blue' ? -0.5 : 0.5;
      ball.y = 0.6;
      ball.z = 0;
      ball.vx = 0;
      ball.vy = 0;
      ball.vz = 0;
      ball.spinY = 0;
      ball.bouncedOffWall = false;
      ball.roofStuckTimer = 0;

      players.forEach((p) => {
        p.x = p.homeX;
        p.z = p.homeZ;
        p.vx = 0;
        p.vz = 0;
        p.yaw = p.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
      });
    };

    const triggerCourtyardGag = (gag: GagId) => {
      soundEngine.playGagSound(gag);
      gagCooldown = 7.0;

      if (gag === 'vecchia_buca') {
        activeGag = {
          id: gag,
          title: 'LA VECCHIA HA BUCATO IL PALLONE!',
          subtitle: 'Signora Maria: "Mo\' ve lo taglio co\' le forbici!" — Pallone bucato per 20s!',
          timestamp: Date.now(),
        };
        callbacksRef.current.onBallProfileChange('bucato');
        bucatoRevertTimer = 20.0;
        ball.x = -7.0;
        ball.y = 2.5;
        ball.z = -8.5;
        ball.vx = 2.5;
        ball.vy = 2.0;
        ball.vz = 5.5;
      } else if (gag === 'finestra_rotta') {
        activeGag = {
          id: gag,
          title: 'FINESTRA DEL CONDOMINIO ROTTA!',
          subtitle: 'Vetro in frantumi! "Chi è stato?!" — Scappa prima che scenda il condomino!',
          timestamp: Date.now(),
        };
        windowBrokenTimer = 12.0;
        envRefs.windowGlassMesh.visible = false;

        // Spawn 20 ballistic glass shards
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
      } else if (gag === 'allarme_auto') {
        activeGag = {
          id: gag,
          title: 'ALLARME DELLA PANDA ATTIVATO!',
          subtitle: 'BEEP! BEEP! BEEP! Rimbalzo elettrico sul cofano!',
          timestamp: Date.now(),
        };
        carAlarmTimer = 6.0;
        ball.vx = 6.0;
        ball.vy = 5.0;
        ball.vz = -7.5;
      } else if (gag === 'palla_tetto') {
        activeGag = {
          id: gag,
          title: 'PALLONE FINITO SUL TETTO!',
          subtitle: 'È rimasto incastrato tra le tegole... Lanciano il Super Santos di riserva!',
          timestamp: Date.now(),
        };
        ball.roofStuckTimer = 2.6;
      } else if (gag === 'tombino_fogna') {
        activeGag = {
          id: gag,
          title: 'PALLA NEL TOMBINO!',
          subtitle: 'PLOP! Sparita nella griglia... Entra in campo il Super Santos di scorta!',
          timestamp: Date.now(),
        };
        callbacksRef.current.onBallProfileChange('supersantos');
        ball.x = 0;
        ball.y = 3.5;
        ball.z = 0;
        ball.vx = (Math.random() - 0.5) * 4;
        ball.vy = 4;
        ball.vz = (Math.random() - 0.5) * 4;
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let lastTime = performance.now();
    let frameId = 0;
    let lastRenderedBallProfile: BallProfileId = stateRef.current.ballProfile;
    let lastRenderedScale = stateRef.current.renderScale;
    let telemetryAccumulator = 0;
    let networkBroadcastAccumulator = 0;
    let framesInWindow = 0;
    let smoothedFps = 60;
    let smoothedFrameMs = 4.2;

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

    const tick = () => {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05); // Clamped frame delta time

      const st = stateRef.current;

      // Dynamic render scale update for weak hardware
      if (st.renderScale !== lastRenderedScale) {
        lastRenderedScale = st.renderScale;
        renderer.setPixelRatio(baseRatio * st.renderScale);
      }

      // Dynamic Pitch rebuild if changed
      if (st.pitch !== currentBuiltPitch) {
        currentBuiltPitch = st.pitch;
        scene.remove(envRefs.group);
        envRefs = buildCourtyardEnvironment(currentBuiltPitch, maxAniso);
        scene.add(envRefs.group);
      }

      // Match reset check
      if (shouldResetMatchRef.current) {
        shouldResetMatchRef.current = false;
        scoreBlue = 0;
        scoreRed = 0;
        paliBlue = 0;
        paliRed = 0;
        stylePointsBlue = 0;
        stylePointsRed = 0;
        timeRemaining = 180;
        activeGag = null;
        resetPositions('blue');
        soundEngine.playWhistle(false);
      }

      // Manual Gag Trigger from UI button
      if (manualGagTriggerRef.current) {
        const req = manualGagTriggerRef.current;
        manualGagTriggerRef.current = null;
        triggerCourtyardGag(req.gag);
      }

      // Weather lighting & atmosphere update
      const wCfg = WEATHER_CONFIGS[st.weather];
      scene.background = _vec3A.set(0, 0, 0) && new THREE.Color(wCfg.skyColor);
      if (!scene.fog || !(scene.fog instanceof THREE.FogExp2)) {
        scene.fog = new THREE.FogExp2(wCfg.fogColor, wCfg.fogDensity);
      } else {
        scene.fog.color.set(wCfg.fogColor);
        scene.fog.density = wCfg.fogDensity;
      }
      sunLight.color.set(wCfg.sunColor);
      sunLight.intensity = wCfg.sunIntensity;
      hemiLight.color.set(wCfg.hemiSky);
      hemiLight.groundColor.set(wCfg.hemiGround);

      // Weather particles update
      weatherParticles.visible = st.weather === 'pioggia' || st.weather === 'vento';
      if (weatherParticles.visible) {
        const posAttr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = posAttr.array as Float32Array;
        const vy = st.weather === 'pioggia' ? -18 : -2.2;
        const vx = wCfg.windVector[0] * 1.8;
        for (let i = 0; i < particleCount; i++) {
          arr[i * 3] += vx * dt;
          arr[i * 3 + 1] += vy * dt;
          if (arr[i * 3 + 1] < 0) {
            arr[i * 3 + 1] = 14;
            arr[i * 3] = (Math.random() - 0.5) * 36;
          }
          if (arr[i * 3] > 19) arr[i * 3] = -19;
          if (arr[i * 3] < -19) arr[i * 3] = 19;
        }
        posAttr.needsUpdate = true;
      }

      // Ball Texture & Squash/Deflate visual update
      if (st.ballProfile !== lastRenderedBallProfile) {
        lastRenderedBallProfile = st.ballProfile;
        ballMat.map = ballTextures[st.ballProfile];
        ballMat.needsUpdate = true;
        ball.currentRadius = BALL_PROFILES[st.ballProfile].visualRadius;
      }

      const inputMgr = inputManagerRef.current;
      const p1Input = inputMgr
        ? inputMgr.samplePlayer1(dt, st.gameMode !== 'local_2p')
        : null;
      const p2Input =
        inputMgr && st.gameMode === 'local_2p'
          ? inputMgr.samplePlayer2(dt)
          : remoteClientInput;

      if (p1Input?.cameraToggleJustPressed) {
        const nextCam: CameraMode = st.cameraMode === 'classic' ? 'fps' : 'classic';
        callbacksRef.current.onCameraModeChange(nextCam);
      }

      if (p1Input?.ballCycleJustPressed) {
        const order: BallProfileId[] = ['supersantos', 'classico', 'bagnato', 'bucato'];
        const nextProfile = order[(order.indexOf(st.ballProfile) + 1) % order.length];
        callbacksRef.current.onBallProfileChange(nextProfile);
      }

      // Simulation Step when playing and not paused
      if (st.isPlaying && !st.isPaused) {
        timeRemaining = Math.max(0, timeRemaining - dt);
        if (gagCooldown > 0) gagCooldown = Math.max(0, gagCooldown - dt);
        if (goalCelebrationTimer > 0) goalCelebrationTimer = Math.max(0, goalCelebrationTimer - dt);

        // Rain auto-soaks the ball after 45s of heavy rain
        if (st.weather === 'pioggia' && st.ballProfile === 'classico') {
          rainExposureTimer += dt;
          if (rainExposureTimer > 45) {
            rainExposureTimer = 0;
            callbacksRef.current.onBallProfileChange('bagnato');
            lastBanner = {
              title: 'PALLONE INZUPPATO!',
              subtitle: 'La pioggia ha reso il pallone di cuoio pesante come il piombo!',
              expiresAt: now + 4000,
            };
          }
        }

        // Revert punctured ball ("pallone nuovo dal cortile") after 20s
        if (bucatoRevertTimer > 0) {
          bucatoRevertTimer -= dt;
          if (bucatoRevertTimer <= 0 && st.ballProfile === 'bucato') {
            callbacksRef.current.onBallProfileChange('supersantos');
            lastBanner = {
              title: 'PALLA NUOVA IN CAMPO!',
              subtitle: 'È uscito un Super Santos nuovo di zecca!',
              expiresAt: now + 3200,
            };
          }
        }

        // Window repair timer
        if (windowBrokenTimer > 0) {
          windowBrokenTimer -= dt;
          if (windowBrokenTimer <= 0) {
            envRefs.windowGlassMesh.visible = true;
          }
        }

        // Car alarm flashing lights
        if (carAlarmTimer > 0) {
          carAlarmTimer -= dt;
          const flashOn = Math.floor(carAlarmTimer * 8) % 2 === 0;
          envRefs.carHeadlights.forEach((hl) => {
            hl.visible = flashOn;
          });
        } else {
          envRefs.carHeadlights.forEach((hl) => {
            hl.visible = true;
          });
        }

        // Update glass shards ballistic physics
        for (let i = glassShards.length - 1; i >= 0; i--) {
          const sh = glassShards[i];
          sh.life -= dt;
          sh.vy -= 14 * dt;
          sh.mesh.position.x += sh.vx * dt;
          sh.mesh.position.y += sh.vy * dt;
          sh.mesh.position.z += sh.vz * dt;
          sh.mesh.rotation.x += 6 * dt;
          sh.mesh.rotation.y += 5 * dt;
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

        // Update Players (Controlled + AI)
        const pitchCfg = PITCH_CONFIGS[st.pitch];
        const grip = wCfg.playerGripMultiplier / Math.sqrt(pitchCfg.groundFriction);

        players.forEach((p, idx) => {
          const isBlueControlled = idx === activeBlueIdx;
          const isRedControlled =
            (st.gameMode === 'local_2p' || (st.gameMode === 'online_lan' && st.onlineRoomCode)) &&
            idx === activeRedIdx;

          if (p.kickAnimTimer > 0) p.kickAnimTimer = Math.max(0, p.kickAnimTimer - dt);
          if (p.slideTimer > 0) p.slideTimer = Math.max(0, p.slideTimer - dt);

          let targetVx = 0;
          let targetVz = 0;

          if (isBlueControlled && p1Input) {
            const speed = (p1Input.sprint ? 8.6 : 6.2) * (p.slideTimer > 0 ? 1.25 : 1.0);
            if (st.cameraMode === 'fps') {
              // FPS Mode: W/S moves forward/back along player yaw, A/D strafes, Mouse/Q/R/RightStick turns yaw
              p.yaw -= p1Input.lookDeltaX;
              p.pitchLook = THREE.MathUtils.clamp(p.pitchLook - p1Input.lookDeltaY, -0.65, 0.45);
              // Also allow A/D to gently steer yaw while moving if mouse isn't locked
              if (!document.pointerLockElement && Math.abs(p1Input.moveX) > 0.1) {
                p.yaw -= p1Input.moveX * 2.1 * dt;
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
              // Classic Camera Mode: Direct world-space WASD movement
              targetVx = p1Input.moveX * speed;
              targetVz = p1Input.moveZ * speed;
              if (Math.hypot(targetVx, targetVz) > 0.25) {
                p.yaw = Math.atan2(targetVx, targetVz);
              }
            }

            // Slide Tackle
            if (p1Input.tackleJustPressed && p.slideTimer <= 0) {
              p.slideTimer = 0.42;
              p.vx += Math.sin(p.yaw) * 6.5;
              p.vz += Math.cos(p.yaw) * 6.5;
            }
          } else if (isRedControlled && p2Input) {
            const speed = p2Input.sprint ? 8.6 : 6.2;
            targetVx = p2Input.moveX * speed;
            targetVz = p2Input.moveZ * speed;
            if (Math.hypot(targetVx, targetVz) > 0.25) {
              p.yaw = Math.atan2(targetVx, targetVz);
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
              const aiSpeed = p.role === 'attacker' ? 5.6 : 5.1;
              targetVx = (dx / dLen) * aiSpeed;
              targetVz = (dz / dLen) * aiSpeed;
              p.yaw = Math.atan2(targetVx, targetVz);
            }
          }

          // Smooth velocity damping with weather grip
          const accel = 11.5 * grip;
          p.vx = THREE.MathUtils.damp(p.vx, targetVx, accel, dt);
          p.vz = THREE.MathUtils.damp(p.vz, targetVz, accel, dt);

          p.x = THREE.MathUtils.clamp(p.x + p.vx * dt, -15.6, 15.6);
          p.z = THREE.MathUtils.clamp(p.z + p.vz * dt, -9.6, 9.6);

          // Ball Dribbling, Kicking, Passing & "Cappello / Tunnel" Detection
          const dBall = Math.hypot(ball.x - p.x, ball.z - p.z);
          if (dBall < 1.25 && ball.y < 1.75 && ball.roofStuckTimer <= 0) {
            const prof = BALL_PROFILES[st.ballProfile];
            const massFactor = 0.43 / prof.mass; // Lighter balls like Super Santos fly much faster!
            ball.lastTouchTeam = p.team;

            const kickDirX = Math.sin(p.yaw);
            const kickDirZ = Math.cos(p.yaw);

            if (isBlueControlled && p1Input) {
              if (p1Input.shootJustReleased) {
                const pwr = THREE.MathUtils.lerp(13, 27, p1Input.shootCharge) * Math.pow(massFactor, 0.35);
                ball.vx = kickDirX * pwr + p.vx * 0.35;
                ball.vz = kickDirZ * pwr + p.vz * 0.35;
                ball.vy = THREE.MathUtils.lerp(2.8, 7.6, p1Input.shootCharge);
                ball.spinY = (p1Input.moveX || (Math.random() - 0.5)) * 7.5;
                p.kickAnimTimer = 0.32;
                soundEngine.playKick(st.ballProfile, p1Input.shootCharge);
              } else if (p1Input.passJustPressed) {
                // Crisp Ground Pass toward nearest teammate in front
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
                // "Cappello / Scavetto" High Lob!
                ball.vx = kickDirX * 11.5;
                ball.vz = kickDirZ * 11.5;
                ball.vy = 9.4;
                p.kickAnimTimer = 0.3;
                soundEngine.playKick(st.ballProfile, 0.65);

                // Check if an opponent is right in front for "+1 Cappello!" bonus
                const oppNear = players.some(
                  (op) => op.team !== p.team && Math.hypot(op.x - (p.x + kickDirX * 2.2), op.z - (p.z + kickDirZ * 2.2)) < 2.2,
                );
                if (oppNear) {
                  stylePointsBlue += 1;
                  lastBanner = {
                    title: 'CAPPELLO DI CLASSE! (+1 STILE)',
                    subtitle: 'Pallonetto morbido sopra la testa dell’avversario!',
                    expiresAt: now + 2600,
                  };
                }
              } else {
                // Soft Dribble keep-close touch
                const dribbleDist = 0.78;
                ball.x = THREE.MathUtils.damp(ball.x, p.x + kickDirX * dribbleDist, 14, dt);
                ball.z = THREE.MathUtils.damp(ball.z, p.z + kickDirZ * dribbleDist, 14, dt);
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
              // AI Action when touching ball
              const targetGoalX = p.team === 'blue' ? 15.5 : -15.5;
              const gx = targetGoalX - p.x;
              const gz = (Math.random() - 0.5) * 3.2 - p.z;
              const gLen = Math.hypot(gx, gz) || 1;

              if (Math.abs(targetGoalX - p.x) < 11.5 && Math.random() < 0.08) {
                // AI Shoots toward goal
                ball.vx = (gx / gLen) * 18.5;
                ball.vz = (gz / gLen) * 18.5;
                ball.vy = 3.2 + Math.random() * 2.5;
                p.kickAnimTimer = 0.3;
                soundEngine.playKick(st.ballProfile, 0.7);
              } else {
                // AI Dribbles forward
                ball.vx = (gx / gLen) * 7.2;
                ball.vz = (gz / gLen) * 7.2;
              }
            }
          }

          // Update 3D Player Rig Transform & Procedural Limb Animation
          p.rig.root.position.set(p.x, p.slideTimer > 0 ? -0.25 : 0, p.z);
          p.rig.root.rotation.y = p.yaw;

          // Hide active player's upper body ONLY in FPS mode so camera isn't blocked, while keeping boots visible!
          p.rig.upperBodyGroup.visible = !(isBlueControlled && st.cameraMode === 'fps');

          // Update selection ring color/opacity
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

          // Procedural Stride & Kick Animation
          const moveSpeed = Math.hypot(p.vx, p.vz);
          const swing = Math.sin(now * 0.014 + idx) * Math.min(1, moveSpeed / 5.5) * 0.68;
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

        // Update Ball Physics (Super Santos Wobble, Magnus Spin, Wind, Deflation, Courtyard Collisions)
        const bProf = BALL_PROFILES[st.ballProfile];

        if (ball.roofStuckTimer > 0) {
          ball.roofStuckTimer -= dt;
          ball.x = 0;
          ball.y = 9.2;
          ball.z = -11.2;
          if (ball.roofStuckTimer <= 0) {
            ball.x = 0;
            ball.y = 4.5;
            ball.z = -4.0;
            ball.vx = (Math.random() - 0.5) * 3;
            ball.vy = 2;
            ball.vz = 5.5;
          }
        } else {
          // Deflation logic for 'bucato'
          if (bProf.deflate && ball.currentRadius > bProf.deflate.minRadius) {
            ball.currentRadius = Math.max(
              bProf.deflate.minRadius,
              ball.currentRadius - bProf.deflate.rate * dt,
            );
          }

          const speedXZ = Math.hypot(ball.vx, ball.vz);
          const totalSpeed = Math.hypot(ball.vx, ball.vy, ball.vz);

          // 1. Gravity
          ball.vy -= 17.5 * dt;

          // 2. Wind Vector * Ball Wind Factor
          ball.vx += wCfg.windVector[0] * bProf.windFactor * 0.25 * dt;
          ball.vz += wCfg.windVector[2] * bProf.windFactor * 0.25 * dt;

          // 3. Magnus Effect (Lateral Spin Curve)
          if (speedXZ > 1.5 && Math.abs(ball.spinY) > 0.05) {
            const perpX = -ball.vz / speedXZ;
            const perpZ = ball.vx / speedXZ;
            const magnusForce = ball.spinY * bProf.magnus * 1.4;
            ball.vx += perpX * magnusForce * dt;
            ball.vz += perpZ * magnusForce * dt;
            ball.spinY *= Math.pow(0.45, dt);
          }

          // 4. Super Santos & Bucato Chaotic Aerodynamic Wobble
          if (bProf.wobble && totalSpeed > bProf.wobble.speedMin && ball.y > 0.55) {
            const perpX = -ball.vz / (speedXZ || 1);
            const perpZ = ball.vx / (speedXZ || 1);
            const wobbleOsc = Math.sin(now * 0.001 * bProf.wobble.freqHz * Math.PI * 2);
            ball.vx += perpX * wobbleOsc * bProf.wobble.force * dt;
            ball.vz += perpZ * wobbleOsc * bProf.wobble.force * dt;
          }

          // 5. Air & Ground Rolling Drag
          const drag = Math.pow(1 - bProf.linearDrag, dt * 60);
          ball.vx *= drag;
          ball.vz *= drag;

          if (ball.y <= ball.currentRadius + 0.03) {
            const rollDrag = Math.pow(
              1 - bProf.rollFriction * pitchCfg.groundFriction,
              dt * 60,
            );
            ball.vx *= rollDrag;
            ball.vz *= rollDrag;
          }

          // Advance position
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          ball.z += ball.vz * dt;

          // Ground Bounce
          if (ball.y < ball.currentRadius) {
            const impactSpeed = Math.abs(ball.vy);
            ball.y = ball.currentRadius;
            if (impactSpeed > 1.4) {
              soundEngine.playBounce(st.ballProfile, impactSpeed);
              ball.vy = impactSpeed * bProf.restitution * wCfg.ballRestitutionMultiplier;
            } else {
              ball.vy = 0;
            }
          }

          // Goalpost Collisions ("Pali / Giubbotti")
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
                    title: '3 PALI = GOL CELESTINI!',
                    subtitle: 'Terzo palo colpito: scatta il gol automatico secondo la regola del cortile!',
                    expiresAt: now + 3500,
                  };
                } else {
                  lastBanner = {
                    title: 'PALO PIENO!',
                    subtitle: `Scheggiato il giubbotto! (Pali Blu: ${paliBlue})`,
                    expiresAt: now + 2200,
                  };
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
                title: bonusSponda > 1 ? 'GOL DI SPONDA DOPPIO! (+2)' : 'GOOOL DEI CELESTINI!',
                subtitle:
                  st.streetRule === 'chi_segna_vince'
                    ? ' Regola Chi Segna Vince: Vittoria immediata!'
                    : `Palla insaccata con il ${bProf.name}!`,
                expiresAt: now + 3600,
              };
            } else {
              scoreRed += bonusSponda;
              lastBanner = {
                title: bonusSponda > 1 ? 'GOL DI SPONDA RIVALI! (+2)' : 'GOL DEI RIVALI DEL RIONE!',
                subtitle: 'Palla tra i giubbotti!',
                expiresAt: now + 3600,
              };
            }

            soundEngine.playGoalCheer();
            goalCelebrationTimer = 2.0;
            resetPositions(scoredByBlue ? 'red' : 'blue');
          }

          // Courtyard Gag Volume Triggers (When Gags Enabled)
          if (st.gagsEnabled && gagCooldown <= 0) {
            // 1. Signora Maria Balcony (X around -8, Z < -9.3, Y > 2.0)
            if (ball.z < -9.3 && ball.x > -10.8 && ball.x < -5.2 && ball.y > 1.8) {
              triggerCourtyardGag('vecchia_buca');
            }
            // 2. Breakable Window (X around +7.5, Z < -9.3, Y > 1.8)
            else if (ball.z < -9.3 && ball.x > 5.2 && ball.x < 9.8 && ball.y > 1.8 && windowBrokenTimer <= 0) {
              triggerCourtyardGag('finestra_rotta');
            }
            // 3. Ball on the Roof (Z < -8.8 and Y > 5.8)
            else if (ball.z < -8.8 && ball.y > 5.8) {
              triggerCourtyardGag('palla_tetto');
            }
            // 4. Parked Car Alarm (Z > 9.3 and X < -8.5)
            else if (ball.z > 9.3 && ball.x < -8.2) {
              triggerCourtyardGag('allarme_auto');
            }
            // 5. Storm Drain Tombino (Near X = 9.5, Z = 8.8, low speed)
            else if (Math.hypot(ball.x - 9.5, ball.z - 8.8) < 0.78 && ball.y < 0.5 && speedXZ < 5.5) {
              triggerCourtyardGag('tombino_fogna');
            }
          }

          // Courtyard Perimeter Bounce Walls ("Sponda")
          if (Math.abs(ball.z) > 9.8) {
            ball.z = Math.sign(ball.z) * 9.8;
            ball.vz = -ball.vz * pitchCfg.wallRestitution;
            ball.bouncedOffWall = true;
            soundEngine.playBounce(st.ballProfile, Math.abs(ball.vz));
          }
          if (Math.abs(ball.x) > 15.8 && Math.abs(ball.z) >= 2.65) {
            ball.x = Math.sign(ball.x) * 15.8;
            ball.vx = -ball.vx * pitchCfg.wallRestitution;
            ball.bouncedOffWall = true;
            soundEngine.playBounce(st.ballProfile, Math.abs(ball.vx));
          }
        }

        // Update 3D Ball Mesh Position, Spin & Squash-and-Stretch
        ballMesh.position.set(ball.x, ball.y, ball.z);
        ballMesh.rotation.x += ball.vz * dt * 2.1;
        ballMesh.rotation.z -= ball.vx * dt * 2.1;
        if (st.ballProfile === 'bucato') {
          ballMesh.scale.set(1.08, 0.72, 1.08);
        } else {
          ballMesh.scale.set(1, 1, 1);
        }

        ballShadow.position.set(ball.x, 0.02, ball.z);
        const shadowScale = Math.max(0.35, 1 - (ball.y - 0.4) * 0.12);
        ballShadow.scale.set(shadowScale, shadowScale, 1);

        // Broadcast Host state to Online/LAN room at 25Hz
        networkBroadcastAccumulator += dt;
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
                },
                scoreBlue,
                scoreRed,
                timeRemaining,
                players: players.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw })),
              },
            }),
          );
        } else if (
          st.gameMode === 'online_lan' &&
          !st.isOnlineHost &&
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
      }

      // Camera Choreography: Seamless Transition between FPS POV and Classic TV Camera
      const activePlayer = players[activeBlueIdx];
      if (!st.isPlaying) {
        // Title Screen Atmospheric Courtyard Orbit Camera
        const orbitAngle = now * 0.00022;
        camera.position.set(Math.sin(orbitAngle) * 18, 9.5, Math.cos(orbitAngle) * 18);
        camera.lookAt(0, 1.4, 0);
      } else if (st.cameraMode === 'fps') {
        // First-Person Shooter (POV) Mode from Active Player's Eyes!
        const speed = Math.hypot(activePlayer.vx, activePlayer.vz);
        const headBob = Math.sin(now * 0.016) * Math.min(1, speed / 6) * 0.065;
        const eyeX = activePlayer.x + Math.sin(activePlayer.yaw) * 0.18;
        const eyeY = (activePlayer.slideTimer > 0 ? 1.05 : 1.66) + headBob;
        const eyeZ = activePlayer.z + Math.cos(activePlayer.yaw) * 0.18;

        camera.position.set(eyeX, eyeY, eyeZ);

        const lookDist = 10;
        const lookX = eyeX + Math.sin(activePlayer.yaw) * Math.cos(activePlayer.pitchLook) * lookDist;
        const lookY = eyeY + Math.sin(activePlayer.pitchLook) * lookDist;
        const lookZ = eyeZ + Math.cos(activePlayer.yaw) * Math.cos(activePlayer.pitchLook) * lookDist;
        camera.lookAt(lookX, lookY, lookZ);

        // Dynamic sprint FOV widening in FPS mode
        const targetFov = p1Input?.sprint && speed > 4 ? 76 : 68;
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 8, dt);
        camera.updateProjectionMatrix();
      } else {
        // Classic Broadcast / FIFA Street Wide Dynamic Camera ("Da Lontano")
        const focusX = THREE.MathUtils.clamp(ball.x * 0.65 + activePlayer.x * 0.35, -9.5, 9.5);
        const focusZ = THREE.MathUtils.clamp(ball.z * 0.5, -4.5, 4.5);

        _camTargetPos.set(focusX, 12.8, focusZ + 18.2);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, 5.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, 5.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, 5.5, dt);

        _camLookAt.set(focusX, 0.7, focusZ - 1.2);
        camera.lookAt(_camLookAt);

        if (Math.abs(camera.fov - 52) > 0.2) {
          camera.fov = THREE.MathUtils.damp(camera.fov, 52, 8, dt);
          camera.updateProjectionMatrix();
        }
      }

      inputMgr?.endFrame();

      const renderStart = performance.now();
      renderer.render(scene, camera);
      const renderElapsed = performance.now() - renderStart;
      framesInWindow += 1;
      smoothedFrameMs = smoothedFrameMs * 0.85 + renderElapsed * 0.15;

      // Update React HUD Telemetry at ~12Hz so React never slows down the 60fps loop
      telemetryAccumulator += dt;
      if (telemetryAccumulator >= 0.12) {
        const instantFps = Math.min(120, Math.round(framesInWindow / telemetryAccumulator));
        smoothedFps = Math.round(smoothedFps * 0.65 + instantFps * 0.35);
        framesInWindow = 0;
        telemetryAccumulator = 0;

        if (lastBanner && now > lastBanner.expiresAt) {
          lastBanner = null;
        }
        if (activeGag && Date.now() - activeGag.timestamp > 5200) {
          activeGag = null;
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
          shootCharge: p1Input?.shootCharge || 0,
          cameraMode: st.cameraMode,
          connectedGamepads: inputMgr?.connectedGamepads || [],
          activeGag,
          lastBanner: lastBanner ? { title: lastBanner.title, subtitle: lastBanner.subtitle } : null,
          pointerLocked: Boolean(document.pointerLockElement),
          fps: smoothedFps,
          frameTimeMs: Number(smoothedFrameMs.toFixed(1)),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          isSoftwareGl,
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
