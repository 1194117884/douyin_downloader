<template>
  <div id="app-root" class="app-shell">
    <Transition name="center-fade" mode="out-in">
      <main v-if="!videoData" class="parse-stage" aria-labelledby="app-title">
        <section class="parse-panel">
          <h1 id="app-title">Inspect and save Douyin videos.</h1>
          <p class="intro-copy">
            Paste an aweme id and get creator details, media stats, and direct download access.
          </p>
          <VideoInput :is-loading="isLoading" @fetch="handleFetchVideo" />
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div v-if="isLoading" class="parse-loading" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </section>
      </main>

      <main v-else class="result-stage">
        <div class="floating-input">
          <VideoInput compact :current-id="lastAwemeId || videoData.aweme_id" :is-loading="isLoading"
            @fetch="handleFetchVideo" />
        </div>

        <section class="result-panel" aria-live="polite">
          <VideoInfo :video-data="videoData" :address-options="videoAddressOptions" :selected-url="selectedDownloadUrl"
            @select-url="selectDownloadUrl" />
        </section>
      </main>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import VideoInput from './components/VideoInput.vue'
import VideoInfo from './components/VideoInfo.vue'
import { useDouyin } from './composables/useDouyin'

const {
  videoData,
  selectedDownloadUrl,
  videoAddressOptions,
  isLoading,
  error,
  fetchVideo,
  selectDownloadUrl,
} = useDouyin()

const lastAwemeId = ref(videoData.value?.aweme_id || '')

async function handleFetchVideo(rawInput: string): Promise<void> {
  lastAwemeId.value = rawInput
  await fetchVideo(rawInput)
}
</script>

<style>
:root {
  color: #161823;
  background: #f5f5f7;
  color-scheme: light;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  --ink: #161823;
  --muted: #8a8b91;
  --line: #e8e8ec;
  --panel: #ffffff;
  --panel-strong: #ffffff;
  --accent: #FE2C55;
  --accent-dark: #d6244a;
  --coral: #FE2C55;
  --cyan: #00f2ea;
  --shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  height: 100vh;
  overflow: hidden;
}

html,
#app {
  height: 100%;
  overflow: hidden;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}

.app-shell {
  height: 100dvh;
  position: relative;
  padding: 28px;
  overflow: hidden;
  background:
    linear-gradient(140deg, rgba(254, 44, 85, 0.06), transparent 34%),
    linear-gradient(320deg, rgba(0, 242, 234, 0.07), transparent 34%),
    #f5f5f7;
}

.parse-stage {
  display: grid;
  height: 100%;
  place-items: center;
  overflow: hidden;
}

.result-stage {
  display: flex;
  flex-direction: column;
  max-width: 1280px;
  height: 100%;
  margin: 0 auto;
  overflow: hidden;
}

.parse-panel,
.result-panel {
  border: 1px solid rgba(23, 32, 38, 0.1);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.parse-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: min(100%, 620px);
  max-height: 100%;
  padding: 42px;
  border-radius: 8px;
  overflow: auto;
}

.result-panel {
  flex: 1;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.floating-input {
  position: fixed;
  top: 28px;
  left: 28px;
  z-index: 20;
  animation: bubble-in 420ms ease both;
}

.center-fade-enter-active,
.center-fade-leave-active {
  transition:
    opacity 260ms ease,
    transform 260ms ease,
    filter 260ms ease;
}

.center-fade-enter-from,
.center-fade-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
  filter: blur(3px);
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translate(-12px, -12px) scale(0.9);
  }

  to {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
}

.brand-mark {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  background: var(--ink);
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  max-width: 11ch;
  font-size: clamp(42px, 6vw, 76px);
  line-height: 0.95;
  letter-spacing: 0;
}

.intro-copy {
  max-width: 560px;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.7;
}

.error {
  padding: 14px 16px;
  border: 1px solid rgba(226, 85, 69, 0.24);
  border-radius: 8px;
  color: #9f2f25;
  background: rgba(226, 85, 69, 0.1);
  font-weight: 700;
}

.parse-loading {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--muted);
}

.parse-loading span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse-dot 880ms ease-in-out infinite;
}

.parse-loading span:nth-child(2) {
  animation-delay: 120ms;
}

.parse-loading span:nth-child(3) {
  animation-delay: 240ms;
}

@keyframes pulse-dot {

  0%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

@media (max-width: 900px) {
  .app-shell {
    padding: 16px;
  }

  .parse-stage {
    height: 100%;
  }

  .parse-panel {
    padding: 28px;
  }

  h1 {
    max-width: 12ch;
    font-size: 44px;
  }

  .result-stage {
    padding-top: 70px;
  }
}

@media (max-width: 640px) {
  body {
    height: auto;
    min-height: 100vh;
    overflow: auto;
  }

  html,
  #app {
    height: auto;
    min-height: 100%;
    overflow: visible;
  }

  .app-shell {
    min-height: 100dvh;
    height: auto;
    padding: 0;
    overflow: visible;
  }

  .parse-stage {
    min-height: 100dvh;
    height: auto;
    padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
  }

  .parse-panel,
  .result-panel {
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .parse-panel {
    width: 100%;
    max-height: none;
    padding: 28px 18px;
    gap: 20px;
    overflow: visible;
  }

  .result-stage {
    height: auto;
    min-height: 100dvh;
    padding-top: 86px;
    overflow: visible;
  }

  .floating-input {
    top: 0;
    left: 0;
    right: 0;
    padding: calc(10px + env(safe-area-inset-top)) 12px 10px;
    background: rgba(245, 245, 247, 0.92);
    border-bottom: 1px solid rgba(23, 32, 38, 0.08);
    backdrop-filter: blur(16px);
  }

  h1 {
    max-width: 11ch;
    font-size: 38px;
    line-height: 1;
  }

  .intro-copy {
    font-size: 15px;
    line-height: 1.55;
  }
}

@media (max-width: 380px) {
  .parse-stage {
    padding-right: 12px;
    padding-left: 12px;
  }

  .parse-panel {
    padding: 24px 14px;
  }

  h1 {
    font-size: 34px;
  }
}
</style>
