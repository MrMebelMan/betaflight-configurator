<template>
    <div v-if="connectionValid" class="remote-share">
        <template v-if="!isSharing">
            <button class="remote-share__btn" :title="$t('remoteShareStart')" @click="startSharing">
                <span class="remote-share__icon fas fa-share-alt"></span>
            </button>
            <div class="remote-share__label">{{ $t("remoteShareStart") }}</div>
        </template>
        <template v-else>
            <button
                class="remote-share__btn remote-share__btn--active"
                :title="$t('remoteShareStop')"
                @click="stopSharing"
            >
                <span class="remote-share__icon fas fa-share-alt"></span>
            </button>
            <div class="remote-share__code" @click="copyCode">
                {{ roomCode }}
            </div>
            <div v-if="peerConnected" class="remote-share__peer">
                {{ $t("remotePeerConnected") }}
            </div>
        </template>
    </div>
</template>

<script>
import { defineComponent, ref, computed, onBeforeUnmount } from "vue";
import { remoteSharing } from "../../js/remote_sharing.js";
import CONFIGURATOR from "../../js/data_storage.js";

export default defineComponent({
    setup() {
        const connectionValid = computed(() => CONFIGURATOR.connectionValid);

        const isSharing = ref(remoteSharing.isSharing);
        const roomCode = ref(remoteSharing.roomCode);
        const peerConnected = ref(remoteSharing.peerConnected);

        const syncState = () => {
            isSharing.value = remoteSharing.isSharing;
            roomCode.value = remoteSharing.roomCode;
            peerConnected.value = remoteSharing.peerConnected;
        };

        remoteSharing.addEventListener("statechange", syncState);

        onBeforeUnmount(() => {
            remoteSharing.removeEventListener("statechange", syncState);
        });

        const startSharing = () => {
            remoteSharing.startSharing();
        };

        const stopSharing = () => {
            remoteSharing.stopSharing();
        };

        const copyCode = async () => {
            if (roomCode.value) {
                try {
                    await navigator.clipboard.writeText(roomCode.value);
                } catch (_e) {
                    // Clipboard API may not be available
                }
            }
        };

        return {
            connectionValid,
            isSharing,
            roomCode,
            peerConnected,
            startSharing,
            stopSharing,
            copyCode,
        };
    },
});
</script>

<style lang="less" scoped>
.remote-share {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.remote-share__btn {
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

.remote-share__btn--active {
    background-color: var(--primary-action);
    border-color: var(--primary-action-border);

    &:hover {
        background-color: var(--primary-action-hover);
    }
}

.remote-share__label {
    white-space: nowrap;
    font-size: 11px;
    margin-top: 2px;
}

.remote-share__code {
    font-family: monospace;
    font-size: 14px;
    font-weight: bold;
    letter-spacing: 0.1em;
    cursor: pointer;
    margin-top: 2px;
    color: var(--primary-action);

    &:hover {
        text-decoration: underline;
    }
}

.remote-share__peer {
    font-size: 10px;
    color: var(--success-500);
    white-space: nowrap;
}
</style>
