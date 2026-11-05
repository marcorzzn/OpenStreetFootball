import express from 'express';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomPlayer {
  id: string;
  name: string;
  team: 'blue' | 'red';
  isHost: boolean;
  ws: WebSocket;
  joinedAt: number;
}

interface GameRoom {
  code: string;
  name: string;
  hostId: string;
  pitch: string;
  ballProfile: string;
  weather: string;
  rule: string;
  seed: number;
  players: Map<string, RoomPlayer>;
  createdAt: number;
}

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function getLanAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function broadcastToRoom(room: GameRoom, payload: unknown, excludeId?: string) {
  const message = JSON.stringify(payload);
  for (const [id, player] of room.players.entries()) {
    if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  }
}

function serializeRoom(room: GameRoom) {
  return {
    code: room.code,
    name: room.name,
    hostId: room.hostId,
    pitch: room.pitch,
    ballProfile: room.ballProfile,
    weather: room.weather,
    rule: room.rule,
    seed: room.seed,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      isHost: p.isHost,
    })),
  };
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // API endpoint for LAN / Network info and active public rooms
  app.get('/api/network-info', (_req, res) => {
    const lanIps = getLanAddresses();
    const publicRooms = Array.from(rooms.values()).map((r) => ({
      code: r.code,
      name: r.name,
      playerCount: r.players.size,
      pitch: r.pitch,
      ballProfile: r.ballProfile,
      weather: r.weather,
    }));
    res.json({
      lanIps,
      port: PORT,
      appUrl: process.env.APP_URL || null,
      rooms: publicRooms,
    });
  });

  const MAX_MESSAGE_BYTES = 16384;
  const MAX_MESSAGES_PER_SEC = 60;
  const ALLOWED_MESSAGE_TYPES = new Set([
    'ping',
    'list_rooms',
    'create_room',
    'join_room',
    'match_start',
    'world_state',
    'client_input',
    'room_config',
    'game_event',
  ]);

  // WebSocket Server for Online & LAN Real-Time Multiplayer
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  wss.on('connection', (ws) => {
    let currentPlayerId = '';
    let currentRoomCode = '';
    let rateWindowStartMs = Date.now();
    let msgCountInWindow = 0;

    ws.on('message', (raw) => {
      try {
        // 1. Scarta messaggi troppo grandi
        const byteLength = Buffer.isBuffer(raw) ? raw.byteLength : Buffer.byteLength(String(raw));
        if (byteLength > MAX_MESSAGE_BYTES) {
          return;
        }

        // 2. Limita la frequenza dei messaggi per client (max 60 al secondo)
        const nowMs = Date.now();
        if (nowMs - rateWindowStartMs >= 1000) {
          rateWindowStartMs = nowMs;
          msgCountInWindow = 0;
        }
        msgCountInWindow += 1;
        if (msgCountInWindow > MAX_MESSAGES_PER_SEC) {
          return;
        }

        const msg = JSON.parse(raw.toString());
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
          return;
        }
        if (!ALLOWED_MESSAGE_TYPES.has(msg.type)) {
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: typeof msg.ts === 'number' ? msg.ts : nowMs }));
          return;
        }

        if (msg.type === 'list_rooms') {
          const list = Array.from(rooms.values()).map(serializeRoom);
          ws.send(JSON.stringify({ type: 'rooms_list', rooms: list }));
          return;
        }

        if (msg.type === 'create_room') {
          const safeName = String(msg.playerName || 'Capitano').slice(0, 24);
          const playerId = String(msg.playerId || `p_${Math.random().toString(36).slice(2, 9)}`).slice(0, 32);
          const code = generateRoomCode();
          currentPlayerId = playerId;
          currentRoomCode = code;

          const room: GameRoom = {
            code,
            name: String(msg.roomName || `Cortile di ${safeName}`).slice(0, 40),
            hostId: playerId,
            pitch: String(msg.pitch || 'cortile').slice(0, 20),
            ballProfile: String(msg.ballProfile || 'supersantos').slice(0, 20),
            weather: String(msg.weather || 'tramonto').slice(0, 20),
            rule: String(msg.rule || 'classica').slice(0, 24),
            seed: typeof msg.seed === 'number' ? msg.seed >>> 0 : 1337,
            players: new Map(),
            createdAt: nowMs,
          };

          room.players.set(playerId, {
            id: playerId,
            name: safeName,
            team: 'blue',
            isHost: true,
            ws,
            joinedAt: nowMs,
          });

          rooms.set(code, room);

          ws.send(
            JSON.stringify({
              type: 'room_joined',
              playerId,
              room: serializeRoom(room),
            }),
          );
          return;
        }

        if (msg.type === 'join_room') {
          const code = String(msg.code || '').toUpperCase().trim().slice(0, 8);
          const room = rooms.get(code);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Stanza non trovata o chiusa.' }));
            return;
          }

          const safeName = String(msg.playerName || `Giocatore ${room.players.size + 1}`).slice(0, 24);
          const playerId = String(msg.playerId || `p_${Math.random().toString(36).slice(2, 9)}`).slice(0, 32);
          currentPlayerId = playerId;
          currentRoomCode = code;

          const blueCount = Array.from(room.players.values()).filter((p) => p.team === 'blue').length;
          const redCount = Array.from(room.players.values()).filter((p) => p.team === 'red').length;
          const assignedTeam: 'blue' | 'red' = redCount <= blueCount ? 'red' : 'blue';

          room.players.set(playerId, {
            id: playerId,
            name: safeName,
            team: assignedTeam,
            isHost: false,
            ws,
            joinedAt: nowMs,
          });

          const serialized = serializeRoom(room);
          ws.send(
            JSON.stringify({
              type: 'room_joined',
              playerId,
              room: serialized,
            }),
          );

          broadcastToRoom(
            room,
            {
              type: 'room_updated',
              room: serialized,
            },
            playerId,
          );

          // Avvisa l'host che un client è appena entrato così può inviargli subito full_sync
          const host = room.players.get(room.hostId);
          if (host && host.ws.readyState === WebSocket.OPEN) {
            host.ws.send(
              JSON.stringify({
                type: 'client_joined_room',
                playerId,
              }),
            );
          }
          return;
        }

        if (!currentRoomCode) return;
        const room = rooms.get(currentRoomCode);
        if (!room) return;

        // Host match start (reliable): inoltra seed, campo, meteo, regole, profilo pallone e opzione gag
        if (msg.type === 'match_start' && room.hostId === currentPlayerId) {
          if (typeof msg.seed === 'number') {
            room.seed = msg.seed >>> 0;
          }
          if (msg.pitch) room.pitch = String(msg.pitch);
          if (msg.weather) room.weather = String(msg.weather);
          if (msg.ballProfile) room.ballProfile = String(msg.ballProfile);
          if (msg.streetRule) room.rule = String(msg.streetRule);
          broadcastToRoom(
            room,
            {
              type: 'match_start',
              seed: room.seed,
              pitch: msg.pitch,
              weather: msg.weather,
              streetRule: msg.streetRule,
              ruleTunnelEnabled: Boolean(msg.ruleTunnelEnabled),
              ruleCappelloEnabled: Boolean(msg.ruleCappelloEnabled),
              ballProfile: msg.ballProfile,
              gagsEnabled: Boolean(msg.gagsEnabled),
            },
            currentPlayerId,
          );
          return;
        }

        // Host authoritative world state snapshot broadcast (20-30 Hz)
        if (msg.type === 'world_state' && room.hostId === currentPlayerId) {
          broadcastToRoom(
            room,
            {
              type: 'world_state',
              state: msg.state,
            },
            currentPlayerId,
          );
          return;
        }

        // Client input relay to Host (~30 Hz)
        if (msg.type === 'client_input') {
          const host = room.players.get(room.hostId);
          if (host && host.ws.readyState === WebSocket.OPEN) {
            host.ws.send(
              JSON.stringify({
                type: 'client_input',
                playerId: currentPlayerId,
                input: msg.input,
              }),
            );
          }
          return;
        }

        // Room settings update
        if (msg.type === 'room_config' && room.hostId === currentPlayerId) {
          if (msg.pitch) room.pitch = String(msg.pitch);
          if (msg.ballProfile) room.ballProfile = String(msg.ballProfile);
          if (msg.weather) room.weather = String(msg.weather);
          if (msg.rule) room.rule = String(msg.rule);
          broadcastToRoom(room, {
            type: 'room_updated',
            room: serializeRoom(room),
          });
          return;
        }

        // Reliable game events from Host (weather/pitch/ball/rules change, goal, tunnel/cappello, gagState, full_sync)
        if (msg.type === 'game_event' && room.hostId === currentPlayerId) {
          broadcastToRoom(
            room,
            {
              type: 'game_event',
              event: msg.event,
            },
            currentPlayerId,
          );
          return;
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      if (!currentRoomCode || !currentPlayerId) return;
      const room = rooms.get(currentRoomCode);
      if (!room) return;

      // Se l'host si disconnette, avvisa i client con un messaggio chiaro e chiude la stanza (niente stanze fantasma)
      if (room.hostId === currentPlayerId) {
        broadcastToRoom(
          room,
          {
            type: 'host_disconnected',
            message: 'L’host si è disconnesso: la stanza è stata chiusa.',
          },
          currentPlayerId,
        );
        rooms.delete(currentRoomCode);
        return;
      }

      room.players.delete(currentPlayerId);
      if (room.players.size === 0) {
        rooms.delete(currentRoomCode);
      } else {
        broadcastToRoom(room, {
          type: 'room_updated',
          room: serializeRoom(room),
        });
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenStreetFootball Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
