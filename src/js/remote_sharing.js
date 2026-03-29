import { serial } from "./serial.js";
import { get as getConfig, set as setConfig } from "./ConfigStorage";
import CONFIGURATOR from "./data_storage.js";
import { connectDisconnect } from "./serial_backend.js";

const DEFAULT_BROKER_URL = "wss://relay.betaflight-remote.com";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
const CODE_LENGTH = 8;

class RemoteSharing extends EventTarget {
    constructor() {
        super();
        this._sharing = false;
        this._bridging = false;
        this._roomCode = null;
        this._peerConnected = false;
        this._ws = null;
        this._onSerialReceive = this._onSerialReceive.bind(this);
        this._onSerialDisconnect = this._onSerialDisconnect.bind(this);
        this._onSerialConnect = this._onSerialConnect.bind(this);
    }

    get isSharing() {
        return this._sharing;
    }

    get bridging() {
        return this._bridging;
    }

    get roomCode() {
        return this._roomCode;
    }

    get peerConnected() {
        return this._peerConnected;
    }

    get brokerUrl() {
        let url = getConfig("remoteBrokerUrl", DEFAULT_BROKER_URL).remoteBrokerUrl.trim();
        url = url.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
        if (!/^wss?:\/\//.test(url)) {
            url = `ws://${url}`;
        }
        return url.replace(/\/+$/, "");
    }

    _generateRoomCode() {
        const randomBytes = new Uint8Array(CODE_LENGTH);
        crypto.getRandomValues(randomBytes);
        let code = "";
        for (let i = 0; i < CODE_LENGTH; i++) {
            code += CODE_CHARS[randomBytes[i] % CODE_CHARS.length];
        }
        return code;
    }

    _emitStateChange() {
        this.dispatchEvent(new CustomEvent("statechange"));
    }

    _startBridging() {
        if (this._bridging) return;
        serial.addEventListener("receive", this._onSerialReceive);
        serial.addEventListener("disconnect", this._onSerialDisconnect);
        this._bridging = true;
    }

    _stopBridging() {
        serial.removeEventListener("receive", this._onSerialReceive);
        serial.removeEventListener("disconnect", this._onSerialDisconnect);
        this._bridging = false;
    }

    _connectBroker(roomCode) {
        if (this._ws) return;

        this._roomCode = roomCode;
        const url = `${this.brokerUrl}/room/${this._roomCode}?role=host`;
        console.log(`[REMOTE] Connecting to broker: ${url}`);

        this._ws = new WebSocket(url);
        this._ws.binaryType = "arraybuffer";

        this._ws.onopen = () => {
            console.log(`[REMOTE] Connected to broker, room code: ${this._roomCode}`);
            this._sharing = true;

            // If FC is already fully connected, start bridging immediately
            if (serial.connected && CONFIGURATOR.connectionValid) {
                this._startBridging();
            }

            this._emitStateChange();
        };

        this._ws.onmessage = (event) => {
            if (typeof event.data === "string") {
                this._handleSignal(event.data);
                return;
            }
            // Binary frame from remote client -> send to FC
            if (serial.connected) {
                serial.send(event.data);
            }
        };

        this._ws.onclose = () => {
            console.log("[REMOTE] Broker connection closed");
            this._stopBridging();
            this._ws = null;
            this._sharing = false;
            this._peerConnected = false;
            this._emitStateChange();
            // Don't clear room code or persisted state — allow auto-reconnect
        };

        this._ws.onerror = (err) => {
            console.error("[REMOTE] Broker connection error:", err);
        };

        // Listen for serial connect/disconnect to auto-bridge
        serial.addEventListener("connect", this._onSerialConnect);
    }

    // Called once — generates code, persists it, connects to broker
    startSharing() {
        if (this._sharing || this._ws) {
            return;
        }

        const roomCode = this._generateRoomCode();
        setConfig({ remoteSharingCode: roomCode });
        this._connectBroker(roomCode);
    }

    // Resume sharing with persisted code (after page refresh)
    resumeSharing() {
        if (this._sharing || this._ws) {
            return;
        }
        const stored = getConfig("remoteSharingCode", "").remoteSharingCode;
        if (stored) {
            console.log(`[REMOTE] Resuming share with stored code: ${stored}`);
            this._connectBroker(stored);
        }
    }

    stopSharing() {
        if (!this._sharing && !this._ws) {
            return;
        }

        console.log("[REMOTE] Stopping share");
        setConfig({ remoteSharingCode: "" });

        if (this._ws) {
            try {
                this._ws.close(1000, "host_stopped");
            } catch (_e) {
                // ignore
            }
        }

        this._stopBridging();
        serial.removeEventListener("connect", this._onSerialConnect);
        this._ws = null;
        this._sharing = false;
        this._peerConnected = false;
        this._roomCode = null;
        this._emitStateChange();
    }

    _handleSignal(raw) {
        try {
            const msg = JSON.parse(raw);
            console.log("[REMOTE] Signal:", msg);

            if (msg.type === "peer_joined") {
                this._peerConnected = true;
                // Auto-connect drone if not already connected
                if (!serial.connected) {
                    console.log("[REMOTE] Remote joined, auto-connecting drone");
                    connectDisconnect();
                }
                this._emitStateChange();
            } else if (msg.type === "peer_left") {
                this._peerConnected = false;
                this._emitStateChange();
            } else if (msg.type === "error") {
                console.error("[REMOTE] Broker error:", msg.message);
                // Don't stopSharing on error — try to reconnect
                console.log("[REMOTE] Will retry broker connection in 3s");
                this._ws = null;
                this._sharing = false;
                this._stopBridging();
                this._emitStateChange();
                setTimeout(() => this._retryBroker(), 3000);
            }
        } catch (_e) {
            console.warn("[REMOTE] Invalid signal frame:", raw);
        }
    }

    _retryBroker() {
        const stored = getConfig("remoteSharingCode", "").remoteSharingCode;
        if (stored && !this._ws) {
            console.log("[REMOTE] Retrying broker connection");
            this._connectBroker(stored);
        }
    }

    _onSerialReceive(event) {
        if (this._ws?.readyState === WebSocket.OPEN) {
            const data = event.detail?.data ?? event.detail;
            this._ws.send(data);
        }
    }

    _onSerialDisconnect() {
        console.log("[REMOTE] Serial disconnected, pausing bridge (room stays open)");
        this._stopBridging();
        this._emitStateChange();
    }

    _onSerialConnect() {
        if (this._sharing && this._ws?.readyState === WebSocket.OPEN) {
            // Wait for MSP handshake to complete before blocking host MSP
            console.log("[REMOTE] Serial connected, waiting for MSP handshake...");
            const check = setInterval(() => {
                if (CONFIGURATOR.connectionValid) {
                    clearInterval(check);
                    console.log("[REMOTE] MSP handshake done, starting bridge");
                    this._startBridging();
                    // Tell the remote client to re-request FC config
                    this._ws.send(JSON.stringify({ type: "fc_reconnected" }));
                    this._emitStateChange();
                }
            }, 100);
            setTimeout(() => clearInterval(check), 15000);
        }
    }
}

export const remoteSharing = new RemoteSharing();
