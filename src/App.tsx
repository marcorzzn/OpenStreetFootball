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
  Dices,
  Gamepad2,
  Globe,
  Keyboard,
  Maximize2,
  Megaphone,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Users,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { soundEngine } from './audio/soundEngine';
import {
  HudTelemetry,
  RemoteSyncStateUpdate,
  StreetPitchCanvas,
} from './components/StreetPitchCanvas';
import { InputManager } from './game/inputManager';
import { generateMatchSeed } from './game/rng';
import { MatchStartPayload, ReliableGameEventPayload } from './net/protocol';
import {
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
  STREET_RULES,
  StreetRuleId,
  TEAM_SIZE_OPTIONS,
  TeamSize,
  TimeOfDayId,
  VOICE_SHOUTS,
  VoiceShoutId,
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
  const [weather, setWeather] = useState<WeatherId>('sole');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayId>('giorno');
  const [pitch, setPitch] = useState<PitchId>('cortile');
  const [teamSize, setTeamSize] = useState<TeamSize>(3);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normale');
  const [playerCategory, setPlayerCategory] = useState<PlayerCategoryId>('attacker');
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
  const [activeDockTab, setActiveDockTab] = useState<'ruolo' | 'ambiente' | 'gag' | 'rete'>('ruolo');
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);
  const [showNetworkModal, setShowNetworkModal] = useState<boolean>(false);
  const [showControlsModal, setShowControlsModal] = useState<boolean>(false);
  const [showReleaseModal, setShowReleaseModal] = useState<boolean>(false);
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);

  const [triggerGagRequest, setTriggerGagRequest] = useState<{ gag: GagId; seq: number } | null>(null);
  const [triggerShoutRequest, setTriggerShoutRequest] = useState<{ shout: VoiceShoutId; seq: number } | null>(null);
  const [resetMatchSeq, setResetMatchSeq] = useState<number>(0);
  const [matchSeed, setMatchSeed] = useState<number>(() => generateMatchSeed());

  // Multiplayer Online / LAN State
  const [playerName, setPlayerName] = useState<string>('Marco_10');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [isOnlineHost, setIsOnlineHost] = useState<boolean>(true);
  const [roomPlayerCount, setRoomPlayerCount] = useState<number>(1);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [availableRooms, setAvailableRooms] = useState<NetworkRoomSummary[]>([]);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [pingMs, setPingMs] = useState<number>(0);

  // Live HUD Telemetry
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
    rightHoldCharge: 0,
    dribbleExposure: 0,
    hasBall: false,
    markingCallActive: false,
    gkRushActive: false,
    setPieceState: null,
    activeShout: null,
    cameraMode: 'classic',
    connectedGamepads: [],
    activeGag: null,
    lastBanner: null,
    pointerLocked: false,
    fps: 60,
    autoScaleFpsAvg: 60,
    frameTimeMs: 3.8,
    drawCalls: 42,
    triangles: 4800,
    isSoftwareGl: false,
    physicsStepsLastFrame: 1,
    cameraFar: 140,
    activeGagStateLabel: 'nessuna gag',
    trickPopup: null,
    snapshotsPerSec: 0,
  });

  const inputManagerRef = useRef<InputManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const joystickTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  const sendHostReliableEvent = useCallback(
    (event: ReliableGameEventPayload) => {
      if (
        gameMode === 'online_lan' &&
        isOnlineHost &&
        onlineRoomCode &&
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
    },
    [gameMode, isOnlineHost, onlineRoomCode],
  );

  const handleRemoteSyncState = useCallback((sync: RemoteSyncStateUpdate) => {
    if (typeof sync.seed === 'number') setMatchSeed(sync.seed >>> 0);
    if (sync.weather) setWeather(sync.weather);
    if (sync.pitch) setPitch(sync.pitch);
    if (sync.ballProfile) setBallProfile(sync.ballProfile);
    if (sync.streetRule) setStreetRule(sync.streetRule);
    if (typeof sync.ruleTunnelEnabled === 'boolean') setRuleTunnelEnabled(sync.ruleTunnelEnabled);
    if (typeof sync.ruleCappelloEnabled === 'boolean') setRuleCappelloEnabled(sync.ruleCappelloEnabled);
    if (typeof sync.isPlaying === 'boolean') {
      setIsPlaying(sync.isPlaying);
      if (sync.isPlaying) setIsPaused(false);
    }
  }, []);

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
        const matchPayload: MatchStartPayload = {
          seed: nextSeed,
          weather,
          timeOfDay,
          pitch,
          teamSize,
          botDifficulty,
          playerCategory,
          ballProfile,
          streetRule,
          ruleTunnelEnabled,
          ruleCappelloEnabled,
        };
        wsRef.current.send(
          JSON.stringify({
            type: 'match_start',
            seed: nextSeed,
            match: matchPayload,
          }),
        );
      }
    }
  }, [
    gameMode,
    isOnlineHost,
    weather,
    timeOfDay,
    pitch,
    teamSize,
    botDifficulty,
    playerCategory,
    ballProfile,
    streetRule,
    ruleTunnelEnabled,
    ruleCappelloEnabled,
  ]);

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
        e.code === 'Enter' &&
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
      // Ignore on static hosts
    }
  }, []);

  useEffect(() => {
    refreshNetworkInfo();
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const pingInterval = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', clientTimestamp: performance.now() }));
        }
      }, 1500);

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'list_rooms' }));
        ws.send(JSON.stringify({ type: 'ping', clientTimestamp: performance.now() }));
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
          if (msg.type === 'pong' && typeof msg.clientTimestamp === 'number') {
            const rtt = Math.max(1, Math.round(performance.now() - msg.clientTimestamp));
            setPingMs((prev) => (prev === 0 ? rtt : Math.round(prev * 0.7 + rtt * 0.3)));
          } else if (msg.type === 'room_joined' || msg.type === 'room_updated') {
            const room = msg.room;
            setOnlineRoomCode(room.code);
            setRoomPlayerCount(Array.isArray(room.players) ? room.players.length : 1);
            const myId = msg.playerId;
            if (myId) {
              setIsOnlineHost(room.hostId === myId);
            }
            if (room.pitch) setPitch(room.pitch as PitchId);
            if (room.ballProfile) setBallProfile(room.ballProfile as BallProfileId);
            if (room.weather) setWeather(room.weather as WeatherId);
            if (room.rule) setStreetRule(room.rule as StreetRuleId);
            if (typeof room.ruleTunnelEnabled === 'boolean') setRuleTunnelEnabled(room.ruleTunnelEnabled);
            if (typeof room.ruleCappelloEnabled === 'boolean') setRuleCappelloEnabled(room.ruleCappelloEnabled);
            if (typeof room.seed === 'number') setMatchSeed(room.seed >>> 0);
            setGameMode('online_lan');
            setNetworkError(null);
          } else if (msg.type === 'match_start') {
            if (msg.match && typeof msg.match.seed === 'number') {
              const m = msg.match as MatchStartPayload;
              setMatchSeed(m.seed >>> 0);
              setWeather(m.weather);
              setPitch(m.pitch);
              setBallProfile(m.ballProfile);
              setStreetRule(m.streetRule);
              setRuleTunnelEnabled(m.ruleTunnelEnabled);
              setRuleCappelloEnabled(m.ruleCappelloEnabled);
              setIsPlaying(true);
              setIsPaused(false);
            } else if (typeof msg.seed === 'number') {
              setMatchSeed(msg.seed >>> 0);
            }
          } else if (msg.type === 'host_disconnected') {
            setOnlineRoomCode(null);
            setIsOnlineHost(true);
            setRoomPlayerCount(1);
            setGameMode('single');
            setNetworkError(
              msg.message || "L'host si è disconnesso: la stanza è stata chiusa automaticamente.",
            );
            setShowNetworkModal(true);
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
        window.clearInterval(pingInterval);
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
        ruleTunnelEnabled,
        ruleCappelloEnabled,
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
    sendHostReliableEvent({ kind: 'weather_change', weather: nextWeather });
  };

  const handlePitchChange = (nextPitch: PitchId) => {
    setPitch(nextPitch);
    sendHostReliableEvent({ kind: 'pitch_change', pitch: nextPitch });
  };

  const handleBallProfileChange = (nextProfile: BallProfileId) => {
    setBallProfile(nextProfile);
    sendHostReliableEvent({ kind: 'ball_profile_change', ballProfile: nextProfile });
  };

  const handleStreetRuleChange = (nextRule: StreetRuleId) => {
    setStreetRule(nextRule);
    sendHostReliableEvent({
      kind: 'rules_change',
      streetRule: nextRule,
      ruleTunnelEnabled,
      ruleCappelloEnabled,
    });
  };

  const handleTunnelRuleToggle = (enabled: boolean) => {
    setRuleTunnelEnabled(enabled);
    sendHostReliableEvent({
      kind: 'rules_change',
      streetRule,
      ruleTunnelEnabled: enabled,
      ruleCappelloEnabled,
    });
  };

  const handleCappelloRuleToggle = (enabled: boolean) => {
    setRuleCappelloEnabled(enabled);
    sendHostReliableEvent({
      kind: 'rules_change',
      streetRule,
      ruleTunnelEnabled,
      ruleCappelloEnabled: enabled,
    });
  };

  /**
   * "Tutto a Caso (Random)" — randomizes pitch, weather, time of day, ball, team size, role, and rules.
   */
  const handleRandomizeAll = () => {
    const pitches = Object.keys(PITCH_CONFIGS) as PitchId[];
    const weathers = Object.keys(WEATHER_CONFIGS) as WeatherId[];
    const balls = Object.keys(BALL_PROFILES) as BallProfileId[];
    const roles = Object.keys(PLAYER_CATEGORIES) as PlayerCategoryId[];
    const times: TimeOfDayId[] = ['giorno', 'tramonto', 'notte'];
    const rules = Object.keys(STREET_RULES) as StreetRuleId[];

    const rPitch = pitches[Math.floor(Math.random() * pitches.length)];
    const rWeather = weathers[Math.floor(Math.random() * weathers.length)];
    const rBall = balls[Math.floor(Math.random() * balls.length)];
    const rRole = roles[Math.floor(Math.random() * roles.length)];
    const rTime = times[Math.floor(Math.random() * times.length)];
    const rSize = TEAM_SIZE_OPTIONS[Math.floor(Math.random() * TEAM_SIZE_OPTIONS.length)];
    const rRule = rules[Math.floor(Math.random() * rules.length)];

    handlePitchChange(rPitch);
    handleWeatherChange(rWeather);
    handleBallProfileChange(rBall);
    setPlayerCategory(rRole);
    setTimeOfDay(rTime);
    setTeamSize(rSize);
    handleStreetRuleChange(rRule);
    soundEngine.playTrickCheer();
  };

  const currentBall = BALL_PROFILES[ballProfile];
  const currentWeather = WEATHER_CONFIGS[weather];
  const currentPitch = PITCH_CONFIGS[pitch];
  const currentRole = PLAYER_CATEGORIES[playerCategory];
  const effectiveDims = getEffectivePitchDimensions(pitch, teamSize);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 text-stone-100 select-none">
      {/* 1. Full-Viewport 3D WebGL Courtyard & Stadium Canvas */}
      <StreetPitchCanvas
        isPlaying={isPlaying}
        isPaused={isPaused}
        gameMode={gameMode}
        cameraMode={cameraMode}
        onCameraModeChange={setCameraMode}
        ballProfile={ballProfile}
        onBallProfileChange={setBallProfile}
        weather={weather}
        timeOfDay={timeOfDay}
        pitch={pitch}
        teamSize={teamSize}
        botDifficulty={botDifficulty}
        playerCategory={playerCategory}
        streetRule={streetRule}
        ruleTunnelEnabled={ruleTunnelEnabled}
        ruleCappelloEnabled={ruleCappelloEnabled}
        renderScale={renderScale}
        autoRenderScale={autoRenderScale}
        onRenderScaleChange={setRenderScale}
        showPerfMonitor={showPerfMonitor}
        gagsEnabled={gagsEnabled}
        triggerGagRequest={triggerGagRequest}
        triggerShoutRequest={triggerShoutRequest}
        resetMatchSeq={resetMatchSeq}
        matchSeed={matchSeed}
        inputManagerRef={inputManagerRef}
        wsRef={wsRef}
        isOnlineHost={isOnlineHost}
        onlineRoomCode={onlineRoomCode}
        onRemoteSyncState={handleRemoteSyncState}
        onTelemetryUpdate={setTelemetry}
      />

      {/* In-Game Performance Monitor Badge (F3) */}
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
          </div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400 pl-6">
            <span>
              Render Scale:{' '}
              <strong className="text-amber-300">{Math.round(renderScale * 100)}%</strong> (
              <strong className={autoRenderScale ? 'text-amber-400' : 'text-stone-200'}>
                {autoRenderScale ? 'Auto' : 'Manuale'}
              </strong>
              )
            </span>
            <span>·</span>
            <span>
              Media 2s: <strong className="text-emerald-300">{telemetry.autoScaleFpsAvg} FPS</strong>
            </span>
            <span>·</span>
            <button
              onClick={() => setAutoRenderScale((prev) => !prev)}
              className="px-1.5 py-0.2 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-600 rounded text-[9px] font-semibold cursor-pointer"
            >
              {autoRenderScale ? 'Passa a Manuale' : 'Attiva Auto'}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400 pl-6">
            <span>
              Campo: <strong className="text-stone-200">{currentPitch.name}</strong> (
              {Math.round(effectiveDims.halfX * 2)}m × {Math.round(effectiveDims.halfZ * 2)}m)
            </span>
            <span>·</span>
            <span>
              Formato: <strong className="text-amber-300">{teamSize}v{teamSize}</strong> (Bot{' '}
              {BOT_DIFFICULTIES[botDifficulty].name})
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-stone-400 pl-6">
            <span>
              Ruolo: <strong className="text-sky-300">{currentRole.name}</strong>
            </span>
            <span>·</span>
            <span>
              Meteo: <strong className="text-stone-200">{currentWeather.name}</strong> ({timeOfDay})
            </span>
          </div>
        </div>
      )}

      {/* 2. TITLE SCREEN OVERLAY (When not playing) */}
      {!isPlaying && (
        <div className="fixed inset-0 z-20 flex flex-col justify-between p-5 md:p-8 pointer-events-none bg-gradient-to-t from-stone-950/92 via-stone-950/45 to-stone-950/80 overflow-y-auto">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-4 pointer-events-auto mt-7 sm:mt-0">
            <div className="flex items-center gap-3 sm:pl-72">
              <span className="font-display text-2xl font-extrabold tracking-tight text-amber-400">
                OPENSTREETFOOTBALL
              </span>
              <span className="text-xs text-stone-300 hidden xl:inline">
                · Fumetto Realistico · 1v1 fino a 11v11 · Comandi Mouse & Tastiera
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRandomizeAll}
                className="px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow"
              >
                <Dices className="w-4 h-4" />
                <span>Tutto a Caso!</span>
              </button>

              <button
                onClick={() => setShowReleaseModal(true)}
                className="px-3 py-2 text-xs font-semibold bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 border border-emerald-700/80 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Open Source</span>
              </button>

              <button
                onClick={() => {
                  refreshNetworkInfo();
                  setShowNetworkModal(true);
                }}
                className="px-3 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-100 border border-stone-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span>Lobby LAN {onlineRoomCode ? `(${onlineRoomCode})` : ''}</span>
              </button>

              <button
                onClick={() => setShowControlsModal(true)}
                className="px-3 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-stone-100 border border-stone-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 text-sky-400" />
                <span>Guida Comandi Mouse</span>
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

          {/* Center-Left Title Lockup + Complete Match Setup Grid */}
          <div className="my-auto max-w-4xl pointer-events-auto py-3">
            <div className="text-xs font-semibold tracking-wider text-amber-300 mb-1.5 uppercase">
              STILE FUMETTO REALISTICO · DA 1v1 FINO A 11 CONTRO 11 · FALLI, BARRIERA & RIGORI
            </div>

            <svg
              viewBox="0 0 720 132"
              className="w-full max-w-lg h-auto mb-3 drop-shadow-[0_6px_24px_rgba(0,0,0,0.85)]"
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
              <circle cx="58" cy="66" r="44" fill="url(#osfGrad)" stroke="#18181b" strokeWidth="5" />
              <path
                d="M 20 44 Q 58 66 96 44 M 18 86 Q 58 64 98 86 M 58 22 L 58 110"
                stroke="#18181b"
                strokeWidth="4.5"
                fill="none"
              />
              <text
                x="122"
                y="68"
                fill="#fafaf9"
                fontFamily="'Barlow Condensed', sans-serif"
                fontWeight="800"
                fontStyle="italic"
                fontSize="62"
                letterSpacing="1"
              >
                OPENSTREETFOOTBALL
              </text>
              <text
                x="124"
                y="108"
                fill="#fbbf24"
                fontFamily="'Barlow Condensed', sans-serif"
                fontWeight="700"
                fontSize="27"
                letterSpacing="2.5"
              >
                CORTILE, GABBIA, SPIAGGIA & STADIO 11v11
              </text>
            </svg>

            {/* Primary Match Configurator Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
              {/* 1. Ruolo Calciatore */}
              <div className="bg-stone-900/92 border border-stone-700/80 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center justify-between">
                  <span>1. Ruolo Calciatore</span>
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <select
                  value={playerCategory}
                  onChange={(e) => setPlayerCategory(e.target.value as PlayerCategoryId)}
                  className="w-full bg-stone-800 text-stone-100 text-xs font-bold rounded-lg px-2 py-1.5 border border-stone-700 mb-1"
                >
                  {Object.values(PLAYER_CATEGORIES).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-stone-300 leading-tight">{currentRole.description}</div>
              </div>

              {/* 2. Formato Squadre (1v1 .. 11v11) & Difficoltà Bot */}
              <div className="bg-stone-900/92 border border-stone-700/80 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-sky-300 mb-1 flex items-center justify-between">
                  <span>2. Squadre & Difficoltà Bot</span>
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div className="flex gap-1 mb-1.5">
                  {TEAM_SIZE_OPTIONS.map((sz: TeamSize) => (
                    <button
                      key={sz}
                      onClick={() => setTeamSize(sz)}
                      className={`flex-1 py-1 text-[11px] font-extrabold rounded cursor-pointer ${
                        teamSize === sz
                          ? 'bg-sky-400 text-stone-950'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {sz}v{sz}
                    </button>
                  ))}
                </div>
                <select
                  value={botDifficulty}
                  onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                  className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded-lg px-2 py-1 border border-stone-700"
                >
                  {Object.values(BOT_DIFFICULTIES).map((d) => (
                    <option key={d.id} value={d.id}>
                      Bot: {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Campo da Gioco (con dimensioni reali) */}
              <div className="bg-stone-900/92 border border-stone-700/80 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-emerald-300 mb-1 flex items-center justify-between">
                  <span>3. Campo ({Math.round(effectiveDims.halfX * 2)}×{Math.round(effectiveDims.halfZ * 2)}m)</span>
                  <Compass className="w-3.5 h-3.5" />
                </div>
                <select
                  value={pitch}
                  onChange={(e) => handlePitchChange(e.target.value as PitchId)}
                  className="w-full bg-stone-800 text-stone-100 text-xs font-bold rounded-lg px-2 py-1.5 border border-stone-700 mb-1"
                >
                  {Object.values(PITCH_CONFIGS).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.dimensionsLabel})
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-stone-300 leading-tight truncate">{currentPitch.subtitle}</div>
              </div>

              {/* 4. Meteo, Giorno/Notte & Pallone */}
              <div className="bg-stone-900/92 border border-stone-700/80 rounded-xl p-2.5">
                <div className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center justify-between">
                  <span>4. Meteo, Orario & Palla</span>
                  <Sun className="w-3.5 h-3.5" />
                </div>
                <div className="grid grid-cols-2 gap-1 mb-1">
                  <select
                    value={weather}
                    onChange={(e) => handleWeatherChange(e.target.value as WeatherId)}
                    className="bg-stone-800 text-stone-100 text-[11px] font-semibold rounded px-1.5 py-1 border border-stone-700"
                  >
                    {Object.values(WEATHER_CONFIGS).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value as TimeOfDayId)}
                    className="bg-stone-800 text-stone-100 text-[11px] font-semibold rounded px-1.5 py-1 border border-stone-700"
                  >
                    <option value="giorno">Giorno</option>
                    <option value="tramonto">Tramonto</option>
                    <option value="notte">Notte</option>
                  </select>
                </div>
                <select
                  value={ballProfile}
                  onChange={(e) => handleBallProfileChange(e.target.value as BallProfileId)}
                  className="w-full bg-stone-800 text-stone-100 text-[11px] font-semibold rounded px-2 py-1 border border-stone-700"
                >
                  {Object.values(BALL_PROFILES).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mouse & Keyboard Controls Quick Reference Card */}
            <div className="bg-stone-900/90 border border-stone-700/80 rounded-xl p-3 mb-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <div className="font-bold text-amber-400 mb-0.5">
                    QUANDO HAI LA PALLA (IN POSSESSO):
                  </div>
                  <div className="text-stone-200 text-[11px] leading-relaxed">
                    • <strong>Click Sinistro Mouse</strong>: Passaggio rapido ·{' '}
                    <strong>Tieni Premuto SX</strong>: Carica potenza tiro/passaggio e{' '}
                    <span className="text-amber-300 font-semibold">mira direzione e altezza col Mouse mentre cammini</span>!<br />
                    • <strong>Click Destro Mouse</strong>: Finta secca ·{' '}
                    <strong>Tieni Premuto DX</strong>: Dribbling stretto (più tieni premuto, più dribbli ma rischi di farti rubare palla!).
                  </div>
                </div>
                <div>
                  <div className="font-bold text-sky-400 mb-0.5">
                    QUANDO NON HAI LA PALLA (DIFESA & PORTIERE):
                  </div>
                  <div className="text-stone-200 text-[11px] leading-relaxed">
                    • <strong>Click Destro Mouse</strong>: Scivolata ·{' '}
                    <strong>Tieni Premuto DX</strong>: Scivolata violenta (prendi il tempo sulla palla: se colpisci l’uomo o entri da dietro è <strong>Fallo / Punizione con Barriera / Rigore</strong>!).<br />
                    • <strong>Click Sinistro Mouse</strong>: Richiama marcatura ·{' '}
                    <strong>Tieni Premuto SX</strong>: Uscita automatica del Portiere! (Se giochi Portiere e pari con le mani fuori area è <strong>Rigore</strong>!).
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Start CTA */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  soundEngine.playWhistle(false);
                  startNewMatchWithSeed();
                  setIsPlaying(true);
                  setIsPaused(false);
                }}
                className="px-7 py-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-display text-2xl font-extrabold tracking-wide rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6 fill-stone-950" />
                <span>SCENDI IN CAMPO ({teamSize}v{teamSize})</span>
              </button>

              <button
                onClick={() => setCameraMode(cameraMode === 'classic' ? 'fps' : 'classic')}
                className="px-4 py-3 bg-stone-900 hover:bg-stone-800 text-stone-100 border border-stone-700 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Visuale: <strong className="text-amber-300">{cameraMode === 'fps' ? 'Prima Persona (FPS)' : 'Classica TV'}</strong> (Tasto C)
              </button>
            </div>
          </div>

          {/* Flat Control-Hint Footer Line */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-stone-300 border-t border-stone-800/80 pt-2.5 pointer-events-auto">
            <div>
              <strong className="text-amber-300">WASD</strong> Cammina ·{' '}
              <strong className="text-amber-300">Shift</strong> Corri ·{' '}
              <strong className="text-amber-300">Spazio</strong> Salta / Colpo di Testa ·{' '}
              <strong className="text-amber-300">Mouse SX / DX</strong> Tira, Passa, Finta, Dribbling, Scivolata, Marcatura ·{' '}
              <strong className="text-amber-300">Tasti 1-4</strong> Urla in Campo ·{' '}
              <strong className="text-amber-300">C</strong> Visuale
            </div>
            <div className="text-stone-400">
              OpenStreetFootball · Licenza MIT
            </div>
          </div>
        </div>
      )}

      {/* 3. ACTIVE GAMEPLAY HUD */}
      {isPlaying && (
        <>
          {/* Top-Center Comic-Book Sticker Timer & Scoreboard */}
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center px-5 py-1.5 bg-[#fffbeb] border-3 border-black shadow-[4px_4px_0px_#09090b] text-stone-950 pointer-events-auto">
            <div className="font-mono-num text-2xl sm:text-3xl font-black tracking-tight leading-none text-stone-950">
              {formatClock(telemetry.timeRemaining)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs sm:text-sm font-extrabold tracking-wide">
              <span className="px-1.5 py-0.5 bg-[#38bdf8] border border-black text-stone-950">
                AZZURRI {telemetry.scoreBlue}
              </span>
              <span className="text-stone-950 font-black">·</span>
              <span className="px-1.5 py-0.5 bg-[#facc15] border border-black text-stone-950">
                {teamSize}v{teamSize} · PALI {telemetry.paliBlue}/{telemetry.paliRed}
              </span>
              <span className="text-stone-950 font-black">·</span>
              <span className="px-1.5 py-0.5 bg-[#fb7185] border border-black text-stone-950">
                {telemetry.scoreRed} RIVALI
              </span>
            </div>
          </div>

          {/* Top-Right Action Strip + Randomize Button */}
          <div className="fixed top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-[#fde047] border-2 border-black shadow-[3px_3px_0px_#09090b] text-stone-950 pointer-events-auto">
            <button
              onClick={handleRandomizeAll}
              title="Tutto a Caso (Campo, Meteo, Pallone, Squadre)"
              className="px-2 py-0.5 text-xs font-black uppercase bg-[#fffbeb] hover:bg-white text-stone-950 border-2 border-black flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Dices className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CASO</span>
            </button>

            <button
              onClick={() => setCameraMode(cameraMode === 'classic' ? 'fps' : 'classic')}
              title="Cambia Visuale (Tasto C)"
              className="px-2 py-0.5 text-xs font-black uppercase bg-[#fffbeb] hover:bg-white text-stone-950 border-2 border-black flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{cameraMode === 'fps' ? 'FPS POV' : 'TV CAM'}</span>
            </button>

            <button
              onClick={() => setShowTouchControls((prev) => !prev)}
              title="Mostra/Nascondi Comandi Touch"
              className={`p-1 border-2 border-black cursor-pointer ${
                showTouchControls ? 'bg-[#38bdf8] text-stone-950' : 'bg-[#fffbeb] text-stone-950 hover:bg-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={toggleMute}
              className="p-1 bg-[#fffbeb] hover:bg-white text-stone-950 border-2 border-black cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-600" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => setIsPaused((prev) => !prev)}
              className="p-1 bg-[#fffbeb] hover:bg-white text-stone-950 border-2 border-black cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Left-Side Voice Shouts ("Esclamare / Urlare in Campo" — Tasti 1, 2, 3, 4) */}
          <div className="fixed left-3 top-1/2 -translate-y-1/2 z-10 hidden md:flex flex-col gap-1.5 pointer-events-auto">
            <div className="px-2 py-0.5 bg-[#facc15] border-2 border-black text-stone-950 text-[10px] font-black uppercase flex items-center gap-1 shadow-[2px_2px_0px_#09090b]">
              <Megaphone className="w-3 h-3" />
              <span>Urla (1-4)</span>
            </div>
            {Object.values(VOICE_SHOUTS).map((sh) => (
              <button
                key={sh.id}
                onClick={() => setTriggerShoutRequest({ shout: sh.id, seq: Date.now() })}
                className="px-2.5 py-1 bg-[#fffbeb] hover:bg-[#fde047] text-stone-950 border-2 border-black shadow-[3px_3px_0px_#09090b] text-[11px] font-black text-left cursor-pointer transition-transform active:scale-95"
              >
                [{sh.key}] {sh.label}
              </button>
            ))}
          </div>

          {/* Bottom-Right Live Role, Ball & Context-Sensitive Mouse Guide Sticker */}
          <div className="fixed bottom-3 right-3 z-10 hidden xl:flex flex-col items-end px-3.5 py-2 bg-[#fffbeb] border-2 border-black shadow-[3px_3px_0px_#09090b] text-stone-950 font-mono-num text-[11px] font-black uppercase pointer-events-none max-w-xs">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.2 bg-[#38bdf8] border border-black text-stone-950">
                {currentRole.name}
              </span>
              <span>· {currentBall.name}</span>
              <span className="px-1.5 py-0.2 bg-[#facc15] border border-black text-stone-950">
                {telemetry.ballSpeedKmh} KM/H
              </span>
            </div>
            <div className="text-[10px] font-extrabold text-stone-800 mt-1 text-right">
              {telemetry.hasBall
                ? 'CON PALLA: [SX] Passa / Tieni SX Carica+Mira · [DX] Finta / Tieni DX Dribbling'
                : 'SENZA PALLA: [DX] Scivolata (Tieni DX Violenta) · [SX] Marcatura (Tieni SX Uscita Portiere)'}
            </div>
            <div className="text-[10px] font-bold text-stone-600">
              [SPAZIO] Salta · [SHIFT] Corri · [K] Cambia Uomo
            </div>
          </div>

          {/* Comic Speech Bubble when a player shouts ("PASSALA!", "TIRO IO!", "UOMO!", "FALLO!") */}
          {telemetry.activeShout && (
            <div className="fixed top-20 right-8 z-20 px-4 py-2 bg-white text-stone-950 font-display text-xl font-black tracking-wide border-3 border-black rounded-2xl shadow-[4px_4px_0px_#09090b] pointer-events-none">
              💬 &ldquo;{telemetry.activeShout.text}&rdquo;
            </div>
          )}

          {/* Set-Piece Active Badge (Punizione con Barriera / Calcio di Rigore) */}
          {telemetry.setPieceState && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 px-5 py-1.5 bg-rose-500 text-white font-display text-2xl font-black tracking-wider border-3 border-black shadow-[4px_4px_0px_#09090b] pointer-events-none">
              ⚽ {telemetry.setPieceState} — MIRA COL MOUSE E CALCIA CON CLICK SINISTRO!
            </div>
          )}

          {/* Shot Power Charge Bar (LMB held) */}
          {telemetry.shootCharge > 0.02 && (
            <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-10 w-56 bg-[#fffbeb] border-3 border-black shadow-[4px_4px_0px_#09090b] p-1.5 pointer-events-none">
              <div className="text-[11px] font-black text-stone-950 text-center mb-1 uppercase">
                {telemetry.hasBall
                  ? `POTENZA TIRO / PASSAGGIO (${Math.round(telemetry.shootCharge * 100)}%)`
                  : 'USCITA PORTIERE ATTIVA!'}
              </div>
              <div className="w-full h-3 bg-white border-2 border-black overflow-hidden">
                <div
                  className="h-full bg-[#facc15]"
                  style={{ width: `${Math.round(telemetry.shootCharge * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Dribble Exposure / Violent Slide Charge Bar (RMB held) */}
          {(telemetry.dribbleExposure > 0.05 || telemetry.rightHoldCharge > 0.08) && (
            <div className="fixed bottom-40 left-1/2 -translate-x-1/2 z-10 w-56 bg-[#fffbeb] border-3 border-black shadow-[4px_4px_0px_#09090b] p-1.5 pointer-events-none">
              <div className="text-[11px] font-black text-stone-950 text-center mb-1 uppercase">
                {telemetry.hasBall
                  ? `DRIBBLING STRETTO · RISCHIO FURTO (${Math.round(telemetry.dribbleExposure * 100)}%)`
                  : `CARICA SCIVOLATA VIOLENTA (${Math.round(telemetry.rightHoldCharge * 100)}%)`}
              </div>
              <div className="w-full h-3 bg-white border-2 border-black overflow-hidden">
                <div
                  className="h-full bg-rose-500"
                  style={{
                    width: `${Math.round(
                      (telemetry.hasBall ? telemetry.dribbleExposure : telemetry.rightHoldCharge) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Short Street Trick Popup ("TUNNEL +1" / "CAPPELLO +1") */}
          {telemetry.trickPopup && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 px-5 py-1.5 bg-[#facc15] text-stone-950 font-display text-2xl font-black tracking-wider border-3 border-black shadow-[4px_4px_0px_#09090b] pointer-events-none">
              {telemetry.trickPopup.label} ({telemetry.trickPopup.team === 'blue' ? 'AZZURRI' : 'RIVALI'})
            </div>
          )}

          {/* Gag, Goal, or Referee Foul Dynamic Notification Toast */}
          {(telemetry.activeGag || telemetry.lastBanner) && (
            <div className="fixed top-28 left-1/2 -translate-x-1/2 z-10 max-w-md w-[92vw] px-4 py-3 bg-[#fffbeb] border-3 border-black shadow-[5px_5px_0px_#09090b] text-center pointer-events-none">
              <div className="font-display text-2xl font-black tracking-wide text-stone-950 uppercase">
                {telemetry.activeGag ? telemetry.activeGag.title : telemetry.lastBanner?.title}
              </div>
              <div className="text-xs font-bold text-stone-800 mt-0.5">
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
                    if (inputManagerRef.current) inputManagerRef.current.touchJumpJustPressed = true;
                  }}
                  className="w-16 h-16 rounded-2xl bg-amber-500 active:bg-amber-400 text-stone-950 font-display font-bold text-sm border border-amber-300 shadow-lg"
                >
                  SALTA
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
                  CORRI
                </button>
              </div>
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock */}
          <div
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(960px,95vw)] transition-transform duration-200 pointer-events-auto"
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
                    <span>Mostra Regia Partita (H)</span>
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
                    onClick={() => setActiveDockTab('ruolo')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'ruolo'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    1. Ruolo, Squadre & Pallone
                  </button>
                  <button
                    onClick={() => setActiveDockTab('ambiente')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'ambiente'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    2. Campi, Meteo & Giorno/Notte
                  </button>
                  <button
                    onClick={() => setActiveDockTab('gag')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      activeDockTab === 'gag'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-300 hover:text-white'
                    }`}
                  >
                    3. Gag & Urla Voce
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
                    onClick={handleRandomizeAll}
                    className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Tutto a Caso</span>
                  </button>
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
                    onClick={() => setShowControlsModal(true)}
                    className="px-2.5 py-1 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Comandi Mouse</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: Player Category, Team Size (1v1..11v11), Bot Difficulty & Ball Profile */}
              {activeDockTab === 'ruolo' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-amber-300 font-semibold mb-1">
                      Ruolo Calciatore ({currentRole.name})
                    </label>
                    <select
                      value={playerCategory}
                      onChange={(e) => setPlayerCategory(e.target.value as PlayerCategoryId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700"
                    >
                      {Object.values(PLAYER_CATEGORIES).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-sky-300 font-semibold mb-1">
                      Formato Squadre (da 1v1 a 11v11)
                    </label>
                    <div className="flex gap-1">
                      {TEAM_SIZE_OPTIONS.map((sz: TeamSize) => (
                        <button
                          key={sz}
                          onClick={() => setTeamSize(sz)}
                          className={`flex-1 py-1 text-[11px] font-bold rounded cursor-pointer ${
                            teamSize === sz
                              ? 'bg-sky-400 text-stone-950'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {sz}v{sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-emerald-300 font-semibold mb-1">
                      Difficoltà Bot IA
                    </label>
                    <select
                      value={botDifficulty}
                      onChange={(e) => setBotDifficulty(e.target.value as BotDifficulty)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700"
                    >
                      {Object.values(BOT_DIFFICULTIES).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-stone-300 font-semibold mb-1">
                      Pallone ({currentBall.name})
                    </label>
                    <select
                      value={ballProfile}
                      onChange={(e) => handleBallProfileChange(e.target.value as BallProfileId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700"
                    >
                      {Object.values(BALL_PROFILES).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Tab 2: Pitches, Weather, Time of Day & Street Rules */}
              {activeDockTab === 'ambiente' && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] text-amber-300 font-semibold flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5" />
                        <span>Campo ({Math.round(effectiveDims.halfX * 2)}×{Math.round(effectiveDims.halfZ * 2)}m)</span>
                      </label>
                      {pitch === 'spiaggia' && (
                        <button
                          onClick={() => {
                            const next = !beachWavesEnabled;
                            setBeachWavesEnabled(next);
                            soundEngine.wavesEnabled = next;
                            soundEngine.setBeachWavesActive(isPlaying && !isPaused && next);
                          }}
                          className="px-1.5 py-0.2 text-[9px] font-semibold rounded border border-sky-500/40 bg-sky-500/20 text-sky-300 cursor-pointer"
                        >
                          Onde: {beachWavesEnabled ? 'Sì' : 'No'}
                        </button>
                      )}
                    </div>
                    <select
                      value={pitch}
                      onChange={(e) => handlePitchChange(e.target.value as PitchId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700"
                    >
                      {Object.values(PITCH_CONFIGS).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.dimensionsLabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-sky-300 font-semibold mb-1 flex items-center gap-1">
                      <CloudRain className="w-3.5 h-3.5" />
                      <span>Meteo ({currentWeather.name})</span>
                    </label>
                    <select
                      value={weather}
                      onChange={(e) => handleWeatherChange(e.target.value as WeatherId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700"
                    >
                      {Object.values(WEATHER_CONFIGS).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-amber-300 font-semibold mb-1 flex items-center gap-1">
                      <Sun className="w-3.5 h-3.5" />
                      <span>Giorno / Tramonto / Notte</span>
                    </label>
                    <div className="flex gap-1">
                      {(['giorno', 'tramonto', 'notte'] as TimeOfDayId[]).map((tod) => (
                        <button
                          key={tod}
                          onClick={() => setTimeOfDay(tod)}
                          className={`flex-1 py-1 text-[11px] font-bold rounded capitalize cursor-pointer ${
                            timeOfDay === tod
                              ? 'bg-amber-500 text-stone-950'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {tod}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-stone-900 p-2 rounded-lg border border-stone-800">
                    <label className="block text-[11px] text-emerald-300 font-semibold mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Regolamento & Tricks</span>
                    </label>
                    <select
                      value={streetRule}
                      onChange={(e) => handleStreetRuleChange(e.target.value as StreetRuleId)}
                      className="w-full bg-stone-800 text-stone-100 text-xs font-semibold rounded px-2 py-1 border border-stone-700 mb-1"
                    >
                      {Object.values(STREET_RULES).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-stone-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleTunnelEnabled}
                          onChange={(e) => handleTunnelRuleToggle(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <span>Tunnel (+1)</span>
                      </label>
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-stone-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ruleCappelloEnabled}
                          onChange={(e) => handleCappelloRuleToggle(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <span>Cappello (+1)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Gags & Voice Shouts */}
              {activeDockTab === 'gag' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-amber-300 mr-1">Urla in Campo:</span>
                    {Object.values(VOICE_SHOUTS).map((sh) => (
                      <button
                        key={sh.id}
                        onClick={() => setTriggerShoutRequest({ shout: sh.id, seq: Date.now() })}
                        className="px-2.5 py-1 text-xs font-bold bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-700/70 rounded-lg cursor-pointer"
                      >
                        [{sh.key}] {sh.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-stone-300">Gag:</span>
                    {Object.values(GAG_CONFIGS)
                      .filter((g) => g.allowedPitches.includes(pitch))
                      .map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setTriggerGagRequest({ gag: g.id, seq: Date.now() })}
                          className="px-2.5 py-1 text-xs font-semibold bg-amber-950/90 hover:bg-amber-900 text-amber-200 border border-amber-700/70 rounded-lg cursor-pointer whitespace-nowrap"
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
                        {m === 'single' ? '1P vs Bot IA' : m === 'local_2p' ? '2P Locale' : 'Online / LAN'}
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
              {currentPitch.name} ({teamSize}v{teamSize}) · {currentRole.name} · {currentBall.name}
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
                  MULTIPLAYER ONLINE, LAN & BOT FILL
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
                <label className="block text-stone-400 mb-1">Il tuo Soprannome in Campo</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 font-semibold"
                />
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl text-stone-300">
                Formato scelto: <strong className="text-amber-300">{teamSize} contro {teamSize}</strong>. Se i giocatori
                umani connessi non riempiono tutti i posti, gli slot rimanenti vengono completati in automatico dai{' '}
                <strong className="text-sky-300">Bot IA ({BOT_DIFFICULTIES[botDifficulty].name})</strong>!
              </div>

              {onlineRoomCode ? (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-600/60 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="text-emerald-300 font-bold text-sm">
                      Stanza Attiva: <span className="font-mono-num text-lg">{onlineRoomCode}</span>{' '}
                      ({isOnlineHost ? 'Sei l’Host Autoritativo' : 'Connesso come Sfidante'})
                    </div>
                    <span className="text-[11px] font-mono-num text-sky-300">
                      Umani: {roomPlayerCount} · Ping: {pingMs}ms
                    </span>
                  </div>
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

              {lanIps.length > 0 && (
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-400">
                  Indirizzo LAN Wi-Fi: <strong className="font-mono-num text-amber-300">http://{lanIps[0]}:3000</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. OPEN-SOURCE RELEASE MODAL */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-emerald-400">
                  OPENSTREETFOOTBALL · LICENZA MIT & COMMUNITY
                </h2>
              </div>
              <button
                onClick={() => setShowReleaseModal(false)}
                className="text-xs text-stone-400 hover:text-stone-100 px-2.5 py-1 rounded bg-stone-800 cursor-pointer"
              >
                Chiudi
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-amber-400 mb-1">
                  Build Relativa (`base: './'`), `LICENSE` MIT & `README.md`
                </div>
                <p className="text-stone-300 leading-relaxed">
                  Pronto per GitHub Pages, Itch.io e Android WebView, con architettura 100% procedurale e multiplayer
                  LAN host-authoritative.
                </p>
              </div>

              <div className="p-3.5 bg-stone-950 border border-stone-800 rounded-xl space-y-2.5">
                <div className="font-bold text-emerald-400">Post Pronti per la Community</div>
                <div className="flex items-center justify-between gap-3 bg-stone-900 p-2.5 rounded-lg border border-stone-800">
                  <div className="text-stone-300">
                    <strong className="text-stone-100">Post Presentazione IT</strong>
                  </div>
                  <button
                    onClick={() =>
                      copyCommunityPitch(
                        'it',
                        `Ciao a tutti! Sto sviluppando "OpenStreetFootball", un gioco di calcio 3D open-source (MIT) in stile fumetto realistico, giocabile da 1v1 fino a 11 contro 11 con visuale TV o Prima Persona!`,
                      )
                    }
                    className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-100 rounded-lg font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedPitchId === 'it' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPitchId === 'it' ? 'Copiato!' : 'Copia Post IT'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MOUSE, KEYBOARD & ROLES COMPLETE GUIDE MODAL */}
      {showControlsModal && (
        <div className="fixed inset-0 z-30 bg-stone-950/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl font-extrabold text-amber-400">
                COMANDI MOUSE, TASTIERA, FALLI & CATEGORIE RUOLO
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
                  1. Movimento, Corsa, Salto & Urla
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-stone-300">
                  <div><strong className="text-stone-100">WASD</strong>: Cammina / Muoviti</div>
                  <div><strong className="text-stone-100">Shift</strong>: Corri / Scatta</div>
                  <div><strong className="text-stone-100">Spazio</strong>: Salta / Colpo di Testa</div>
                  <div><strong className="text-stone-100">Tasti 1, 2, 3, 4</strong>: Esclama / Urla in campo</div>
                </div>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-emerald-400 mb-1.5">
                  2. Quando Mantieni la Palla (In Possesso)
                </div>
                <ul className="space-y-1 text-stone-300 list-disc pl-4">
                  <li>
                    <strong className="text-stone-100">Click Sinistro del Mouse (1 clic)</strong>: Passa o calcia rasoterra.
                  </li>
                  <li>
                    <strong className="text-stone-100">Tieni Premuto il Tasto Sinistro del Mouse</strong>: Carica la potenza del tiro o passaggio; quando rilasci tiri più forte e <strong>direzione, angolazione e altezza variano in base a dove miri col Mouse mentre cammini</strong>!
                  </li>
                  <li>
                    <strong className="text-stone-100">Click Destro del Mouse (1 clic)</strong>: Fai una finta rapida di corpo.
                  </li>
                  <li>
                    <strong className="text-stone-100">Tieni Premuto il Tasto Destro del Mouse</strong>: Fai dribbling stretto continuo; più lo tieni premuto più dribbli, ma aumenta il rischio di farti recuperare palla dal difensore!
                  </li>
                </ul>
              </div>

              <div className="p-3 bg-stone-950 border border-stone-800 rounded-xl">
                <div className="font-bold text-sky-400 mb-1.5">
                  3. Quando NON Mantieni la Palla (Difesa & Portiere)
                </div>
                <ul className="space-y-1 text-stone-300 list-disc pl-4">
                  <li>
                    <strong className="text-stone-100">Click Destro del Mouse</strong>: Scivolata normale ·{' '}
                    <strong className="text-stone-100">Tieni Premuto il Tasto Destro</strong>: Scivolata più violenta e lunga!
                  </li>
                  <li>
                    <strong className="text-amber-300">Tempismo Scivolata & Falli</strong>: La scivolata riesce solo se prendi il tempo e la mira per colpire il pallone e non il giocatore. Se colpisci l’avversario senza prendere la palla o entri da dietro, l’arbitro fischia <strong>Punizione con Barriera</strong> (o <strong>Calcio di Rigore</strong> in area!).
                  </li>
                  <li>
                    <strong className="text-stone-100">Click Sinistro del Mouse (1 clic)</strong>: Richiama la marcatura di un compagno sul portatore di palla.
                  </li>
                  <li>
                    <strong className="text-stone-100">Tieni Premuto il Tasto Sinistro del Mouse</strong>: Fai uscire il Portiere in automatico in direzione del possessore di palla!
                  </li>
                  <li>
                    <strong className="text-rose-400">Regola Portiere Fuori Area</strong>: Se giochi in porta (ruolo Portiere) puoi parare con i tasti del mouse, ma se tocchi la palla con le mani fuori dall’area di rigore senza accorgertene è <strong>Rigore per l’avversario</strong>!
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
