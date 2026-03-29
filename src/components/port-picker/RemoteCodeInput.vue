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
                @input="inputValueChanged($event.target.value)"
            />
        </label>
    </div>
</template>

<script>
import { defineComponent } from "vue";
import { set as setConfig } from "../../js/ConfigStorage";

export default defineComponent({
    props: {
        modelValue: {
            type: String,
            default: "",
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const inputValueChanged = (newValue) => {
            const cleaned = newValue
                .toUpperCase()
                .replace(/[^A-HJ-NP-Z2-9]/g, "")
                .slice(0, 8);
            setConfig({ remoteRoomCode: cleaned });
            emit("update:modelValue", cleaned);
        };

        return {
            inputValueChanged,
        };
    },
});
</script>

<style lang="less" scoped>
#remote-code-option {
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
</style>
