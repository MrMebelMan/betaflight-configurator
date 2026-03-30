import { serial } from "./serial";

let _forwarding = false;
let _remoteSharing = null;

export function setRemoteSharingInstance(instance) {
    _remoteSharing = instance;
}

/**
 * log to GUI
 * @param {string} message message to log to GUI
 */
export function gui_log(message) {
    const commandLog = document.querySelector("div#log");
    if (!commandLog) {
        return;
    }
    const wrapper = commandLog.querySelector("div.wrapper");
    if (!wrapper) {
        return;
    }

    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() < 9 ? `0${d.getMonth() + 1}` : d.getMonth() + 1;
    const date = d.getDate() < 10 ? `0${d.getDate()}` : d.getDate();
    const hours = d.getHours() < 10 ? `0${d.getHours()}` : d.getHours();
    const minutes = d.getMinutes() < 10 ? `0${d.getMinutes()}` : d.getMinutes();
    const seconds = d.getSeconds() < 10 ? `0${d.getSeconds()}` : d.getSeconds();
    const time = `${hours}:${minutes}:${seconds}`;

    const formattedDate = `${year}-${month}-${date} @${time}`;
    wrapper.insertAdjacentHTML("beforeend", `<p>${formattedDate} -- ${message}</p>`);
    commandLog.scrollTop = wrapper.scrollHeight;

    // Forward to remote peer (host uses broker WS, remote uses serial WS)
    if (!_forwarding) {
        if (_remoteSharing?._ws?.readyState === WebSocket.OPEN) {
            _remoteSharing._ws.send(JSON.stringify({ type: "log", message }));
        } else {
            serial.sendSignal({ type: "log", message });
        }
    }
}

/**
 * Log a message received from the remote peer (no re-forwarding)
 */
export function gui_log_remote(message) {
    _forwarding = true;
    gui_log(message);
    _forwarding = false;
}
