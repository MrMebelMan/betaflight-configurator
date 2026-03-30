# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Betaflight Configurator — a Vue 3 PWA for configuring Betaflight flight controllers. Runs as a web app, desktop app (NW.js), and Android app (Capacitor). Communicates with flight controllers via the MSP (Multiwii Serial Protocol) binary protocol over serial, Bluetooth, TCP, and WebSocket.

## Commands

```bash
yarn dev          # Dev server on localhost:8080 (HTTPS on 8443 if certs present)
yarn build        # Production build
yarn lint         # ESLint check
yarn lint:fix     # Auto-fix lint issues
yarn format       # Prettier formatting
yarn test         # Run vitest suite
yarn storybook    # Storybook on port 6006
```

Run a single test file: `yarn test test/js/msp.test.js`
Run tests in watch mode: `yarn test --watch`

Requires Node 24.x (see `.nvmrc`).

## Code Style

- 4-space indentation, LF line endings, 120 char max line length
- No `var` — use `const`/`let`
- Prefer template literals over string concatenation
- Trailing commas in multiline (`"always-multiline"`)
- Unused imports are errors; unused vars prefixed with `_` are allowed
- Pre-commit hooks (Husky + lint-staged) auto-run Prettier and ESLint on staged `.js`, `.vue`, `.less`, `.css` files

## Architecture

### Communication Layer (MSP Protocol)

The app talks to flight controllers via MSP, a binary serial protocol:

- `src/js/msp.js` — MSP v1/v2 frame decoder (state machine)
- `src/js/msp/MSPCodes.js` — Command constants (~150+ codes)
- `src/js/msp/MSPHelper.js` — Payload encoder/decoder for each MSP command (large file)
- `src/js/msp/MSPConnector.js` — Connection management
- `src/js/serial.js` — Unified serial facade abstracting all transport protocols
- `src/js/serial_backend.js` — Backend MSP communication orchestration

Transport adapters in `src/js/protocols/`: WebSerial, WebBluetooth, CapacitorSerial, CapacitorBle, CapacitorTcp, VirtualSerial, WebSocket, webusbdfu (DFU flashing), webstm32 (STM32 bootloader).

### State Management

Mix of Pinia stores (`src/stores/`) and global singletons:

- **Pinia stores**: `connection`, `fc`, `presets`, `osd`, `pidTuning`, `debug`, `navigation`, `dialog`, `sensors`
- **Global singletons**: `FC` (flight controller state in `src/js/fc.js`), `CONFIGURATOR` (`src/js/data_storage.js`), `GUI` (`src/js/gui.js`), `MSP` (`src/js/msp.js`)

### Tab System

Tabs are Vue 3 SFCs in `src/components/tabs/`. They are lazy-loaded and dynamically mounted via `src/js/vue_tab_mounter.js`. Tab visibility depends on connection state, expert mode toggle, and firmware feature flags.

### Vue 3 Patterns

- Components in `src/components/`, composables in `src/composables/`
- Composition API with composables for reusable logic (e.g., `useCli`, `useFirmwareFlashing`, `useMotorDataPolling`)
- Event communication via `src/components/eventBus.js`
- Pinia instance created in `src/js/pinia_instance.js`

### i18n

Uses i18next with translations in `locales/{lang}/messages.json` (18 languages). HTML elements use `i18n="keyName"` attributes. Vue integration via `i18next-vue`.

### Testing

Vitest with jsdom environment. Test files in `test/`. Setup in `test/setup.js` (polyfills HTMLDialogElement, mocks matchMedia). `VirtualFC` (`src/js/VirtualFC.js`) and `VirtualSerial` enable testing without hardware.

### Remote Sharing

Enables remote drone configuration over the internet. A cloud WebSocket relay (`broker/`) pairs two configurator instances by room code and forwards MSP bytes bidirectionally. Both sides connect outbound to the relay — no port forwarding required.

**Key files:**
- `src/js/remote_sharing.js` — Host-side bridge singleton. Listens to serial `receive` events and forwards bytes to the broker WebSocket. Receives remote client bytes from the broker and sends them to the FC via `serial.send()`. Manages room lifecycle, auto-connect on peer join, and persistence across page refreshes.
- `src/components/remote-sharing/RemoteShareButton.vue` — Share button in header bar. Always visible (except on remote client). Generates room code, shows sharing/peer status, copy-to-clipboard.
- `src/components/remote-sharing/RemoteJoinButton.vue` — Join/Leave button in header bar. Only visible when "Remote" is selected. Connects/disconnects the broker WebSocket via `toggleRemoteRoom()`.
- `src/components/port-picker/RemoteCodeInput.vue` — Room code input shown when "Remote" is selected in port picker. Validates input against `CODE_CHARS` (A-Z excluding I/O, digits 2-9), 8 characters. Hidden when joined.
- `src/js/protocols/WebSocket.js` — Extended to handle text signaling frames from the broker (`signal` event) and detect relay connections via `_isRemoteRelay()`.
- `broker/` — Standalone WebSocket relay server with rate limiting. See `broker/CLAUDE.md`.

**Flow:**
1. Host clicks Share → room code generated (persisted to ConfigStorage), broker WebSocket opened
2. Remote selects "Remote" in port picker → enters code → clicks Join → connects to broker
3. Remote clicks Connect → sends `connect_drone` signal → host connects to selected serial port
4. MSP handshake completes → bridging starts → host sends `fc_reconnected` signal
5. Remote receives signal → runs `onOpen()` to fetch FC config → tabs load with live data

**Shareable URLs:** Clicking the room code copies a URL like `https://app.betaflight-remote.com/?room=XK7M2PQR`. Opening this URL auto-selects "Remote", fills the code, and joins the room.

**Button separation on remote:**
- **Join/Leave** (`RemoteJoinButton`) — manages the broker WebSocket connection (room)
- **Connect/Disconnect** (header button) — sends `connect_drone`/`disconnect_drone` signal to the host, which connects/disconnects the FC. Uses `CONFIGURATOR.connectionValid` to determine direction.
- When "Remote" is selected, Update Firmware button is hidden. Connect button is hidden until room is joined (`CONFIGURATOR.remoteRoomJoined`).

**FC reboot handling:** When the FC reboots (e.g., CLI `exit`, Save & Reboot), serial drops on the host → bridging pauses, broker room stays open. Host sends `fc_disconnected` signal. When FC reconnects, host re-does MSP handshake, resumes bridging, sends `fc_reconnected`. Remote re-initializes (clears stale MSP, resets FC state, re-requests config), navigates to Setup tab.

**Room code persistence:** Room code is stored in ConfigStorage (`remoteSharingCode`). On page refresh, `resumeSharing()` is called on mount to reconnect to the broker with the stored code. Only "Stop Sharing" clears the code.

**Host MSP is not blocked:** The bridge is a transparent byte tap — it copies serial data to the broker without interfering with the host's own MSP traffic. Both host and remote can use the configurator simultaneously.

**CLI sharing:** Both host and remote can use CLI simultaneously. When the remote enters CLI, it sends `cli_enter` signal → host sets `CONFIGURATOR.remoteCliActive = true` → `MSP.send_message()` short-circuits on the host (prevents MSP garbage in CLI). When only the host is in CLI, serial data is not forwarded to the remote. When both are in CLI, data flows both ways (shared session). If the host tries to enter CLI while remote is in CLI, it joins the existing session without sending `#`.

**Signaling protocol** (text frames through broker, forwarded between peers):
- `fc_reconnected` — host → remote: FC rebooted and reconnected, re-initialize
- `fc_disconnected` — host → remote: FC disconnected, clean up remote connection
- `connect_drone` / `disconnect_drone` — remote → host: connect/disconnect the FC
- `cli_enter` / `cli_exit` — remote → host: CLI mode state sync
- `peer_joined` / `peer_left` — broker → both: peer connection status

**Default broker:** `wss://relay.betaflight-remote.com`, configurable in Options tab.

**Local dev:** Run `cd broker && npm start` (port 8765), set broker URL to `ws://localhost:8765` in Options on both instances.

**Deployment:** Docker Compose with Traefik for TLS. `app.betaflight-remote.com` (nginx serving PWA), `relay.betaflight-remote.com` (broker). See `docker-compose.yml`.

### Build & Platforms

Vite-based build. PWA via `@niccoloetti/vite-plugin-pwa`. Entry points: main app and `receiver_msp` (standalone receiver page). Desktop builds use NW.js. Android uses Capacitor with custom native serial plugin.
