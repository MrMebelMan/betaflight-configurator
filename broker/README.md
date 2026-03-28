# Betaflight Remote Relay Broker

WebSocket relay that enables remote drone configuration. Pairs two connections (host + client) by room code and forwards MSP bytes bidirectionally.

## How It Works

```
[Host PC]                        [Broker]                    [Remote PC]
FC <-USB-> Configurator --ws:--> Room "XK7-M2P" <--ws:-- Configurator
           (Share button)       (byte forwarder)          (Remote mode)
```

1. Host connects to FC, clicks **Share** — generates a room code, opens WebSocket to broker as `host`
2. Remote helper selects **Remote** in port picker, enters the code, connects to broker as `client`
3. Broker forwards all binary frames between host and client — the remote configurator works as if directly connected

## Running Locally

```bash
npm install
node server.js
# or
npm start
```

Listens on port 8765 by default. Override with `PORT` env var.

## Docker

```bash
docker build -t bf-relay .
docker run -p 8765:8765 bf-relay
```

## Deploying

### Fly.io

```bash
fly launch --name bf-relay --internal-port 8765
fly deploy
```

### Any VPS

```bash
docker run -d --restart unless-stopped -p 8765:8765 bf-relay
```

### Cloudflare / Railway / Render

Set `PORT` env var to whatever the platform assigns, deploy the Docker image or `server.js` directly (Node 24+).

## Protocol

- **URL**: `ws[s]://host:port/room/{CODE}?role=host|client`
- **Binary frames**: forwarded verbatim to the peer
- **Text frames** (signaling, not forwarded):
  - `{"type":"joined","role":"host|client","code":"..."}` — confirmed join
  - `{"type":"peer_joined"}` — the other side connected
  - `{"type":"peer_left"}` — the other side disconnected
  - `{"type":"error","message":"..."}` — connection rejected
- Room is destroyed when host disconnects. Client disconnect keeps room alive for reconnection.
- Rooms auto-expire after 30 minutes of inactivity.

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT`  | `8765`  | Listen port |
