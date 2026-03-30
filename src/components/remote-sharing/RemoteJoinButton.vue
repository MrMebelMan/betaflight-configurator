<template>
    <div v-if="isRemote" class="remote-join">
        <button
            class="remote-join__btn"
            :class="{
                'remote-join__btn--active': CONFIGURATOR.remoteRoomJoined,
                'remote-join__btn--ready': !CONFIGURATOR.remoteRoomJoined && codeReady,
            }"
            :title="CONFIGURATOR.remoteRoomJoined ? $t('remoteLeave') : $t('remoteJoin')"
            @click="toggle"
        >
            <em class="fas fa-link"></em>
        </button>
        <div class="remote-join__label">
            {{ CONFIGURATOR.remoteRoomJoined ? $t("remoteLeave") : $t("remoteJoin") }}
        </div>
        <div v-if="CONFIGURATOR.remoteError" class="remote-join__error">
            {{ CONFIGURATOR.remoteError }}
        </div>
    </div>
</template>

<script>
import { defineComponent, computed, onBeforeUnmount } from "vue";
import { toggleRemoteRoom } from "../../js/serial_backend";
import { serial } from "../../js/serial";
import PortHandler from "../../js/port_handler";
import CONFIGURATOR from "../../js/data_storage";

export default defineComponent({
    setup() {
        const isRemote = computed(() => PortHandler.portPicker.selectedPort === "remote");
        const codeReady = computed(() => PortHandler.portPicker.remoteRoomCode?.length === 8);

        const onConnect = () => {
            CONFIGURATOR.remoteRoomJoined = true;
            CONFIGURATOR.remoteError = "";
        };
        const onDisconnect = () => {
            CONFIGURATOR.remoteRoomJoined = false;
        };

        serial.addEventListener("connect", onConnect);
        serial.addEventListener("disconnect", onDisconnect);

        onBeforeUnmount(() => {
            serial.removeEventListener("connect", onConnect);
            serial.removeEventListener("disconnect", onDisconnect);
        });

        const toggle = () => {
            CONFIGURATOR.remoteError = "";
            toggleRemoteRoom();
        };

        return {
            isRemote,
            codeReady,
            CONFIGURATOR,
            toggle,
        };
    },
});
</script>

<style lang="less" scoped>
.remote-join {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.remote-join__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--surface-500);
    border: 1px solid var(--surface-600);
    height: 50px;
    width: 50px;
    border-radius: 100px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    transition: none;
    color: var(--text-primary);
    font-size: 20px;

    &:hover {
        background-color: var(--surface-400);
    }
}

.remote-join__btn--ready {
    background-color: var(--primary-500);
    border-color: var(--primary-600);

    &:hover {
        background-color: var(--primary-400);
    }
}

.remote-join__btn--active {
    background-color: var(--primary-action);
    border-color: var(--primary-action-border);

    &:hover {
        background-color: var(--primary-action-hover);
    }
}

.remote-join__label {
    white-space: nowrap;
    font-size: 11px;
    margin-top: 2px;
}

.remote-join__error {
    font-size: 10px;
    color: var(--error-500);
    text-align: center;
    max-width: 150px;
    word-wrap: break-word;
}
</style>
