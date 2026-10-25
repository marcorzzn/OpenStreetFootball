import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Gamepad2,
  Globe,
  Keyboard,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import { HudTelemetry, StreetPitchCanvas } from './components/StreetPitchCanvas';
import { InputManager } from './game/inputManager';
import {
  BALL_PROFILES,
  BallProfileId,
  CameraMode,
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
  const [renderScale, setRenderScale] = useState<number>(1.0);
  const [gagsEnabled, setGagsEnabled] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDockTab, setActiveDockTab] = useState<'pallone' | 'ambiente' | 'gag' | 'rete'>('pallone');
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false);
  const [showControlsModal, setShowControlsModal] = useState<boolean>(false);

  const [triggerGagRequest, setTriggerGagRequest] = useState<{ gag: GagId; seq: number } | null>(null);
  const [resetMatchSeq, setResetMatchSeq] = useState<number>(0);

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
  });

  const inputManagerRef = useRef<InputManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joystickTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const mgr = new InputManager();
    inputManagerRef.current = mgr;
    // Auto-enable touch overlay on touch-primary devices (Android / mobile)
    if (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 1024) {
      setShowTouchControls(true);
    }
    return () => {
      mgr.dispose();
    };
  }, []);

  // Keyboard shortcuts for Pause (Esc), Dock Collapse (H), and Start Match (Enter/Space on Title Screen)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!isPlaying && (e.code === 'Enter' || e.code === 'Space') && !showNetworkModal && !showControlsModal) {
        e.preventDefault();
        soundEngine.playWhistle(false);
        setIsPlaying(true);
        setIsPaused(false);
      } else if (isPlaying && e.code === 'Escape') {
        setIsPaused((prev) => !prev);
      } else if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, showNetworkModal, showControlsModal]);

  // Fetch LAN IP info and connect WebSocket for Online/LAN Multiplayer
  const refreshNetworkInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data = await res.json();
        setLanIps(data.lanIps || []);
        setAvailableRooms(data.rooms || []);
      }
    } catch {
      // Ignore offline fetch
    }
  }, []);

  useEffect(() => {
    refreshNetworkInfo();
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
          setGameMode('online_lan');
          setNetworkError(null);
        } else if (msg.type === 'rooms_list') {
          setAvailableRooms(
            (msg.rooms || []).map((r: { code: string; name: string; players?: unknown[]; pitch: string; ballProfile: string; weather: string }) => ({
              code: r.code,
              name: r.name,
              playerCount: Array.isArray(r.players) ? r.players.length : 1,
              pitch: r.pitch,
              ballProfile: r.ballProfile,
              weather: r.weather,
            })),
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
  }, [refreshNetworkInfo]);

  const handleCreateOnlineRoom = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNetworkError('Connessione WebSocket non attiva.');
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: 'create_room',
        playerName,
        pitch,
        ballProfile,
        weather,
        rule: streetRule,
      }),
    );
  };

  const handleJoinOnlineRoom = (codeToJoin?: string) => {
    const targetCode = (codeToJoin || joinCodeInput).toUpperCase().trim();
    if (!targetCode) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setNetworkError('Connessione WebSocket non attiva.');
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

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
        renderScale={renderScale}
        gagsEnabled={gagsEnabled}
        triggerGagRequest={triggerGagRequest}
        resetMatchSeq={resetMatchSeq}
        inputManagerRef={inputManagerRef}
        wsRef={wsRef}
        isOnlineHost={isOnlineHost}
        onlineRoomCode={onlineRoomCode}
        onTelemetryUpdate={setTelemetry}
      />

      {/* 2. TITLE SCREEN OVERLAY (When not playing) */}
      {!isPlaying && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none bg-gradient-to-t from-stone-950/90 via-stone-950/35 to-stone-950/75">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-6 pointer-events-auto">
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl font-extrabold tracking-tight text-amber-400">
                CORTILE CELESTINI
              </span>
              <span className="text-xs text-stone-300 hidden sm:inline">
                · Open-Source Web & Android Street Football
              </span>
            </div>

            <div className="flex items-center gap-3">
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
              ISPIRATO ALLA COMPAGNIA DEI CELESTINI · FISICA REALE SUPER SANTOS · FPS & TV CAMERA
            </div>

            <svg
              viewBox="0 0 680 145"
              className="w-full max-w-xl h-auto mb-4 drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]"
              role="img"
              aria-label="Cortile Celestini Street Football"
            >
              <defs>
                <linearGradient id="celestiniGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="55%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
              </defs>
              {/* Stylized Super Santos Ball Emblem */}
              <circle cx="62" cy="72" r="48" fill="url(#celestiniGrad)" stroke="#18181b" strokeWidth="5" />
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
                fontSize="68"
                letterSpacing="1"
              >
                CORTILE CELESTINI
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
              Calcia il leggendario <em>Super Santos</em>, sfida la pioggia col pallone di cuoio pesante e attento
              alla finestra del condominio e alle forbici della Signora Maria!
            </p>

            {/* Quick Mode & Camera Selector Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 max-w-xl">
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
            </div>

            {/* Primary Start CTA */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => {
                  soundEngine.playWhistle(false);
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
              <strong className="text-amber-300">L</strong> Cappello / Pallonetto ·{' '}
              <strong className="text-amber-300">C</strong> Cambia Visuale (FPS/TV) ·{' '}
              <strong className="text-amber-300">Esc</strong> Pausa
            </div>
            <div className="text-stone-400">
              Risoluzione GPU: {Math.round(renderScale * 100)}% · Pronto per Web & Android
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
              <span className="font-display text-lg font-bold tracking-wide text-sky-400">CELESTINI</span>
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

          {/* Shot Power Charge Bar (Above Player / Bottom-Center above dock) */}
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

          {/* Gag or Goal Dynamic Notification Toast */}
          {(telemetry.activeGag || telemetry.lastBanner) && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-10 max-w-md w-[92vw] px-4 py-3 bg-stone-950/95 border border-amber-500/70 rounded-xl shadow-xl text-center pointer-events-none">
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
              {/* Left Virtual Thumbstick */}
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

              {/* Right Tactile Action Pad */}
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

          {/* Unified Collapsible Bottom Control Dock (Zero Side-Panel Clutter) */}
          <div
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(940px,95vw)] transition-transform duration-200 pointer-events-auto"
            style={{
              transform: dockCollapsed ? 'translate(-50%, calc(100% - 34px))' : 'translate(-50%, 0)',
            }}
          >
            {/* Collapse / Expand Handle */}
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

            {/* Dock Body */}
            <div className="bg-stone-950/95 border border-stone-700/90 rounded-xl p-3 shadow-2xl">
              {/* Dock Tabs + Quick Actions */}
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
                    onClick={() => setResetMatchSeq((s) => s + 1)}
                    className="px-2.5 py-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Palla al Centro</span>
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
                      onChange={(e) => setWeather(e.target.value as WeatherId)}
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
                    <label className="block text-[11px] text-stone-400 mb-1 flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                      <span>Campo Nostalgia ({currentPitch.name})</span>
                    </label>
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
                      <span>Regolamento da Strada</span>
                    </label>
                    <select
                      value={streetRule}
                      onChange={(e) => setStreetRule(e.target.value as StreetRuleId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2.5 py-1.5 border border-stone-700"
                    >
                      {Object.values(STREET_RULES).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Tab 3: Courtyard Gags & Interactive Triggers */}
              {activeDockTab === 'gag' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-stone-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gagsEnabled}
                        onChange={(e) => setGagsEnabled(e.target.checked)}
                        className="rounded accent-amber-500"
                      />
                      <span>Gag Classiche Attive</span>
                    </label>
                    <span className="text-[11px] text-stone-400 hidden sm:inline">
                      (Scattano tirando verso balcone, finestra, tetto, Panda o tombino — oppure provale subito:)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setTriggerGagRequest({ gag: 'vecchia_buca', seq: Date.now() })}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-purple-950/90 hover:bg-purple-900 text-purple-200 border border-purple-700/70 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Vecchia Buca Palla
                    </button>
                    <button
                      onClick={() => setTriggerGagRequest({ gag: 'finestra_rotta', seq: Date.now() })}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-sky-950/90 hover:bg-sky-900 text-sky-200 border border-sky-700/70 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Rompi Finestra
                    </button>
                    <button
                      onClick={() => setTriggerGagRequest({ gag: 'palla_tetto', seq: Date.now() })}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-orange-950/90 hover:bg-orange-900 text-orange-200 border border-orange-700/70 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Palla sul Tetto
                    </button>
                    <button
                      onClick={() => setTriggerGagRequest({ gag: 'allarme_auto', seq: Date.now() })}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/70 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Allarme Panda
                    </button>
                    <button
                      onClick={() => setTriggerGagRequest({ gag: 'tombino_fogna', seq: Date.now() })}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-600 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Palla nel Tombino
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 4: LAN / Multiplayer & Hardware Render Scale */}
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
                      Apri Stanza LAN / Online {onlineRoomCode ? `[${onlineRoomCode}]` : ''}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-xs text-stone-300">Render Scale (PC Deboli):</span>
                    {[0.5, 0.75, 1.0].map((scale) => (
                      <button
                        key={scale}
                        onClick={() => setRenderScale(scale)}
                        className={`px-2 py-1 text-xs font-mono-num font-semibold rounded cursor-pointer ${
                          renderScale === scale
                            ? 'bg-emerald-500 text-stone-950'
                            : 'bg-stone-900 text-stone-400 border border-stone-800'
                        }`}
                      >
                        {Math.round(scale * 100)}%
                      </button>
                    ))}
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
              {/* Nickname */}
              <div>
                <label className="block text-stone-400 mb-1">Il tuo Soprannome in Cortile</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 font-semibold"
                />
              </div>

              {/* Active Room Banner */}
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

              {/* Active Rooms on Server / LAN */}
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

              {/* LAN IP Info */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-400">
                <div className="font-semibold text-stone-200 mb-1">
                  Connessione Diretta LAN / Smartphone Android sulla stessa Wi-Fi:
                </div>
                <div>
                  Stato WebSocket: <strong className="text-emerald-400">{wsConnected ? 'Connesso' : 'Offline'}</strong>
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

      {/* 6. CONTROLS & CONTROLLER PRIORITY MODAL */}
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
                  <div><strong className="text-stone-100">B</strong>: Cambia Pallone in tempo reale</div>
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
