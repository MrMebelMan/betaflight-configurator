<template>
    <div id="remote-code-option">
        <label for="remote-code">
            <span>{{ $t("remoteRoomCodeLabel") }}</span>
            <input
                id="remote-code"
                type="text"
                maxlength="8"
                autocomplete="off"
                :value="modelValue"
                :placeholder="$t('remoteRoomCodePlaceholder')"
                :disabled="isConnected"
                @input="inputValueChanged($event.target.value)"
            />
        </label>
        <button class="remote-join-btn" @click="toggleConnection">
            {{ isConnected ? $t("remoteLeave") : $t("remoteJoin") }}
        </button>
    </div>
</template>

<script>
import { defineComponent, computed } from "vue";
import { set as setConfig } from "../../js/ConfigStorage";
import { connectDisconnect } from "../../js/serial_backend";
import CONFIGURATOR from "../../js/data_storage";

export default defineComponent({
    props: {
        modelValue: {
            type: String,
            default: "",
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const isConnected = computed(() => CONFIGURATOR.connectionValid);

        const inputValueChanged = (newValue) => {
            const cleaned = newValue
                .toUpperCase()
                .replace(/[^A-HJ-NP-Z2-9]/g, "")
                .slice(0, 8);
            setConfig({ remoteRoomCode: cleaned });
            emit("update:modelValue", cleaned);
        };

        const toggleConnection = () => {
            connectDisconnect();
        };

        return {
            isConnected,
            inputValueChanged,
            toggleConnection,
        };
    },
});
</script>

<style lang="less" scoped>
#remote-code-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    input {
        text-transform: uppercase;
        letter-spacing: 0.1em;
        width: 10em;
    }
}

.remote-join-btn {
    padding: 4px 12px;
    border: 1px solid var(--primary-action-border);
    border-radius: 4px;
    background-color: var(--primary-action);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;

    &:hover {
        background-color: var(--primary-action-hover);
    }
}
</style>
