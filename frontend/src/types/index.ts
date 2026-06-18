export interface UrlItem {
  url_list: string[]
  width?: number
  height?: number
  data_size?: number
  file_hash?: string
  uri?: string
  url_key?: string
  file_cs?: string
}

export interface BitRateItem {
  FPS?: number
  HDR_bit?: string
  HDR_type?: string
  bit_rate?: number
  format?: string
  gear_name?: string
  is_bytevc1?: number
  is_h265?: number
  play_addr?: UrlItem
  quality_type?: number
  video_extra?: string
}

export interface BigThumbItem {
  duration?: number
  fext?: string
  img_num?: number
  img_url?: string
  img_urls?: string[]
  img_x_len?: number
  img_x_size?: number
  img_y_len?: number
  img_y_size?: number
  interval?: number
  uri?: string
  uris?: string[]
}

export interface SeriesInfo {
  content_sub_type?: number
  cover_url?: UrlItem
  create_time?: number
  dark_icon_url?: UrlItem
  light_icon_url?: UrlItem
  desc?: string
  extra?: string
  real_name?: string
  series_name?: string
  series_type?: number
  status?: {
    is_collected?: number
    status?: number
    status_desc?: string
  }
  update_time?: number
}

export interface VideoTag {
  level?: number
  tag_id?: number
  tag_name?: string
}

export interface GameTagInfo {
  content_type_tag?: {
    tag_id?: number
    tag_name?: string
  }
  game_name_tag?: {
    game_id_list?: number[]
    tag_id?: number
    tag_name?: string
  }
  is_game?: boolean
}

export interface AwemeDetail {
  aweme_id: string
  desc: string
  create_time: number
  duration?: number
  author: {
    nickname: string
    unique_id?: string
    short_id?: string
    signature?: string
    avatar_thumb?: UrlItem
    total_favorited?: number
    favoriting_count?: number
    user_age?: number
    uid?: string
    cover_url?: UrlItem[]
  }
  statistics?: {
    collect_count?: number
    comment_count?: number
    digg_count?: number
    play_count?: number
    share_count?: number
    download_count?: number
    forward_count?: number
  }
  text_extra?: Array<{
    hashtag_name?: string
    hashtag_id?: string
    type?: number
    start?: number
    end?: number
    caption_start?: number
    caption_end?: number
    is_commerce?: boolean
  }>
  music?: {
    title?: string
    author?: string
    duration?: number
    play_url?: UrlItem
  }
  video: {
    play_addr: UrlItem
    play_addr_265?: UrlItem
    play_addr_h264?: UrlItem
    download_addr?: UrlItem
    dynamic_cover?: UrlItem
    origin_cover?: UrlItem
    cover?: UrlItem
    cover_original_scale?: UrlItem
    duration: number
    width?: number
    height?: number
    ratio?: string
    format?: string
    has_watermark?: boolean
    is_long_video?: number
    is_source_HDR?: number
    is_h265?: number
    meta?: string
    cdn_url_expired?: number
    big_thumbs?: BigThumbItem[]
    bit_rate?: BitRateItem[]
  }
  share_info?: {
    share_url?: string
    share_title?: string
    share_desc?: string
  }
  share_url?: string
  video_control?: {
    allow_download?: boolean
    show_watermark?: boolean
    allow_share?: boolean
    allow_comment?: boolean
  }
  series_info?: SeriesInfo
  video_tag?: VideoTag[]
  game_tag_info?: GameTagInfo
  item_title?: string
  preview_title?: string
  caption?: string
  group_id?: string
  media_type?: number
  comment_gid?: number
  cover?: string
}
