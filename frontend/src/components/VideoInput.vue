<template>
  <form class="video-input" :class="{ compact }" @submit.prevent="handleClick">
    <div v-if="compact" class="compact-summary" aria-hidden="true">
      <span class="status-dot"></span>
      <span class="compact-id">{{ displayId }}</span>
    </div>

    <label :for="inputId">Video link / ID</label>
    <div class="input-row">
      <input
        :id="inputId"
        type="text"
        placeholder="Paste video ID, share link, or share text"
        autocomplete="off"
        v-model="inputValue"
      />
      <button :disabled="isLoading || !inputValue.trim()" type="button" @click="handleClick">
        {{ isLoading ? 'Loading' : 'Fetch' }}
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  isLoading?: boolean
  compact?: boolean
  currentId?: string
}>()
const emit = defineEmits<{
  fetch: [awemeId: string]
}>()

const inputValue = ref(props.currentId || '')
const inputId = computed(() => (props.compact ? 'aweme-id-compact' : 'aweme-id'))
const displayId = computed(() => props.currentId || inputValue.value || 'Video link / ID')

watch(
  () => props.currentId,
  (currentId) => {
    if (currentId) {
      inputValue.value = currentId
    }
  }
)

function handleClick() {
  const trimmed = inputValue.value.trim()
  if (trimmed) {
    emit('fetch', trimmed)
  }
}
</script>

<style scoped>
.video-input {
  position: relative;
  display: grid;
  gap: 10px;
}

.compact {
  width: min(420px, calc(100vw - 24px));
  min-height: 52px;
  padding: 0;
}

label {
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  text-transform: uppercase;
}

.compact label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.compact .input-row {
  width: 100%;
  padding: 6px;
  border: 1px solid rgba(23, 32, 38, 0.1);
  border-radius: 999px;
  background: rgba(255, 253, 250, 0.94);
  box-shadow: 0 14px 40px rgba(39, 34, 28, 0.18);
  opacity: 0;
  transform: translateX(-8px) scale(0.96);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.compact:hover .input-row,
.compact:focus-within .input-row {
  opacity: 1;
  transform: translateX(0) scale(1);
  pointer-events: auto;
}

.compact-summary {
  position: absolute;
  inset: 0 auto auto 0;
  display: inline-flex;
  align-items: center;
  max-width: min(320px, calc(100vw - 24px));
  height: 52px;
  gap: 9px;
  padding: 0 16px;
  border: 1px solid rgba(23, 32, 38, 0.1);
  border-radius: 999px;
  color: var(--ink);
  background: rgba(255, 253, 250, 0.94);
  box-shadow: 0 14px 40px rgba(39, 34, 28, 0.18);
  opacity: 1;
  transform: translateX(0) scale(1);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.compact:hover .compact-summary,
.compact:focus-within .compact-summary {
  opacity: 0;
  transform: translateX(-8px) scale(0.96);
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 5px rgba(15, 118, 110, 0.1);
}

.compact-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 900;
}

input {
  min-width: 0;
  height: 52px;
  padding: 0 16px;
  border: 1px solid rgba(23, 32, 38, 0.14);
  border-radius: 8px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.86);
  outline: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.compact input {
  height: 40px;
  border-radius: 999px;
  background: #fff;
}

input:focus {
  border-color: rgba(15, 118, 110, 0.6);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
}

button {
  min-width: 86px;
  height: 52px;
  padding: 0 20px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--accent);
  font-weight: 800;
  transition:
    background 160ms ease,
    transform 160ms ease,
    opacity 160ms ease;
}

.compact button {
  min-width: 74px;
  height: 40px;
  border-radius: 999px;
  padding: 0 14px;
}

button:hover:not(:disabled) {
  background: var(--accent-dark);
  transform: translateY(-1px);
}

button:disabled {
  opacity: 0.55;
}

@media (max-width: 520px) {
  .input-row {
    grid-template-columns: 1fr;
  }

  .compact .input-row {
    grid-template-columns: 1fr auto;
  }

  button {
    width: 100%;
  }

  .compact button {
    width: auto;
  }
}

@media (max-width: 640px) {
  .compact {
    width: 100%;
    min-height: 46px;
  }

  .compact-summary {
    display: none;
  }

  .compact .input-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    padding: 5px;
    border-radius: 8px;
    box-shadow: 0 10px 26px rgba(39, 34, 28, 0.12);
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }

  .compact:hover .input-row,
  .compact:focus-within .input-row {
    transform: none;
  }

  .compact input {
    height: 38px;
    padding: 0 12px;
    border-radius: 7px;
    font-size: 14px;
  }

  .compact button {
    min-width: 64px;
    height: 38px;
    padding: 0 12px;
    border-radius: 7px;
    font-size: 14px;
  }
}

@media (max-width: 380px) {
  input {
    padding: 0 12px;
  }

  button {
    min-width: 76px;
    padding: 0 14px;
  }

  .compact button {
    min-width: 58px;
    padding: 0 10px;
  }
}
</style>
