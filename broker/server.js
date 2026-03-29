import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8765;
const ROOM_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // max connections per IP per window

const rooms = new Map();
const ipHits = new Map();

function isRateLimited(ip) {
    const now = Date.now();
    let record = ipHits.get(ip);

    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
        record = { windowStart: now, count: 0 };
        ipHits.set(ip, record);
    }

    record.count++;
    ipHits.set(ip, record);
    return record.count > RATE_LIMIT_MAX;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipHits) {
        if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
            ipHits.delete(ip);
        }
    }
}, RATE_LIMIT_WINDOW_MS);

function generateSignal(type, extra) {
    return JSON.stringify({ type, ...extra });
}

function destroyRoom(code) {
    const room = rooms.get(code);
    if (!room) return;

    clearTimeout(room.timer);

    if (room.host?.readyState === 1) {
        room.host.close(1000, "room_destroyed");
    }
    if (room.client?.readyState === 1) {
        room.client.close(1000, "room_destroyed");
    }

    rooms.delete(code);
    console.log(`Room ${code} destroyed`);
}

function touchRoom(room) {
    clearTimeout(room.timer);
    room.timer = setTimeout(() => destroyRoom(room.code), ROOM_TIMEOUT_MS);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
    console.log(`Relay broker listening on port ${PORT}`);
});

wss.on("connection", (ws, req) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;

    if (isRateLimited(ip)) {
        ws.send(generateSignal("error", { message: "Too many connection attempts. Try again later." }));
        ws.close(1008, "rate_limited");
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]+)$/);

    if (!match) {
        ws.send(generateSignal("error", { message: "Invalid URL. Use /room/{CODE}?role=host|client" }));
        ws.close(1008, "invalid_url");
        return;
    }

    const code = match[1];
    const role = url.searchParams.get("role");

    if (role !== "host" && role !== "client") {
        ws.send(generateSignal("error", { message: "Missing or invalid role. Use ?role=host or ?role=client" }));
        ws.close(1008, "invalid_role");
        return;
    }

    let room = rooms.get(code);

    if (role === "host") {
        if (room?.host?.readyState === 1) {
            ws.send(generateSignal("error", { message: "Room already has a host" }));
            ws.close(1008, "host_exists");
            return;
        }

        if (!room) {
            room = { code, host: null, client: null, timer: null };
            rooms.set(code, room);
            console.log(`Room ${code} created`);
        }

        room.host = ws;
        touchRoom(room);

        ws.send(generateSignal("joined", { role: "host", code }));

        if (room.client?.readyState === 1) {
            ws.send(generateSignal("peer_joined"));
            room.client.send(generateSignal("peer_joined"));
        }
    } else {
        // client
        if (!room || !room.host || room.host.readyState !== 1) {
            ws.send(generateSignal("error", { message: "Room not found or host not connected" }));
            ws.close(1008, "no_host");
            return;
        }

        if (room.client?.readyState === 1) {
            ws.send(generateSignal("error", { message: "Room already has a client" }));
            ws.close(1008, "client_exists");
            return;
        }

        room.client = ws;
        touchRoom(room);

        ws.send(generateSignal("joined", { role: "client", code }));
        room.host.send(generateSignal("peer_joined"));
    }

    ws.on("message", (data, isBinary) => {
        const room = rooms.get(code);
        if (!room) return;

        touchRoom(room);

        const peer = ws === room.host ? room.client : room.host;
        if (peer?.readyState === 1) {
            peer.send(data, { binary: isBinary });
        }
    });

    ws.on("close", () => {
        const room = rooms.get(code);
        if (!room) return;

        if (ws === room.host) {
            // Host left — destroy the room
            console.log(`Room ${code}: host disconnected`);
            if (room.client?.readyState === 1) {
                room.client.send(generateSignal("peer_left"));
            }
            destroyRoom(code);
        } else if (ws === room.client) {
            // Client left — keep room alive for reconnection
            console.log(`Room ${code}: client disconnected`);
            room.client = null;
            if (room.host?.readyState === 1) {
                room.host.send(generateSignal("peer_left"));
            }
        }
    });

    ws.on("error", (err) => {
        console.error(`WebSocket error in room ${code}:`, err.message);
    });
});
