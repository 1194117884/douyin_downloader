import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import { USER_AGENTS } from './ua';

const validAwemeDetail = {
  aweme_id: '7425930648738942775',
  desc: 'test video',
  create_time: 123,
  author: { nickname: 'Tester' },
  video: {
    duration: 30,
    play_addr: { url_list: ['https://example.com/video.mp4'] },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function mockShareHtml(overrides = '', playUrl = 'https:\\/\\/example.com\\/playwm\\/video.mp4'): string {
  return `
    <html>
      <script>
        {"desc":"愿奶奶长命百岁","nickname":"想想","duration":10146,
        "digg_count":198965,"comment_count":117197,"share_count":3989,"play_count":0,
        "play_addr":{"url_list":["${playUrl}"]},
        "download_addr":{"url_list":["https:\\/\\/example.com\\/download.mp4"]},
        "cover":{"url_list":["https:\\/\\/example.com\\/cover.jpg"]}}
        ${overrides}
      </script>
    </html>
  `;
}

describe('Douyin Proxy Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('Fetch path fallback', () => {
    it('returns Path 1 web detail when the main Douyin API has a playable address', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ aweme_detail: validAwemeDetail })
      );

      const response = await worker.fetch(new Request('http://localhost/?aweme_id=7425930648738942775'));

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = await readJson<{ aweme_detail: typeof validAwemeDetail, source: string }>(response);
      expect(body).toEqual({
        aweme_detail: validAwemeDetail,
        source: 'web_detail',
      });
    });

    it('requests the existing web detail endpoint first', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ aweme_detail: validAwemeDetail })
      );

      await worker.fetch(new Request('http://localhost/?aweme_id=12345'));

      const [calledUrl] = fetchSpy.mock.calls[0];
      const url = calledUrl instanceof Request ? calledUrl.url : calledUrl;
      expect(url).toContain('www-hj.douyin.com/aweme/v1/web/aweme/detail/');
      expect(url).toContain('aweme_id=12345');
    });

    it('falls back to Path 2 share HTML when Path 1 is blocked', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ error: 'forbidden' }, 403))
        .mockResolvedValueOnce(htmlResponse(mockShareHtml()));

      const response = await worker.fetch(new Request('http://localhost/?aweme_id=7651611849724892019'));

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const body = await readJson<{
        source: string;
        aweme_detail: {
          video: {
            duration: number;
            play_addr: { url_list: string[] };
            download_addr: { url_list: string[] };
          };
        };
      }>(response);
      expect(body.source).toBe('share_html');
      expect(body.aweme_detail).toMatchObject({
        aweme_id: '7651611849724892019',
        desc: '愿奶奶长命百岁',
        author: { nickname: '想想' },
        statistics: {
          digg_count: 198965,
          comment_count: 117197,
          share_count: 3989,
          play_count: 0,
        },
      });
      expect(body.aweme_detail.video.duration).toBe(10.146);
      expect(body.aweme_detail.video.play_addr.url_list).toEqual(['https://example.com/play/video.mp4']);
      expect(body.aweme_detail.video.download_addr.url_list).toEqual(['https://example.com/download.mp4']);
    });

    it('returns 502 after all paths fail and exposes attempts only in debug mode', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ error: 'blocked' }, 403))
        .mockResolvedValueOnce(htmlResponse('<html>captcha</html>', 200))
        .mockResolvedValueOnce(htmlResponse('<html>note captcha</html>', 200));

      const response = await worker.fetch(new Request('http://localhost/?aweme_id=123&debug=1'));

      expect(response.status).toBe(502);
      const body = await readJson<{
        error: string;
        attempts: Array<{ source: string; ok: boolean; status?: number }>;
      }>(response);
      expect(body.error).toBe('All Douyin fetch paths failed');
      expect(body.attempts).toHaveLength(2);
      expect(body.attempts.map((attempt: { source: string }) => attempt.source)).toEqual([
        'web_detail',
        'share_html',
      ]);
      expect(body.attempts[0].status).toBe(403);
      expect(body.attempts.every((attempt: { ok: boolean }) => attempt.ok === false)).toBe(true);
    });

    it('omits attempts from failed responses unless debug=1 is set', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS failure'));

      const response = await worker.fetch(new Request('http://localhost/?aweme_id=123'));

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: 'All Douyin fetch paths failed' });
    });
  });

  describe('Short-link resolution', () => {
    it('follows redirect and extracts aweme_id from a v.douyin.com short link', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        url: 'https://www.iesdouyin.com/share/video/7651487458273602789/?region=CN',
      } as Response);

      const response = await worker.fetch(
        new Request('http://localhost/?resolve_url=https%3A%2F%2Fv.douyin.com%2Fabc%2F')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ aweme_id: '7651487458273602789' });
    });

    it('extracts aweme_id when a short link redirects to a note page', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        url: 'https://www.iesdouyin.com/share/note/7651537839684126329/?region=CN',
      } as Response);

      const response = await worker.fetch(
        new Request('http://localhost/?resolve_url=https%3A%2F%2Fv.douyin.com%2FOnZ96B_7d5M%2F')
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ aweme_id: '7651537839684126329' });
    });
  });

  describe('Download proxy', () => {
    it('streams allowed video URLs with mobile headers and attachment disposition', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          capturedHeaders = opts?.headers as Record<string, string> | undefined;
          return new Response('video-bytes', {
            status: 200,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Length': '11',
            },
          });
        }
      );

      const response = await worker.fetch(
        new Request('http://localhost/api/download?url=https%3A%2F%2Faweme.snssdk.com%2Faweme%2Fv1%2Fplay%2F%3Fvideo_id%3Dabc&filename=test.mp4')
      );

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(capturedHeaders?.Referer).toBe('https://www.douyin.com/');
      expect(capturedHeaders?.['User-Agent']).toContain('Android 12');
      expect(response.headers.get('Content-Disposition')).toContain('filename="test.mp4"');
      expect(response.headers.get('Content-Disposition')).toContain("filename*=UTF-8''test.mp4");
      expect(response.headers.get('Content-Type')).toBe('video/mp4');
      expect(await response.text()).toBe('video-bytes');
    });

    it('forwards Range headers to the upstream video URL', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          capturedHeaders = opts?.headers as Record<string, string> | undefined;
          return new Response('partial', {
            status: 206,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Range': 'bytes 0-6/100',
            },
          });
        }
      );

      const response = await worker.fetch(
        new Request('http://localhost/api/download?url=https%3A%2F%2Fv9-cold.douyinvod.com%2Fvideo.mp4', {
          headers: { Range: 'bytes=0-6' },
        })
      );

      expect(response.status).toBe(206);
      expect(capturedHeaders?.Range).toBe('bytes=0-6');
      expect(response.headers.get('Content-Range')).toBe('bytes 0-6/100');
    });

    it('rejects non-Douyin download URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const response = await worker.fetch(
        new Request('http://localhost/api/download?url=https%3A%2F%2Fexample.com%2Fvideo.mp4')
      );

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({ error: 'Download URL is not allowed' });
    });
  });

  describe('Direct download', () => {
    it('accepts messy share text and returns the video stream', async () => {
      let downloadHeaders: Record<string, string> | undefined;
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          url: 'https://www.iesdouyin.com/share/video/7651611849724892019/?region=CN',
        } as Response)
        .mockResolvedValueOnce(jsonResponse({ error: 'blocked' }, 403))
        .mockResolvedValueOnce(htmlResponse(mockShareHtml('', 'https:\\/\\/aweme.snssdk.com\\/aweme\\/v1\\/play\\/?video_id=abc')))
        .mockImplementationOnce(async (_url: string | URL | Request, opts?: RequestInit) => {
          downloadHeaders = opts?.headers as Record<string, string> | undefined;
          return new Response('video-bytes', {
            status: 200,
            headers: { 'Content-Type': 'video/mp4' },
          });
        });

      const input = '7.97 复制打开抖音 https://v.douyin.com/39WEltKtUcw/ N@w.Fu';
      const response = await worker.fetch(
        new Request(`http://localhost/api/direct-download?input=${encodeURIComponent(input)}`)
      );

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      expect(downloadHeaders?.Referer).toBe('https://www.douyin.com/');
      expect(response.headers.get('Content-Disposition')).toContain('7651611849724892019-');
      expect(response.headers.get('Content-Type')).toBe('video/mp4');
      expect(await response.text()).toBe('video-bytes');
    });

    it('accepts POST JSON input and forwards Range to the selected video URL', async () => {
      let downloadHeaders: Record<string, string> | undefined;
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(jsonResponse({
          aweme_detail: {
            ...validAwemeDetail,
            video: {
              ...validAwemeDetail.video,
              play_addr: { url_list: ['https://aweme.snssdk.com/aweme/v1/play/?video_id=abc'] },
            },
          },
        }))
        .mockImplementationOnce(async (_url: string | URL | Request, opts?: RequestInit) => {
          downloadHeaders = opts?.headers as Record<string, string> | undefined;
          return new Response('partial', {
            status: 206,
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Range': 'bytes 0-6/100',
            },
          });
        });

      const response = await worker.fetch(
        new Request('http://localhost/api/direct-download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Range': 'bytes=0-6',
          },
          body: JSON.stringify({ input: '7425930648738942775' }),
        })
      );

      expect(response.status).toBe(206);
      expect(downloadHeaders?.Range).toBe('bytes=0-6');
      expect(response.headers.get('Content-Range')).toBe('bytes 0-6/100');
      expect(await response.text()).toBe('partial');
    });

    it('returns 400 when direct download input cannot be parsed', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const response = await worker.fetch(
        new Request('http://localhost/api/direct-download?input=not-a-douyin-link')
      );

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({ error: 'Could not extract video ID from input' });
    });
  });

  describe('Request guards and headers', () => {
    it('returns 400 when no query parameters are provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const response = await worker.fetch(new Request('http://localhost/'));

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when aweme_id is empty or whitespace', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const emptyResponse = await worker.fetch(new Request('http://localhost/?aweme_id='));
      const whitespaceResponse = await worker.fetch(new Request('http://localhost/?aweme_id=%20%20'));

      expect(emptyResponse.status).toBe(400);
      expect(whitespaceResponse.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('includes CORS headers on success and errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ aweme_detail: validAwemeDetail })
      );

      const success = await worker.fetch(new Request('http://localhost/?aweme_id=123'));
      const error = await worker.fetch(new Request('http://localhost/'));

      expect(success.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(error.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('returns 204 for CORS preflight requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const response = await worker.fetch(new Request('http://localhost/', { method: 'OPTIONS' }));

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends a User-Agent header from the configured pool', async () => {
      let capturedUA: string | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          const headers = opts?.headers as Record<string, string> | undefined;
          capturedUA = headers?.['User-Agent'] ?? headers?.['user-agent'];
          return jsonResponse({ aweme_detail: validAwemeDetail });
        }
      );

      await worker.fetch(new Request('http://localhost/?aweme_id=123'));

      expect(capturedUA).toBeDefined();
      expect(USER_AGENTS).toContain(capturedUA);
    });

    it('passes an AbortSignal timeout to upstream fetches', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          capturedSignal = opts?.signal ?? undefined;
          return jsonResponse({ aweme_detail: validAwemeDetail });
        }
      );

      await worker.fetch(new Request('http://localhost/?aweme_id=123'));

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });
  });
});
