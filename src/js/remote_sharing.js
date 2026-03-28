import { serial } from "./serial.js";
import { get as getConfig } from "./ConfigStorage";

const DEFAULT_BROKER_URL = "wss://relay.betaflight-remote.com";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
const CODE_LENGTH = 7; // e.g. "XK7-M2P"

class RemoteSharing extends EventTarget {
    constructor() {
        super();
        this._sharing = false;
        this._roomCode = null;
        this._peerConnected = false;
        this._ws = null;
        this._onSerialReceive = this._onSerialReceive.bind(this);
        this._onSerialDisconnect = this._onSerialDisconnect.bind(this);
    }

    get isSharing() {
        return this._sharing;
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
            if (i === 3) {
                code += "-";
            }
            code += CODE_CHARS[randomBytes[i] % CODE_CHARS.length];
        }
        return code;
    }

    _emitStateChange() {
        this.dispatchEvent(new CustomEvent("statechange"));
    }

    startSharing() {
        if (this._sharing) {
            return;
        }
        if (!serial.connected) {
            console.warn("[REMOTE] Cannot share — not connected to a flight controller");
            return;
        }

        this._roomCode = this._generateRoomCode();
        const url = `${this.brokerUrl}/room/${this._roomCode}?role=host`;

        console.log(`[REMOTE] Starting share, connecting to broker: ${url}`);

        this._ws = new WebSocket(url);
        this._ws.binaryType = "arraybuffer";

        this._ws.onopen = () => {
            console.log(`[REMOTE] Connected to broker, room code: ${this._roomCode}`);
            this._sharing = true;
            this._emitStateChange();

            // Start bridging serial → broker
            serial.addEventListener("receive", this._onSerialReceive);
            serial.addEventListener("disconnect", this._onSerialDisconnect);
        };

        this._ws.onmessage = (event) => {
            if (typeof event.data === "string") {
                // Signaling frame
                this._handleSignal(event.data);
                return;
            }

            // Binary frame from remote client → send to FC
            if (serial.connected) {
                serial.send(event.data);
            }
        };

        this._ws.onclose = () => {
            console.log("[REMOTE] Broker connection closed");
            this._cleanup();
        };

        this._ws.onerror = (err) => {
            console.error("[REMOTE] Broker connection error:", err);
        };
    }

    stopSharing() {
        if (!this._sharing && !this._ws) {
            return;
        }

        console.log("[REMOTE] Stopping share");

        if (this._ws) {
            try {
                this._ws.close(1000, "host_stopped");
            } catch (_e) {
                // ignore
            }
        }

        this._cleanup();
    }

    _handleSignal(raw) {
        try {
            const msg = JSON.parse(raw);
            console.log("[REMOTE] Signal:", msg);

            if (msg.type === "peer_joined") {
                this._peerConnected = true;
                this._emitStateChange();
            } else if (msg.type === "peer_left") {
                this._peerConnected = false;
                this._emitStateChange();
            } else if (msg.type === "error") {
                console.error("[REMOTE] Broker error:", msg.message);
                this.stopSharing();
            }
        } catch (_e) {
            console.warn("[REMOTE] Invalid signal frame:", raw);
        }
    }

    _onSerialReceive(event) {
        // Forward FC bytes to broker
        if (this._ws?.readyState === WebSocket.OPEN) {
            const data = event.detail?.data ?? event.detail;
            this._ws.send(data);
        }
    }

    _onSerialDisconnect() {
        console.log("[REMOTE] Serial disconnected, stopping share");
        this.stopSharing();
    }

    _cleanup() {
        serial.removeEventListener("receive", this._onSerialReceive);
        serial.removeEventListener("disconnect", this._onSerialDisconnect);
        this._ws = null;
        this._sharing = false;
        this._peerConnected = false;
        this._roomCode = null;
        this._emitStateChange();
    }
}

export const remoteSharing = new RemoteSharing();
