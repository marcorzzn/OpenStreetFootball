import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Copy,
  Gamepad2,
  Globe,
  Keyboard,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { HudTelemetry, StreetPitchCanvas } from './components/StreetPitchCanvas';
import { InputManager } from './game/inputManager';
import { generateMatchSeed } from './game/rng';
import {
  BALL_PROFILES,
  BallProfileId,
  CameraMode,
  GAG_CONFIGS,
  GagId,
  GameMode,
  PITCH_CONFIGS,
  PitchId,
  STREET_RULES,
  StreetRuleId,
  WEATHER_CONFIGS,
  WeatherId,
} from './types/game';

interface NetworkRoomSummary {
  code: string;
  name: string;
  playerCount: number;
  pitch: string;
  ballProfile: string;
  weather: string;
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>('single');
  const [cameraMode, setCameraMode] = useState<CameraMode>('classic');
  const [ballProfile, setBallProfile] = useState<BallProfileId>('supersantos');
  const [weather, setWeather] = useState<WeatherId>('tramonto');
  const [pitch, setPitch] = useState<PitchId>('cortile');
  const [streetRule, setStreetRule] = useState<StreetRuleId>('classica');
  const [ruleTunnelEnabled, setRuleTunnelEnabled] = useState<boolean>(true);
  const [ruleCappelloEnabled, setRuleCappelloEnabled] = useState<boolean>(true);
  const [beachWavesEnabled, setBeachWavesEnabled] = useState<boolean>(true);
  const [renderScale, setRenderScale] = useState<number>(1.0);
  const [autoRenderScale, setAutoRenderScale] = useState<boolean>(false);
  const [showPerfMonitor, setShowPerfMonitor] = useState<boolean>(true);
  const [gagsEnabled, setGagsEnabled] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDockTab, setActiveDockTab] = useState<'pallone' | 'ambiente' | 'gag' | 'rete'>('pallone');
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false);
  const [showControlsModal, setShowControlsModal] = useState<boolean>(false);
  const [showReleaseModal, setShowReleaseModal] = useState<boolean>(false);
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);

  const [triggerGagRequest, setTriggerGagRequest] = useState<{ gag: GagId; seq: number } | null>(null);
  const [resetMatchSeq, setResetMatchSeq] = useState<number>(0);
  const [matchSeed, setMatchSeed] = useState<number>(() => generateMatchSeed());

  // Multiplayer Online / LAN State
  const [playerName, setPlayerName] = useState<string>('Marco_10');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [isOnlineHost, setIsOnlineHost] = useState<boolean>(true);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [availableRooms, setAvailableRooms] = useState<NetworkRoomSummary[]>([]);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Live HUD Telemetry from 60fps loop
  const [telemetry, setTelemetry] = useState<HudTelemetry>({
    scoreBlue: 0,
    scoreRed: 0,
    paliBlue: 0,
    paliRed: 0,
    stylePointsBlue: 0,
    stylePointsRed: 0,
    timeRemaining: 180,
    ballProfile: 'supersantos',
    ballSpeedKmh: 0,
    shootCharge: 0,
    cameraMode: 'classic',
    connectedGamepads: [],
    activeGag: null,
    lastBanner: null,
    pointerLocked: false,
    fps: 60,
    frameTimeMs: 3.8,
    drawCalls: 42,
    triangles: 4800,
    isSoftwareGl: false,
    physicsStepsLastFrame: 1,
    cameraFar: 140,
    activeGagStateLabel: 'nessuna gag',
    trickPopup: null,
  });

  const inputManagerRef = useRef<InputManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joystickTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const lowFpsStrikeRef = useRef<number>(0);

  useEffect(() => {
    const mgr = new InputManager();
    inputManagerRef.current = mgr;
    if (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 1024) {
      setShowTouchControls(true);
    }
    return () => {
      mgr.dispose();
    };
  }, []);

  // Auto-Scale Render Resolution Guard for Weak GPUs
  useEffect(() => {
    if (!autoRenderScale || !isPlaying || isPaused) return;
    if (telemetry.fps < 42 && !telemetry.isSoftwareGl) {
      lowFpsStrikeRef.current += 1;
      if (lowFpsStrikeRef.current >= 4) {
        lowFpsStrikeRef.current = 0;
        setRenderScale((prev) => (prev > 0.75 ? 0.75 : prev > 0.5 ? 0.5 : prev));
      }
    } else {
      lowFpsStrikeRef.current = 0;
    }
  }, [autoRenderScale, isPlaying, isPaused, telemetry.fps, telemetry.isSoftwareGl]);

  const startNewMatchWithSeed = useCallback(() => {
    if (gameMode !== 'online_lan' || isOnlineHost) {
      const nextSeed = generateMatchSeed();
      setMatchSeed(nextSeed);
      if (
        gameMode === 'online_lan' &&
        isOnlineHost &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        wsRef.current.send(JSON.stringify({ type: 'match_start', seed: nextSeed }));
      }
    }
  }, [gameMode, isOnlineHost]);

  // Keyboard shortcuts for Pause (Esc), Dock Collapse (H), Perf Monitor (F3), and Start Match (Enter/Space)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (
        !isPlaying &&
        (e.code === 'Enter' || e.code === 'Space') &&
        !showNetworkModal &&
        !showControlsModal &&
        !showReleaseModal
      ) {
        e.preventDefault();
        soundEngine.playWhistle(false);
        startNewMatchWithSeed();
        setIsPlaying(true);
        setIsPaused(false);
      } else if (isPlaying && e.code === 'Escape') {
        setIsPaused((prev) => !prev);
      } else if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'F3') {
        e.preventDefault();
        setShowPerfMonitor((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, showNetworkModal, showControlsModal, showReleaseModal, startNewMatchWithSeed]);

  const refreshNetworkInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data = await res.json();
        setLanIps(data.lanIps || []);
        setAvailableRooms(data.rooms || []);
      }
    } catch {
      // Ignore on static hosts like GitHub Pages / Itch.io
    }
  }, []);

  useEffect(() => {
    refreshNetworkInfo();
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'list_rooms' }));
      };

      ws.onclose = () => {
        setWsConnected(false);
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'room_joined' || msg.type === 'room_updated') {
            const room = msg.room;
            setOnlineRoomCode(room.code);
            const myId = msg.playerId;
            if (myId) {
              setIsOnlineHost(room.hostId === myId);
            }
            if (room.pitch) setPitch(room.pitch as PitchId);
            if (room.ballProfile) setBallProfile(room.ballProfile as BallProfileId);
            if (room.weather) setWeather(room.weather as WeatherId);
            if (room.rule) setStreetRule(room.rule as StreetRuleId);
            if (typeof room.seed === 'number') setMatchSeed(room.seed >>> 0);
            setGameMode('online_lan');
            setNetworkError(null);
          } else if (msg.type === 'match_start' && typeof msg.seed === 'number') {
            setMatchSeed(msg.seed >>> 0);
          } else if (msg.type === 'rooms_list') {
            setAvailableRooms(
              (msg.rooms || []).map(
                (r: {
                  code: string;
                  name: string;
                  players?: unknown[];
                  pitch: string;
                  ballProfile: string;
                  weather: string;
                }) => ({
                  code: r.code,
                  name: r.name,
                  playerCount: Array.isArray(r.players) ? r.players.length : 1,
                  pitch: r.pitch,
                  ballProfile: r.ballProfile,
                  weather: r.weather,
                }),
              ),
            );
          } else if (msg.type === 'error') {
            setNetworkError(msg.message);
          }
        } catch {
          // Ignore non-JSON
        }
      };

      return () => {
        ws.close();
      };
    } catch {
      return undefined;
    }
  }, [refreshNetworkInfo]);

  const handleCreateOnlineRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNetworkError('Server WebSocket non rilevato (avvia con npm run dev in locale per la LAN).');
      return;
    }
    const nextSeed = generateMatchSeed();
    setMatchSeed(nextSeed);
    wsRef.current.send(
      JSON.stringify({
        type: 'create_room',
        playerName,
        pitch,
        ballProfile,
        weather,
        rule: streetRule,
        seed: nextSeed,
      }),
    );
  };

  const handleJoinOnlineRoom = (codeToJoin?: string) => {
    const targetCode = (codeToJoin || joinCodeInput).toUpperCase().trim();
    if (!targetCode) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNetworkError('Server WebSocket non rilevato.');
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: 'join_room',
        code: targetCode,
        playerName,
      }),
    );
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.muted = next;
  };

  const copyCommunityPitch = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedPitchId(id);
    setTimeout(() => setCopiedPitchId(null), 2200);
  };

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleWeatherChange = (nextWeather: WeatherId) => {
    setWeather(nextWeather);
    // TODO (Fase F): Se in multiplayer (gameMode === 'online_lan') e isOnlineHost è true,
    // inviare qui il messaggio WebSocket (es. room_config / world_state) per sincronizzare
    // il cambio di meteo con tutti i client connessi nella stanza.
  };

  const currentBall = BALL_PROFILES[ballProfile];
  const currentWeather = WEATHER_CONFIGS[weather];
  const currentPitch = PITCH_CONFIGS[pitch];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 text-stone-100 select-none">
      {/* 1. Full-Viewport 3D WebGL Courtyard Canvas */}
      <StreetPitchCanvas
        isPlaying={isPlaying}
        isPaused={isPaused}
        gameMode={gameMode}
        cameraMode={cameraMode}
        onCameraModeChange={setCameraMode}
        ballProfile={ballProfile}
        onBallProfileChange={setBallProfile}
        weather={weather}
        pitch={pitch}
        streetRule={streetRule}
        ruleTunnelEnabled={ruleTunnelEnabled}
        ruleCappelloEnabled={ruleCappelloEnabled}
        renderScale={renderScale}
        gagsEnabled={gagsEnabled}
        triggerGagRequest={triggerGagRequest}
        resetMatchSeq={resetMatchSeq}
        matchSeed={matchSeed}
        inputManagerRef={inputManagerRef}
        wsRef={wsRef}
        isOnlineHost={isOnlineHost}
        onlineRoomCode={onlineRoomCode}
        onTelemetryUpdate={setTelemetry}
      />

      {/* In-Game Performance Monitor Badge (stats-gl style: FPS, Frame ms, Physics Steps, Draw Calls, Triangles, Render Scale + Weather/camera.far + Pitch/Rules) */}
      {showPerfMonitor && (
        <div className="fixed top-3 left-3 z-20 px-3 py-1.5 bg-stone-950/92 border border-stone-700/80 rounded-lg font-mono-num text-[11px] text-stone-300 flex flex-col gap-0.5 pointer-events-auto">
          <div className="flex items-center gap-2.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className={telemetry.fps >= 50 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
              {telemetry.fps} FPS
            </span>
            <span>·</span>
            <span>{telemetry.frameTimeMs} ms</span>
            <span>·</span>
            <span className="text-sky-300">Phys: {telemetry.physicsStepsLastFrame} step/f</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{telemetry.drawCalls} draw</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">{(telemetry.triangles / 1000).toFixed(1)}k tri</span>
            <span>·</span>
            <span className="text-amber-300">Scale {Math.round(renderScale * 100)}%</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400 pl-6">
            <span>
              Meteo: <strong className="text-stone-200">{currentWeather.name}</strong> ({weather})
            </span>
            <span>·</span>
            <span>
              camera.far: <strong className="text-emerald-300">{telemetry.cameraFar}m</strong>
            </span>
            <span>·</span>
            <span>
              Gag: <strong className="text-amber-300">{telemetry.activeGagStateLabel}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400 pl-6">
            <span>
              Campo: <strong className="text-stone-200">{currentPitch.name}</strong> ({pitch})
            </span>
            <span>·</span>
            <span>
              Regole:{' '}
              <strong className="text-emerald-300">
                {STREET_RULES[streetRule].name}
                {ruleTunnelEnabled ? ' + Tunnel' : ''}
                {ruleCappelloEnabled ? ' + Cappello' : ''}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* 2. TITLE SCREEN OVERLAY (When not playing) */}
      {!isPlaying && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none bg-gradient-to-t from-stone-950/90 via-stone-950/35 to-stone-950/75">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-6 pointer-events-auto mt-7 sm:mt-0">
            <div className="flex items-center gap-3 sm:pl-64">
              <span className="font-display text-2xl font-extrabold tracking-tight text-amber-400">
                OPENSTREETFOOTBALL
              </span>
              <span className="text-xs text-stone-300 hidden lg:inline">
                · Open-Source MIT · Web & Android
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowReleaseModal(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/80 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pubblica & Community</span>
              </button>

              <button
                onClick={() => {
                  refreshNetworkInfo();
                  setShowNetworkModal(true);
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-100 border border-stone-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span>Lobby Online / LAN {onlineRoomCode ? `(${onlineRoomCode})` : ''}</span>
              </button>

              <button
                onClick={() => setShowControlsModal(true)}
                className="px-3.5 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-100 border border-stone-700 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 text-sky-400" />
                <span>Comandi & Controller</span>
              </button>

              <button
                onClick={toggleMute}
                aria-label="Audio Toggle"
                className="p-2 bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700 rounded-lg transition-colors cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
              </button>
            </div>
          </div>

          {/* Center-Left Bespoke Inline SVG Title Lockup over open negative space */}
          <div className="my-auto max-w-2xl pointer-events-auto">
            <div className="text-xs font-medium tracking-wider text-amber-300 mb-2">
              CALCIO DA CORTILE OPEN-SOURCE · FISICA DEI PALLONI · VISUALE FPS & TV
            </div>

            <svg
              viewBox="0 0 720 145"
              className="w-full max-w-xl h-auto mb-4 drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]"
              role="img"
              aria-label="OpenStreetFootball"
            >
              <defs>
                <linearGradient id="osfGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="55%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              <circle cx="62" cy="72" r="48" fill="url(#osfGrad)" stroke="#18181b" strokeWidth="5" />
              <path
                d="M 22 48 Q 62 72 102 48 M 20 92 Q 62 70 104 92 M 62 24 L 62 120"
                stroke="#18181b"
                strokeWidth="4.5"
                fill="none"
              />
              <text
                x="132"
                y="74"
                fill="#fafaf9"
                fontFamily="'Barlow Condensed', sans-serif"
                fontWeight="800"
                fontStyle="italic"
                fontSize="64"
                letterSpacing="1"
              >
                OPENSTREETFOOTBALL
              </text>
              <text
                x="134"
                y="116"
                fill="#fbbf24"
                fontFamily="'Barlow Condensed', sans-serif"
                fontWeight="700"
                fontSize="30"
                letterSpacing="3"
              >
                CALCIO DA STRADA · PRIMA PERSONA & CLASSICO
              </text>
            </svg>

            <p className="text-sm md:text-base text-stone-200 max-w-xl leading-relaxed mb-6">
              Scegli se giocare <strong className="text-amber-300">da lontano</strong> come nei classici arcade o
              entrare negli occhi del calciatore in <strong className="text-sky-300">Prima Persona (FPS)</strong>.
              Calcia il leggero <em>pallone di plastica</em>, sfida la pioggia col pallone di cuoio pesante e attento
              alla finestra del condominio e alle forbici della Signora Maria!
            </p>

            {/* Quick Mode & Camera Selector Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6 max-w-2xl">
              <div className="bg-stone-900/90 border border-stone-700/80 rounded-xl p-3">
                <div className="text-[11px] text-stone-400 mb-1.5">Visuale di Gioco (Tasto C)</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setCameraMode('classic')}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      cameraMode === 'classic'
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    Classica TV
                  </button>
                  <button
                    onClick={() => setCameraMode('fps')}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      cameraMode === 'fps'
                        ? 'bg-sky-400 text-stone-950'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    Prima Persona
                  </button>
                </div>
              </div>

              <div className="bg-stone-900/90 border border-stone-700/80 rounded-xl p-3">
                <div className="text-[11px] text-stone-400 mb-1.5">Pallone (Tasto B)</div>
                <select
                  value={ballProfile}
                  onChange={(e) => setBallProfile(e.target.value as BallProfileId)}
                  className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-stone-700 focus:outline-none"
                >
                  {Object.values(BALL_PROFILES).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-stone-900/90 border border-stone-700/80 rounded-xl p-3">
                <div className="text-[11px] text-stone-400 mb-1.5">Modalità Giocatori</div>
                <select
                  value={gameMode}
                  onChange={(e) => {
                    const val = e.target.value as GameMode;
                    setGameMode(val);
                    if (val === 'online_lan') {
                      refreshNetworkInfo();
                      setShowNetworkModal(true);
                    }
                  }}
                  className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-stone-700 focus:outline-none"
                >
                  <option value="single">1P vs IA del Rione (3v3)</option>
                  <option value="local_2p">2P Locale (Tastiera / 2 Pad)</option>
                  <option value="online_lan">Online / LAN Stanza</option>
                </select>
              </div>

              <div className="bg-stone-900/90 border border-stone-700/80 rounded-xl p-3">
                <div className="text-[11px] text-stone-400 mb-1.5">Gag classiche</div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setGagsEnabled(true)}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      gagsEnabled
                        ? 'bg-amber-500 text-stone-950'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    Sì
                  </button>
                  <button
                    onClick={() => setGagsEnabled(false)}
                    className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      !gagsEnabled
                        ? 'bg-rose-500 text-stone-950'
                        : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>

            {/* Primary Start CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => {
                  soundEngine.playWhistle(false);
                  startNewMatchWithSeed();
                  setIsPlaying(true);
                  setIsPaused(false);
                }}
                className="px-7 py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-display text-2xl font-extrabold tracking-wide rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6 fill-stone-950" />
                <span>SCENDI IN CORTILE (INVIO)</span>
              </button>

              <span className="text-xs text-stone-300">
                {telemetry.connectedGamepads.length > 0
                  ? `Controller Rilevato: ${telemetry.connectedGamepads[0]}`
                  : 'Tastiera Prioritaria Attiva · Collega un Controller USB/Bluetooth in qualsiasi momento'}
              </span>
            </div>
          </div>

          {/* Flat Control-Hint Footer Line */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-stone-300 border-t border-stone-800/80 pt-3 pointer-events-auto">
            <div>
              <strong className="text-amber-300">WASD</strong> Muovi ·{' '}
              <strong className="text-amber-300">Shift</strong> Scatta ·{' '}
              <strong className="text-amber-300">Spazio / J</strong> Tira (Carica) ·{' '}
              <strong className="text-amber-300">K</strong> Passa / Cambia Uomo ·{' '}
              <strong className="text-amber-300">L</strong> Cappello ·{' '}
              <strong className="text-amber-300">C</strong> Visuale (FPS/TV) ·{' '}
              <strong className="text-amber-300">F3</strong> Profiler FPS ·{' '}
              <strong className="text-amber-300">Esc</strong> Pausa
            </div>
            <div className="text-stone-400">
              Licenza MIT (`/LICENSE` & `/README.md` inclusi) · Pronto per GitHub Pages, Itch.io & Android
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIVE GAMEPLAY HUD (Low-Occlusion Perimeter + Collapsible Bottom Dock) */}
      {isPlaying && (
        <>
          {/* Top-Center Street Scoreboard & Status Bar */}
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 bg-stone-950/92 border border-stone-700/90 rounded-xl shadow-lg pointer-events-auto">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-sky-500 inline-block" />
              <span className="font-display text-lg font-bold tracking-wide text-sky-400">AZZURRI</span>
              <span className="font-mono-num text-2xl font-bold text-stone-100 px-1.5">
                {telemetry.scoreBlue}
              </span>
            </div>

            <div className="px-3 py-0.5 bg-stone-900 border border-stone-800 rounded-lg text-center">
              <div className="font-mono-num text-base font-bold text-amber-400">
                {formatClock(telemetry.timeRemaining)}
              </div>
              <div className="text-[10px] text-stone-400 whitespace-nowrap">
                {telemetry.ballSpeedKmh} km/h · {currentBall.name}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono-num text-2xl font-bold text-stone-100 px-1.5">
                {telemetry.scoreRed}
              </span>
              <span className="font-display text-lg font-bold tracking-wide text-rose-400">RIVALI</span>
              <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" />
            </div>

            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-stone-800 text-xs text-stone-300">
              <span>Pali: {telemetry.paliBlue}-{telemetry.paliRed}</span>
              <span>·</span>
              <span>Stile: +{telemetry.stylePointsBlue}</span>
            </div>

            <div className="flex items-center gap-1.5 pl-2 border-l border-stone-800">
              <button
                onClick={() => setCameraMode(cameraMode === 'classic' ? 'fps' : 'classic')}
                title="Cambia Visuale (Tasto C)"
                className="px-2.5 py-1 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{cameraMode === 'fps' ? 'FPS POV' : 'TV Lontano'}</span>
              </button>

              <button
                onClick={() => setShowTouchControls((prev) => !prev)}
                title="Mostra/Nascondi Comandi Touch Android"
                className={`p-1.5 rounded-md border transition-colors cursor-pointer ${
                  showTouchControls
                    ? 'bg-sky-500/25 border-sky-400 text-sky-300'
                    : 'bg-stone-900 border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleMute}
                className="p-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 rounded-md transition-colors cursor-pointer"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsPaused((prev) => !prev)}
                className="p-1.5 bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-700 rounded-md transition-colors cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* FPS Crosshair & Power Charge Indicator */}
          {cameraMode === 'fps' && !isPaused && (
            <div className="fixed inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
              <div className="w-6 h-6 rounded-full border-2 border-amber-400/80 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
              </div>
              {!telemetry.pointerLocked && (
                <div className="mt-3 px-2.5 py-1 bg-stone-950/85 border border-stone-700 rounded text-[11px] text-amber-300">
                  Clicca sul campo per ruotare la visuale col Mouse (oppure usa Q/R o lo Stick Destro)
                </div>
              )}
            </div>
          )}

          {/* Shot Power Charge Bar */}
          {telemetry.shootCharge > 0.02 && (
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-10 w-44 bg-stone-950/90 border border-stone-700 rounded-lg p-1.5 pointer-events-none">
              <div className="text-[10px] font-bold text-amber-300 text-center mb-1">
                POTENZA TIRO ({Math.round(telemetry.shootCharge * 100)}%)
              </div>
              <div className="w-full h-2.5 bg-stone-800 rounded overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
                  style={{ width: `${Math.round(telemetry.shootCharge * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Short Street Trick Popup ("TUNNEL +1" / "CAPPELLO +1") */}
          {telemetry.trickPopup && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 px-5 py-1.5 bg-emerald-500 text-stone-950 font-display text-2xl font-extrabold tracking-wider rounded-xl shadow-lg border-2 border-amber-300 pointer-events-none">
              {telemetry.trickPopup.label} ({telemetry.trickPopup.team === 'blue' ? 'AZZURRI' : 'RIVALI'})
            </div>
          )}

          {/* Gag or Goal Dynamic Notification Toast */}
          {(telemetry.activeGag || telemetry.lastBanner) && (
            <div className="fixed top-28 left-1/2 -translate-x-1/2 z-10 max-w-md w-[92vw] px-4 py-3 bg-stone-950/95 border border-amber-500/70 rounded-xl shadow-xl text-center pointer-events-none">
              <div className="font-display text-xl font-extrabold tracking-wide text-amber-400">
                {telemetry.activeGag ? telemetry.activeGag.title : telemetry.lastBanner?.title}
              </div>
              <div className="text-xs text-stone-200 mt-0.5">
                {telemetry.activeGag ? telemetry.activeGag.subtitle : telemetry.lastBanner?.subtitle}
              </div>
            </div>
          )}

          {/* Android / Mobile Virtual Touch Controls Overlay */}
          {showTouchControls && !isPaused && (
            <div className="fixed inset-x-0 bottom-20 z-10 flex items-end justify-between px-6 pointer-events-none">
              <div
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  joystickTouchStartRef.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchMove={(e) => {
                  const start = joystickTouchStartRef.current;
                  if (!start || !inputManagerRef.current) return;
                  const t = e.touches[0];
                  const dx = Math.max(-1, Math.min(1, (t.clientX - start.x) / 48));
                  const dy = Math.max(-1, Math.min(1, (t.clientY - start.y) / 48));
                  setJoystickKnob({ x: dx * 32, y: dy * 32 });
                  inputManagerRef.current.touchMoveX = dx;
                  inputManagerRef.current.touchMoveZ = dy;
                }}
                onTouchEnd={() => {
                  joystickTouchStartRef.current = null;
                  setJoystickKnob({ x: 0, y: 0 });
                  if (inputManagerRef.current) {
                    inputManagerRef.current.touchMoveX = 0;
                    inputManagerRef.current.touchMoveZ = 0;
                  }
                }}
                className="w-28 h-28 rounded-full bg-stone-950/80 border-2 border-stone-600 flex items-center justify-center pointer-events-auto touch-none"
              >
                <div
                  className="w-12 h-12 rounded-full bg-amber-500/90 border border-amber-200 shadow-md"
                  style={{ transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pointer-events-auto touch-none">
                <button
                  onTouchStart={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchShootHeld = true;
                  }}
                  onTouchEnd={() => {
                    if (inputManagerRef.current) {
                      inputManagerRef.current.touchShootHeld = false;
                      inputManagerRef.current.touchShootJustReleased = true;
                    }
                  }}
                  onMouseDown={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchShootHeld = true;
                  }}
                  onMouseUp={() => {
                    if (inputManagerRef.current) {
                      inputManagerRef.current.touchShootHeld = false;
                      inputManagerRef.current.touchShootJustReleased = true;
                    }
                  }}
                  className="w-16 h-16 rounded-2xl bg-rose-600 active:bg-rose-500 text-white font-display font-bold text-base border border-rose-400 shadow-lg"
                >
                  TIRO
                </button>
                <button
                  onClick={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchLobJustPressed = true;
                  }}
                  className="w-16 h-16 rounded-2xl bg-amber-500 active:bg-amber-400 text-stone-950 font-display font-bold text-sm border border-amber-300 shadow-lg"
                >
                  CAPPELLO
                </button>
                <button
                  onClick={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchPassJustPressed = true;
                  }}
                  className="w-16 h-16 rounded-2xl bg-sky-600 active:bg-sky-500 text-white font-display font-bold text-sm border border-sky-300 shadow-lg"
                >
                  PASSA
                </button>
                <button
                  onTouchStart={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchSprint = true;
                  }}
                  onTouchEnd={() => {
                    if (inputManagerRef.current) inputManagerRef.current.touchSprint = false;
                  }}
                  className="w-16 h-16 rounded-2xl bg-emerald-600 active:bg-emerald-500 text-white font-display font-bold text-sm border border-emerald-300 shadow-lg"
                >
                  SCATTA
                </button>
              </div>
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock */}
          <div
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(940px,95vw)] transition-transform duration-200 pointer-events-auto"
            style={{
              transform: dockCollapsed ? 'translate(-50%, calc(100% - 34px))' : 'translate(-50%, 0)',
            }}
          >
            <div className="flex justify-center">
              <button
                onClick={() => setDockCollapsed((prev) => !prev)}
                className="px-4 py-1 bg-stone-950/95 hover:bg-stone-900 text-stone-300 text-xs font-semibold border border-b-0 border-stone-700 rounded-t-lg flex items-center gap-1.5 cursor-pointer"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
                    <span>Mostra Regia Cortile (H)</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Modalità Cinema / Nascondi Dock (H)</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-stone-950/95 border border-stone-700/90 rounded-xl p-3 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-stone-800">
                <div className="flex items-center gap-1 bg-stone-900 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveDockTab('pallone')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'pallone'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    1. Pallone & Visuale
                  </button>
                  <button
                    onClick={() => setActiveDockTab('ambiente')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'ambiente'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    2. Meteo, Campo & Regole
                  </button>
                  <button
                    onClick={() => setActiveDockTab('gag')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'gag'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    3. Gag del Cortile
                  </button>
                  <button
                    onClick={() => setActiveDockTab('rete')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'rete'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    4. Rete LAN & Prestazioni
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      startNewMatchWithSeed();
                      setResetMatchSeq((s) => s + 1);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Palla al Centro</span>
                  </button>
                  <button
                    onClick={() => setShowReleaseModal(true)}
                    className="px-2.5 py-1 text-xs font-semibold bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/70 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Open Source</span>
                  </button>
                  <button
                    onClick={() => setShowControlsModal(true)}
                    className="px-2.5 py-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Tasti</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: Ball Profiles & Camera Mode */}
              {activeDockTab === 'pallone' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.values(BALL_PROFILES).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setBallProfile(b.id)}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          ballProfile === b.id
                            ? 'bg-amber-500/20 border-amber-400 text-stone-100'
                            : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-stone-100 truncate">{b.name}</span>
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                            style={{ backgroundColor: b.primaryColor }}
                          />
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          {b.mass}kg · Rimbalzo {Math.round(b.restitution * 100)}%
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="md:col-span-4 flex flex-col gap-1.5 bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-300">Visuale Telecamera (C)</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setCameraMode('classic')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                            cameraMode === 'classic'
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          Classica TV
                        </button>
                        <button
                          onClick={() => setCameraMode('fps')}
                          className={`px-2.5 py-1 text-xs font-semibold rounded cursor-pointer ${
                            cameraMode === 'fps'
                              ? 'bg-sky-400 text-stone-950'
                              : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          Prima Persona FPS
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-stone-400 truncate">{currentBall.subtitle}</p>
                  </div>
                </div>
              )}

              {/* Tab 2: Weather, Pitch & Street Rules */}
              {activeDockTab === 'ambiente' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                      <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                      <span>Condizione Meteo ({currentWeather.name})</span>
                    </label>
                    <select
                      value={weather}
                      onChange={(e) => handleWeatherChange(e.target.value as WeatherId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2.5 py-1.5 border border-stone-700"
                    >
                      {Object.values(WEATHER_CONFIGS).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-stone-400 flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-amber-400" />
                        <span>Campo ({currentPitch.name})</span>
                      </label>
                      {pitch === 'spiaggia' && (
                        <button
                          onClick={() => {
                            const next = !beachWavesEnabled;
                            setBeachWavesEnabled(next);
                            soundEngine.wavesEnabled = next;
                            soundEngine.setBeachWavesActive(isPlaying && !isPaused && next);
                          }}
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded border cursor-pointer ${
                            beachWavesEnabled
                              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                              : 'bg-stone-800 text-stone-400 border-stone-700'
                          }`}
                        >
                          Onde mare: {beachWavesEnabled ? 'Sì' : 'No'}
                        </button>
                      )}
                    </div>
                    <select
                      value={pitch}
                      onChange={(e) => setPitch(e.target.value as PitchId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2.5 py-1.5 border border-stone-700"
                    >
                      {Object.values(PITCH_CONFIGS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Regolamento da Strada + Bonus (+1)</span>
                    </label>
                    <select
                      value={streetRule}
                      onChange={(e) => setStreetRule(e.target.value as StreetRuleId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2.5 py-1.5 border border-stone-700 mb-1.5"
                    >
                      {Object.values(STREET_RULES).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleTunnelEnabled}
                          onChange={(e) => setRuleTunnelEnabled(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <span>Tunnel (+1)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleCappelloEnabled}
                          onChange={(e) => setRuleCappelloEnabled(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <span>Cappello (+1)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Courtyard / Beach Gags & Interactive Triggers (filtered by current pitch) */}
              {activeDockTab === 'gag' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-200">Gag classiche:</span>
                    <div className="inline-flex rounded-lg border border-stone-700 overflow-hidden">
                      <button
                        onClick={() => setGagsEnabled(true)}
                        className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          gagsEnabled ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        Sì
                      </button>
                      <button
                        onClick={() => setGagsEnabled(false)}
                        className={`px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                          !gagsEnabled ? 'bg-rose-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        No
                      </button>
                    </div>
                    <span className="text-[11px] text-stone-400 hidden lg:inline">
                      (Gag disponibili su {currentPitch.name}:)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.values(GAG_CONFIGS)
                      .filter((g) => g.allowedPitches.includes(pitch))
                      .map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setTriggerGagRequest({ gag: g.id, seq: Date.now() })}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-700/70 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          {g.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Tab 4: LAN / Multiplayer & Hardware Render Scale + Profiler */}
              {activeDockTab === 'rete' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-stone-300">Modalità:</span>
                    {(['single', 'local_2p', 'online_lan'] as GameMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setGameMode(m);
                          if (m === 'online_lan') {
                            refreshNetworkInfo();
                            setShowNetworkModal(true);
                          }
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                          gameMode === m
                            ? 'bg-amber-500 text-stone-950'
                            : 'bg-stone-900 text-stone-300 border border-stone-800'
                        }`}
                      >
                        {m === 'single' ? '1P vs IA' : m === 'local_2p' ? '2P Locale' : 'Online / LAN'}
                      </button>
                    ))}

                    <button
                      onClick={() => {
                        refreshNetworkInfo();
                        setShowNetworkModal(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-md cursor-pointer"
                    >
                      Stanza LAN {onlineRoomCode ? `[${onlineRoomCode}]` : ''}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-xs text-stone-300">Render Scale:</span>
                    {[0.5, 0.75, 1.0].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => {
                          setAutoRenderScale(false);
                          setRenderScale(scale);
                        }}
                        className={`px-2 py-1 text-xs font-mono-num font-semibold rounded cursor-pointer ${
                          renderScale === scale && !autoRenderScale
                            ? 'bg-emerald-500 text-stone-950'
                            : 'bg-stone-900 text-stone-400 border border-stone-800'
                        }`}
                      >
                        {Math.round(scale * 100)}%
                      </button>
                    ))}
                    <button
                      onClick={() => setAutoRenderScale((prev) => !prev)}
                      className={`px-2 py-1 text-xs font-semibold rounded cursor-pointer ${
                        autoRenderScale
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-900 text-stone-400 border border-stone-800'
                      }`}
                    >
                      Auto-FPS
                    </button>
                    <button
                      onClick={() => setShowPerfMonitor((prev) => !prev)}
                      className={`px-2 py-1 text-xs font-semibold rounded cursor-pointer ${
                        showPerfMonitor
                          ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                          : 'bg-stone-900 text-stone-400 border border-stone-800'
                      }`}
                    >
                      HUD FPS (F3)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 4. PAUSE MODAL */}
      {isPlaying && isPaused && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="font-display text-3xl font-extrabold text-amber-400 mb-1">PARTITA IN PAUSA</h2>
            <p className="text-xs text-stone-400 mb-5">
              {currentPitch.name} · {currentBall.name} · {STREET_RULES[streetRule].name}
            </p>

            <div className="space-y-2.5 mb-6">
              <button
                onClick={() => setIsPaused(false)}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Riprendi Partita (Esc)
              </button>
              <button
                onClick={() => {
                  startNewMatchWithSeed();
                  setResetMatchSeq((s) => s + 1);
                  setIsPaused(false);
                }}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-100 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Ricomincia da 0-0
              </button>
              <button
                onClick={() => {
                  setIsPaused(false);
                  setIsPlaying(false);
                }}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                Torna alla Schermata del Titolo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ONLINE & LAN MULTIPLAYER MODAL */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400" />
                <h2 className="font-display text-2xl font-extrabold text-stone-100">
                  MULTIPLAYER ONLINE, LAN & LOCALE
                </h2>
              </div>
              <button
                onClick={() => setShowNetworkModal(false)}
                className="text-xs text-stone-400 hover:text-stone-100 px-2 py-1 rounded bg-stone-800 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-stone-400 mb-1">Il tuo Soprannome in Cortile</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 font-semibold"
                />
              </div>

              {onlineRoomCode ? (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-600/60 rounded-xl">
                  <div className="text-emerald-300 font-bold text-sm">
                    Stanza Attiva: <span className="font-mono-num text-lg">{onlineRoomCode}</span>{' '}
                    ({isOnlineHost ? 'Sei l’Host Autoritativo' : 'Connesso come Sfidante'})
                  </div>
                  <p className="text-stone-300 mt-1">
                    Condividi il codice <strong>{onlineRoomCode}</strong> con un amico sul browser o sulla stessa
                    rete Wi-Fi/LAN!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleCreateOnlineRoom}
                    className="py-3 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    + Crea Nuova Stanza Host
                  </button>

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Codice (es. K7M9P)"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-stone-100 font-mono-num uppercase"
                    />
                    <button
                      onClick={() => handleJoinOnlineRoom()}
                      className="px-4 bg-sky-500 hover:bg-sky-400 text-stone-950 font-bold rounded-xl cursor-pointer shrink-0"
                    >
                      Entra
                    </button>
                  </div>
                </div>
              )}

              {networkError && <div className="text-rose-400 font-semibold">{networkError}</div>}

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-stone-300">
                    Stanze Aperte sul Server ({availableRooms.length})
                  </span>
                  <button
                    onClick={refreshNetworkInfo}
                    className="text-amber-400 hover:underline cursor-pointer"
                  >
                    Aggiorna
                  </button>
                </div>
                {availableRooms.length === 0 ? (
                  <div className="text-stone-500 py-2">
                    Nessuna stanza aperta al momento. Clicca &ldquo;Crea Nuova Stanza Host&rdquo; per iniziare!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {availableRooms.map((r) => (
                      <div
                        key={r.code}
                        className="flex items-center justify-between bg-stone-900 px-3 py-2 rounded-lg border border-stone-800"
                      >
                        <div>
                          <span className="font-mono-num font-bold text-amber-400 mr-2">{r.code}</span>
                          <span className="text-stone-200 font-medium">{r.name}</span>
                          <span className="text-stone-400 ml-2">({r.playerCount} gioc.)</span>
                        </div>
                        <button
                          onClick={() => handleJoinOnlineRoom(r.code)}
                          className="px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded font-semibold cursor-pointer"
                        >
                          Unisciti
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-400">
                <div className="font-semibold text-stone-200 mb-1">
                  Connessione Diretta LAN / Smartphone Android sulla stessa Wi-Fi:
                </div>
                <div>
                  Stato WebSocket: <strong className="text-emerald-400">{wsConnected ? 'Connesso' : 'Modalità Statica / Offline'}</strong>
                  {lanIps.length > 0 && (
                    <span className="ml-2 font-mono-num text-amber-300">
                      Indirizzo LAN: http://{lanIps[0]}:3000
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. OPEN-SOURCE RELEASE, PERFORMANCE & COMMUNITY HUB MODAL */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-emerald-400">
                  ROADMAP OPEN-SOURCE, PERFORMANCE & COMMUNITY
                </h2>
                <p className="text-xs text-stone-400">
                  Tutto pronto nel progetto per GitHub Pages, Itch.io, Licenza MIT e raccolta feedback.
                </p>
              </div>
              <button
                onClick={() => setShowReleaseModal(false)}
                className="text-xs text-stone-400 hover:text-stone-100 px-2.5 py-1 rounded bg-stone-800 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Phase 1 & 2 */}
              <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-amber-400 mb-1">
                  Fase 1 & 2 Completate: Build Relativa (`base: './'`), `LICENSE` MIT & `README.md`
                </div>
                <p className="text-stone-300 leading-relaxed">
                  I file <code className="text-emerald-300">/LICENSE</code> (MIT) e{' '}
                  <code className="text-emerald-300">/README.md</code> sono presenti nella radice del progetto, e{' '}
                  <code className="text-emerald-300">vite.config.ts</code> usa già percorsi relativi per funzionare
                  subito su <strong>GitHub Pages</strong>, nell’iframe ZIP di <strong>Itch.io</strong> (&ldquo;This file
                  will be played in the browser&rdquo;) e in una WebView <strong>Android</strong>.
                </p>
              </div>

              {/* Phase 3: Live Hardware Benchmark */}
              <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sky-400">
                    Fase 3: Telemetria GPU in Tempo Reale (Tasto F3)
                  </span>
                  <span className="font-mono-num text-emerald-400 font-bold">
                    {telemetry.fps} FPS · {telemetry.frameTimeMs} ms · {telemetry.drawCalls} Draw Calls
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-stone-400">Testa subito il Render Scale:</span>
                  {[0.5, 0.75, 1.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setAutoRenderScale(false);
                        setRenderScale(s);
                      }}
                      className={`px-2.5 py-1 rounded font-mono-num font-semibold cursor-pointer ${
                        renderScale === s && !autoRenderScale
                          ? 'bg-sky-400 text-stone-950'
                          : 'bg-stone-800 text-stone-300'
                      }`}
                    >
                      {Math.round(s * 100)}%
                    </button>
                  ))}
                  <button
                    onClick={() => setAutoRenderScale((prev) => !prev)}
                    className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                      autoRenderScale ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300'
                    }`}
                  >
                    Auto-Adattamento GPU Deboli: {autoRenderScale ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Phase 4: Ready-to-copy Community Feedback Pitches */}
              <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl space-y-2.5">
                <div className="font-bold text-emerald-400">
                  Fase 4: Post Pronti per la Community (Clicca per Copiare)
                </div>

                <div className="flex items-center justify-between gap-3 bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                  <div className="text-stone-300">
                    <strong className="text-stone-100">Reddit IT (`r/IndieHackingItalia`, `r/GameDevelopersItaly`) & GameLoop.it</strong>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      Chiede feedback specifico sulla fisica del pallone di plastica, sulla doppia visuale FPS/TV e sulle performance su GPU integrate.
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      copyCommunityPitch(
                        'it',
                        `Ciao a tutti! Sto sviluppando "OpenStreetFootball", un gioco di calcio da strada 3D open-source (MIT) nel browser ispirato al calcio amatoriale tra ragazzini.\n\nPotete passare in tempo reale (Tasto C) dalla visuale classica da lontano alla Prima Persona (FPS), e cambiare la fisica del pallone (pallone di plastica leggerissimo che curva col vento, pallone bagnato pesante, pallone bucato dalla vecchia del cortile).\n\nCerco feedback specifici su:\n1) La traiettoria/rimbalzo del pallone di plastica vi sembra divertente o troppo imprevedibile?\n2) Come gira su portatili con GPU integrata usando il selettore Render Scale (50%/75%/100%)?`,
                      )
                    }
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-lg font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedPitchId === 'it' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPitchId === 'it' ? 'Copiato!' : 'Copia Post IT'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                  <div className="text-stone-300">
                    <strong className="text-stone-100">Reddit INT (`r/DestroyMyGame`, `r/IndieGaming`, `r/gamedev`)</strong>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      Post in inglese focalizzato sul passaggio istantaneo First-Person POV / Broadcast Camera e sulle gag fisiche.
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      copyCommunityPitch(
                        'en',
                        `I built "OpenStreetFootball", a zero-asset procedural 3D street football browser game (MIT Open Source) where you can switch mid-play between a classic Broadcast Camera and First-Person POV (C key).\n\nIt features real aerodynamic profiles for cheap plastic street balls (chaotic wobble + Magnus curve), heavy waterlogged balls, and courtyard hazards (shattering condo windows, a neighbor who punctures your ball).\n\nLooking for brutal feedback on:\n1) Does the First-Person POV feel readable when dribbling and charging shots?\n2) How does the frame rate hold up on low-end laptops?`,
                      )
                    }
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-lg font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedPitchId === 'en' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPitchId === 'en' ? 'Copiato!' : 'Copia Post EN'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONTROLS & CONTROLLER PRIORITY MODAL */}
      {showControlsModal && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl font-extrabold text-amber-400">
                PRIORITÀ TASTIERA, CONTROLLER ESTERNI & ANDROID
              </h2>
              <button
                onClick={() => setShowControlsModal(false)}
                className="text-xs text-stone-400 hover:text-stone-100 px-2 py-1 rounded bg-stone-800 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-200">
              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-amber-400 mb-1.5">
                  1. Giocatore 1 — Tastiera Prioritaria (PC / Browser)
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-stone-300">
                  <div><strong className="text-stone-100">WASD</strong>: Movimento / Dribbling</div>
                  <div><strong className="text-stone-100">Shift Sinistro</strong>: Scatto Veloce</div>
                  <div><strong className="text-stone-100">Spazio / J</strong>: Tiro (Tieni premuto per caricare)</div>
                  <div><strong className="text-stone-100">K / X</strong>: Passaggio Rasoterra / Cambia Uomo</div>
                  <div><strong className="text-stone-100">L / Z</strong>: Scavetto / &ldquo;Cappello&rdquo;</div>
                  <div><strong className="text-stone-100">E / F</strong>: Scivolata / Contrasto</div>
                  <div><strong className="text-stone-100">C / V</strong>: Passa tra Prima Persona (FPS) e TV</div>
                  <div><strong className="text-stone-100">B / F3</strong>: Cambia Pallone / Profiler FPS</div>
                  <div className="col-span-2">
                    <strong className="text-sky-300">Visuale FPS</strong>: Clicca sul campo per guardare col Mouse, oppure usa <strong className="text-stone-100">Q / R</strong> per ruotare lo sguardo.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-sky-400 mb-1">
                  2. Giocatore 2 in Locale (Stessa Tastiera)
                </div>
                <p className="text-stone-300">
                  Attiva <strong>2P Locale</strong>: usa <strong className="text-stone-100">Frecce Direzionali</strong> per muoverti,{' '}
                  <strong className="text-stone-100">Invio</strong> per tirare,{' '}
                  <strong className="text-stone-100">Shift Destro</strong> per passare e{' '}
                  <strong className="text-stone-100">M</strong> per il pallonetto!
                </p>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-emerald-400 mb-1">
                  3. Controller Esterni USB / Bluetooth (Xbox, PlayStation, Android Gamepad)
                </div>
                <p className="text-stone-300">
                  Supporto plug-and-play nativo: <strong>Stick Sinistro</strong> muove, <strong>Stick Destro</strong>{' '}
                  ruota lo sguardo in FPS, <strong>RT/R2</strong> scatta, <strong>A/Croce</strong> passa/cambia uomo,{' '}
                  <strong>X/Quadrato</strong> tira, <strong>Y/Triangolo</strong> fa il cappello,{' '}
                  <strong>Select/R3</strong> cambia telecamera FPS/TV.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
