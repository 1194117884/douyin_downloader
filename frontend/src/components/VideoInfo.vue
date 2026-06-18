<template>
  <div class="video-info">
    <template v-if="videoData">
      <div class="detail-column">
        <!-- 1. Author row -->
        <div class="author-row">
          <img v-if="avatarUrl" class="avatar" :src="avatarUrl" alt="" />
          <div class="author-text">
            <p class="author">{{ authorName }}</p>
            <p class="handle">@{{ handle }}</p>
            <p v-if="authorSignature" class="signature" :class="{ expanded: sigExpanded }"
              @click="sigExpanded = !sigExpanded">
              {{ authorSignature }}
            </p>
            <div v-if="authorMeta.length" class="author-meta">
              <span v-for="m in authorMeta" :key="m">{{ m }}</span>
            </div>
          </div>
          <a v-if="shareUrl" class="share-link" :href="shareUrl" target="_blank" rel="noopener">
            Open original
          </a>
        </div>

        <!-- 2. Series / collection card -->
        <div v-if="videoData.series_info" class="series-card">
          <img v-if="seriesCoverUrl" class="series-cover" :src="seriesCoverUrl" alt="" />
          <div class="series-body">
            <div class="series-heading">
              <strong>{{ videoData.series_info.series_name || videoData.series_info.real_name || 'Collection'
              }}</strong>
              <span v-if="videoData.series_info.status?.status_desc" class="series-badge">
                {{ videoData.series_info.status.status_desc }}
              </span>
            </div>
            <small v-if="videoData.series_info.desc" class="series-desc">{{ videoData.series_info.desc }}</small>
          </div>
        </div>

        <!-- 3. Description -->
        <h2 class="desc">{{ cleanDesc || 'Untitled video' }}</h2>

        <!-- 4. Tags & meta -->
        <div class="tags-area">
          <div v-if="hashtags.length" class="hashtags" aria-label="hashtags">
            <span v-for="tag in hashtags" :key="tag">#{{ tag }}</span>
          </div>

          <div class="tags-info-row">
            <span class="tags-id" :class="{ copied }" :title="copied ? 'Copied!' : 'Click to copy'"
              @click="copyAwemeId">
              {{ videoData.aweme_id }}
              <span class="copy-icon" aria-hidden="true">{{ copied ? '✓' : '⎘' }}</span>
            </span>
            <span class="tags-date">{{ publishedLabel }}</span>
            ｜
            <span v-for="t in gameTags" :key="t" class="game-tag">{{ t }}</span>
            <span v-for="t in categoryTags" :key="t" class="category-tag">{{ t }}</span>
            <span v-for="flag in videoFlags" :key="flag" class="tags-flag">{{ flag }}</span>
          </div>

        </div>

        <!-- 5. Stats -->
        <dl class="stats-grid">
          <div v-for="stat in stats" :key="stat.label">
            <dt>{{ stat.label }}</dt>
            <dd>{{ stat.value }}</dd>
          </div>
        </dl>

        <!-- 6. Address switcher -->
        <div v-if="addressOptions.length" class="address-switcher">
          <div class="section-heading">
            <span>Video address</span>
            <strong>{{ addressOptions.length }} available</strong>
          </div>
          <div class="address-list">
            <div v-for="(option, index) in addressOptions" :key="option.url" class="address-option"
              :class="{ active: option.url === activeUrl }">
              <button type="button" class="option-select" @click="emit('select-url', option.url)">
                <span class="option-index">{{ index + 1 }}</span>
                <span class="option-body">
                  <strong>{{ option.source }}</strong>
                  <small>{{ option.label }}</small>
                  <small v-if="optionMeta(option)" class="option-meta-line">{{ optionMeta(option) }}</small>
                </span>
              </button>
              <a class="option-download" :href="option.url" :title="`${option.source}`" @click.stop>
                <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AwemeDetail } from '../types'
import type { VideoAddressOption } from '../composables/useDouyin'

const props = withDefaults(defineProps<{
  videoData: AwemeDetail | null
  addressOptions?: VideoAddressOption[]
  selectedUrl?: string
}>(), {
  addressOptions: () => [],
  selectedUrl: '',
})

const emit = defineEmits<{
  'select-url': [url: string]
}>()

const sigExpanded = ref(false)
const copied = ref(false)

async function copyAwemeId(): Promise<void> {
  if (!props.videoData?.aweme_id) return
  try {
    await navigator.clipboard.writeText(props.videoData.aweme_id)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* clipboard unavailable */ }
}

const activeUrl = computed(() => {
  return props.selectedUrl || props.addressOptions[0]?.url || ''
})

// ── Author ──────────────────────────────────────────

const avatarUrl = computed(() => {
  return props.videoData?.author?.avatar_thumb?.url_list?.[0] || ''
})

const authorName = computed(() => {
  return props.videoData?.author?.nickname || 'Unknown author'
})

const handle = computed(() => {
  return props.videoData?.author?.unique_id || props.videoData?.author?.short_id || 'unknown'
})

const authorSignature = computed(() => {
  return props.videoData?.author?.signature || ''
})

const authorMeta = computed(() => {
  const parts: string[] = []
  const a = props.videoData?.author
  if (a?.total_favorited) {
    parts.push(`♥ ${compactNumber(a.total_favorited)} total likes`)
  }
  if (a?.favoriting_count) {
    parts.push(`Liked ${compactNumber(a.favoriting_count)}`)
  }
  if (a?.user_age) {
    parts.push(`${a.user_age} yrs`)
  }
  return parts
})

// ── Series ──────────────────────────────────────────

const seriesCoverUrl = computed(() => {
  return props.videoData?.series_info?.cover_url?.url_list?.[0] || ''
})

// ── Tags ────────────────────────────────────────────

const hashtags = computed(() => {
  const seen = new Set<string>()
  return (props.videoData?.text_extra || [])
    .map((item) => item.hashtag_name?.trim())
    .filter((tag): tag is string => Boolean(tag && !seen.has(tag) && seen.add(tag)))
})

const cleanDesc = computed(() => {
  let text = props.videoData?.desc || ''
  if (!text) return ''
  const extras = props.videoData?.text_extra || []
  for (const item of extras) {
    if (item.hashtag_name) {
      // Escape special regex chars in the tag name
      const escaped = item.hashtag_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      text = text.replace(new RegExp(`#${escaped}`, 'g'), '')
    }
  }
  return text.replace(/\s+/g, ' ').trim()
})

const categoryTags = computed(() => {
  return (props.videoData?.video_tag || [])
    .filter((t) => t.tag_name)
    .sort((a, b) => (a.level || 0) - (b.level || 0))
    .map((t) => t.tag_name as string)
})

const gameTags = computed(() => {
  const parts: string[] = []
  const g = props.videoData?.game_tag_info
  if (g?.content_type_tag?.tag_name) parts.push(g.content_type_tag.tag_name)
  if (g?.game_name_tag?.tag_name) parts.push(g.game_name_tag.tag_name)
  return parts
})

// ── Stats ───────────────────────────────────────────

const stats = computed(() => {
  const source = props.videoData?.statistics || {}
  return [
    { label: 'Likes', value: compactNumber(source.digg_count) },
    { label: 'Comments', value: compactNumber(source.comment_count) },
    { label: 'Shares', value: compactNumber(source.share_count) },
    { label: 'Saves', value: compactNumber(source.collect_count) },
  ]
})

// ── Meta ────────────────────────────────────────────

const publishedLabel = computed(() => {
  const createdAt = props.videoData?.create_time
  if (!createdAt) return 'Unknown'
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(createdAt * 1000))
})

const videoFlags = computed(() => {
  const v = props.videoData?.video
  const flags: string[] = []
  if (v?.is_long_video) flags.push('Long video')
  if (v?.has_watermark) flags.push('Watermark')
  if (v?.play_addr_265) flags.push('H.265')
  if (v?.is_source_HDR) flags.push('HDR source')
  return flags
})

const shareUrl = computed(() => {
  return props.videoData?.share_info?.share_url || props.videoData?.share_url || ''
})

// ── Address meta ────────────────────────────────────

function optionMeta(opt: VideoAddressOption): string {
  const parts: string[] = []
  if (opt.definition) parts.push(opt.definition)
  if (opt.codec) parts.push(opt.codec)
  if (opt.fps) parts.push(`${opt.fps}fps`)
  if (opt.bitrate) parts.push(formatBitrate(opt.bitrate))
  if (opt.vmaf != null) parts.push(`VMAF ${opt.vmaf}`)
  if (opt.dataSize) parts.push(formatSize(opt.dataSize))
  return parts.join(' · ')
}

// ── Formatters ──────────────────────────────────────

function compactNumber(value?: number): string {
  if (typeof value !== 'number') return '0'
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  return `${Math.round(bps / 1000)} kbps`
}

</script>

<style scoped>
.video-info {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #fff;
}

.detail-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 34px 38px;
  overflow: auto;
  background: #fff;
}

/* ── Author ───────────────────────────── */

.author-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid #e8e8ec;
}

.author-text {
  flex: 1;
  min-width: 0;
}

.avatar {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
  background: #e8e8ec;
  flex-shrink: 0;
  margin-top: 2px;
}

.author {
  color: #161823;
  font-weight: 900;
}

.handle {
  margin-top: 2px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.signature {
  margin: 6px 0 0;
  color: #8a8b91;
  font-size: 13px;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  cursor: pointer;
  transition: -webkit-line-clamp 0s;
  user-select: none;
}

.signature.expanded {
  -webkit-line-clamp: unset;
  display: block;
}

.signature:hover {
  color: #8a8b91;
}

.author-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.author-meta span {
  padding: 3px 8px;
  border: 1px solid #e8e8ec;
  border-radius: 999px;
  color: #8a8b91;
  background: #ffffff;
  font-size: 11px;
  font-weight: 700;
}

.share-link {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 6px 12px;
  border: 1px solid rgba(254, 44, 85, 0.22);
  border-radius: 999px;
  color: #FE2C55;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.share-link:hover {
  background: #ffe8ec;
  box-shadow: 0 0 0 4px rgba(254, 44, 85, 0.06);
  transform: translateY(-1px);
}

/* ── Series card ──────────────────────── */

.series-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #e8e8ec;
  border-radius: 8px;
  background: #ffffff;
}

.series-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  background: #e8e8ec;
  flex-shrink: 0;
}

.series-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.series-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.series-heading strong {
  color: #161823;
  font-size: 14px;
  font-weight: 900;
}

.series-badge {
  padding: 2px 8px;
  border-radius: 999px;
  color: #FE2C55;
  background: #ffe8ec;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.series-desc {
  color: #8a8b91;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Description ──────────────────────── */

.desc {
  display: -webkit-box;
  overflow: hidden;
  color: #161823;
  font-size: clamp(24px, 2.6vw, 36px);
  line-height: 1.28;
  letter-spacing: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* ── Tags ─────────────────────────────── */

.tags-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hashtags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hashtags span {
  padding: 7px 10px;
  border-radius: 999px;
  color: #FE2C55;
  background: #ffe8ec;
  font-size: 13px;
  font-weight: 800;
}

.tags-info-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
}

.category-tag {
  padding: 4px 8px;
  border: 1px solid #e2e2e6;
  border-radius: 5px;
  color: #8a8b91;
  background: #f7f7f9;
  font-size: 12px;
  font-weight: 700;
}

.category-tag+.category-tag::before {
  content: '› ';
  color: #b0a9a0;
}

.game-tag {
  padding: 4px 8px;
  border: 1px solid #cfe3d4;
  border-radius: 5px;
  color: #2e7d52;
  background: #e8f5ec;
  font-size: 12px;
  font-weight: 700;
}

.tags-id {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px dashed #c5bfb5;
  border-radius: 5px;
  color: var(--ink);
  background: #ffffff;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  user-select: none;
  transition: border-color 160ms ease, background 160ms ease;
}

.tags-id:hover {
  border-color: var(--accent);
  background: #ffe8ec;
}

.tags-id.copied {
  border-color: #2e7d52;
  background: #e8f5ec;
}

.tags-id .copy-icon {
  opacity: 0;
  font-size: 11px;
  transition: opacity 120ms ease;
}

.tags-id:hover .copy-icon,
.tags-id.copied .copy-icon {
  opacity: 1;
}

.tags-date {
  padding: 4px 8px;
  border-radius: 5px;
  color: #8a8b91;
  font-size: 12px;
  font-weight: 700;
}

.tags-flag {
  padding: 3px 7px;
  border: 1px solid #e2e2e6;
  border-radius: 999px;
  color: #8a8b91;
  background: #f5f5f7;
  font-size: 11px;
  font-weight: 600;
}

/* ── Stats ──────────────────────────── */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.stats-grid div {
  min-width: 0;
  padding: 18px;
  border: 1px solid #e8e8ec;
  border-radius: 8px;
  background: #fafafa;
}

dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

dd {
  margin: 5px 0 0;
  color: #161823;
  font-size: 26px;
  font-weight: 900;
}

/* ── Address switcher ─────────────────── */

.address-switcher {
  display: grid;
  gap: 14px;
  min-height: 0;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading span {
  color: #161823;
  font-size: 14px;
  font-weight: 900;
}

.section-heading strong {
  color: var(--muted);
  font-size: 12px;
  font-weight: 900;
  text-transform: uppercase;
}

.address-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.address-option {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid #e8e8ec;
  border-radius: 8px;
  background: #fafafa;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.address-option:hover {
  border-color: rgba(254, 44, 85, 0.42);
  transform: translateY(-1px);
}

.address-option.active {
  border-color: rgba(254, 44, 85, 0.72);
  background: #ffe8ec;
  box-shadow: 0 0 0 4px rgba(254, 44, 85, 0.08);
}

.option-select {
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 0 10px 10px;
  border: 0;
  color: var(--ink);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.option-download {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  margin-right: 6px;
  border-radius: 6px;
  color: var(--accent);
  background: rgba(254, 44, 85, 0.06);
  cursor: pointer;
  font-size: 16px;
  font-weight: 900;
  flex-shrink: 0;
  text-decoration: none;
  transition:
    background 160ms ease,
    transform 160ms ease;
}

.option-download:hover {
  background: rgba(254, 44, 85, 0.14);
  transform: scale(1.08);
}

.option-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--accent);
  font-size: 12px;
  font-weight: 900;
}

.option-body {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.option-body strong,
.option-body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-body strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 900;
}

.option-body small {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.option-body .option-meta-line {
  color: #8a8b91;
  font-size: 11px;
  font-weight: 600;
  overflow: visible;
  text-overflow: unset;
  white-space: normal;
  word-break: break-word;
}

/* ── Responsive ────────────────────────── */

@media (max-width: 1180px) {
  .address-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .video-info {
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .detail-column {
    padding: 16px 14px calc(18px + env(safe-area-inset-bottom));
    gap: 14px;
    min-height: 0;
    overflow: visible;
  }

  .author-row {
    gap: 10px;
    padding-bottom: 12px;
  }

  .avatar {
    width: 42px;
    height: 42px;
  }

  .share-link {
    padding: 6px 10px;
    font-size: 11px;
  }

  .desc {
    font-size: 20px;
    -webkit-line-clamp: 3;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats-grid div {
    padding: 12px;
  }

  dt {
    font-size: 11px;
  }

  dd {
    font-size: 20px;
  }

  .address-list {
    grid-template-columns: 1fr;
  }

  .option-select {
    grid-template-columns: 28px 1fr;
    gap: 9px;
  }

  .option-index {
    width: 28px;
    height: 28px;
  }
}

@media (max-width: 480px) {
  .author-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .share-link {
    grid-column: 1 / -1;
    justify-self: start;
    margin-top: 0;
  }

  .series-card {
    padding: 12px;
  }

  .series-desc {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .hashtags,
  .tags-info-row {
    gap: 6px;
  }

  .hashtags span {
    padding: 6px 9px;
    font-size: 12px;
  }

  .tags-id {
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .copy-icon {
    flex-shrink: 0;
  }

  .stats-grid {
    gap: 8px;
  }

  .stats-grid div {
    padding: 10px;
  }

  .address-switcher {
    gap: 10px;
  }

  .section-heading {
    align-items: flex-start;
  }

  .address-option {
    gap: 4px;
  }

  .option-select {
    padding: 9px 0 9px 9px;
  }

  .option-download {
    width: 36px;
    height: 36px;
    margin-right: 5px;
  }
}

@media (max-width: 360px) {
  .detail-column {
    padding-right: 10px;
    padding-left: 10px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
