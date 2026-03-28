# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the relay broker.

## What This Is

A standalone WebSocket relay broker (~120 lines) for the Betaflight Remote Sharing feature. Pairs two WebSocket connections by room code and forwards binary frames between them. Stateless — all rooms are in-memory with 30-minute auto-expiry.

## Commands

```bash
npm install       # Install dependencies
npm start         # Start broker on port 8765 (or PORT env var)
docker build -t bf-relay .
docker run -p 8765:8765 bf-relay
```

## Architecture

Single file (`server.js`), single dependency (`ws`).

- **Rooms**: `Map<string, {code, host: WebSocket, client: WebSocket, timer}>` — created when host connects, destroyed when host disconnects or 30 min idle.
- **Roles**: Each room has exactly one `host` (has the drone) and one `client` (remote helper). Role is set via `?role=host|client` query param.
- **Binary frames**: forwarded verbatim to the peer. The broker never inspects MSP payload.
- **Text frames**: JSON signaling (`joined`, `peer_joined`, `peer_left`, `error`). Never forwarded.
- **URL format**: `/room/{CODE}?role=host|client` where CODE is alphanumeric with dashes.

## Deployment

Target: `relay.betaflight-remote.com`. Deploy via Docker on Fly.io, Railway, Render, or any VPS. The broker is stateless and lightweight — a single instance handles thousands of concurrent rooms.
