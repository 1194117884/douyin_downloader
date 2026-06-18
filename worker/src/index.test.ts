import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import { USER_AGENTS } from './ua';

describe('Douyin Proxy Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy path', () => {
    it('should return 200 with raw Douyin JSON for a valid aweme_id', async () => {
      const mockResponseData = { aweme_detail: { aweme_id: '7425930648738942775', desc: 'test video' } };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponseData), { status: 200 })
      );

      const request = new Request('http://localhost/?aweme_id=7425930648738942775');
      const response = await worker.fetch(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(mockResponseData);
    });

    it('should forward upstream request to the correct Douyin API URL', async () => {
      const mockResponseData = { aweme_detail: { aweme_id: '12345' } };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponseData), { status: 200 })
      );

      const request = new Request('http://localhost/?aweme_id=12345');
      await worker.fetch(request);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchSpy.mock.calls[0];
      const url = calledUrl instanceof Request ? calledUrl.url : calledUrl;
      expect(url).toContain('www-hj.douyin.com/aweme/v1/web/aweme/detail/');
      expect(url).toContain('aweme_id=12345');
    });
  });

  describe('Missing aweme_id', () => {
    it('should return 400 when no query parameters are provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const request = new Request('http://localhost/');
      const response = await worker.fetch(request);

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return 400 when aweme_id is an empty string', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const request = new Request('http://localhost/?aweme_id=');
      const response = await worker.fetch(request);

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return 400 and not call upstream when aweme_id has only whitespace', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const request = new Request('http://localhost/?aweme_id=%20%20');
      const response = await worker.fetch(request);

      expect(response.status).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('CORS headers', () => {
    it('should include Access-Control-Allow-Origin: * on a successful response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 })
      );

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should include Access-Control-Allow-Origin: * on a 400 error response', async () => {
      const request = new Request('http://localhost/');
      const response = await worker.fetch(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should include Access-Control-Allow-Origin: * when upstream returns an error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      );

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should return 204 for CORS preflight requests', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const request = new Request('http://localhost/', { method: 'OPTIONS' });
      const response = await worker.fetch(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('User-Agent selection', () => {
    it('should have a non-empty User-Agent pool with valid entries', () => {
      expect(USER_AGENTS, 'UA pool should be defined').toBeDefined();
      expect(Array.isArray(USER_AGENTS), 'UA pool should be an array').toBe(true);
      expect(USER_AGENTS.length, 'UA pool should have at least one entry').toBeGreaterThan(0);
      USER_AGENTS.forEach((ua) => {
        expect(typeof ua, 'Each UA should be a string').toBe('string');
        expect(ua.length, 'Each UA should be non-empty').toBeGreaterThan(0);
      });
    });

    it('should send a User-Agent header from the pool on the upstream request', async () => {
      let capturedUA: string | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          const headers = opts?.headers as Record<string, string> | undefined;
          capturedUA = headers?.['User-Agent'] ?? headers?.['user-agent'];
          return new Response(JSON.stringify({}), { status: 200 });
        }
      );

      const request = new Request('http://localhost/?aweme_id=123');
      await worker.fetch(request);

      expect(capturedUA, 'A User-Agent should have been sent').toBeDefined();
      expect(USER_AGENTS, 'The UA should come from the pool').toContain(capturedUA);
    });

    it('should use different User-Agents across multiple requests (non-deterministic)', async () => {
      const usedUAs = new Set<string>();
      let callCount = 0;

      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          callCount++;
          const headers = opts?.headers as Record<string, string> | undefined;
          const ua = headers?.['User-Agent'] ?? headers?.['user-agent'];
          if (ua) usedUAs.add(ua);
          return new Response(JSON.stringify({}), { status: 200 });
        }
      );

      // Make enough calls to likely see diversity in UA selection
      for (let i = 0; i < 25; i++) {
        await worker.fetch(new Request(`http://localhost/?aweme_id=${i}`));
      }

      // With a pool of 2+ UAs and 25 calls, we should see at least 2 different ones
      // (probability very close to 1)
      expect(usedUAs.size, 'Expected multiple different UAs across 25 requests').toBeGreaterThan(1);
    });
  });

  describe('Pass-through behavior', () => {
    it('should not modify the upstream response body in any way', async () => {
      const mockData = {
        aweme_detail: {
          aweme_id: '123',
          desc: 'test content with Unicode ★♥✨',
          video: { width: 1080, height: 1920 },
        },
      };
      const mockBody = JSON.stringify(mockData);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(mockBody, { status: 200 })
      );

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      const responseText = await response.text();
      expect(responseText).toBe(mockBody);
    });

    it('should forward upstream error status code and body unchanged', async () => {
      const errorBody = { message: 'Rate limit exceeded', status_code: 429 };
      const errorText = JSON.stringify(errorBody);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(errorText, { status: 429, statusText: 'Too Many Requests' })
      );

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      expect(response.status).toBe(429);
      const responseText = await response.text();
      expect(responseText).toBe(errorText);
    });

    it('should preserve upstream content type for non-JSON responses', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>captcha</html>', {
          status: 403,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        })
      );

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toBe('<html>captcha</html>');
    });
  });

  describe('Error pass-through', () => {
    it.each([400, 403, 404, 410, 500, 502, 503])(
      'should forward HTTP %i from the upstream Douyin API',
      async (statusCode) => {
        const errorBody = { error: `upstream error ${statusCode}` };
        const errorText = JSON.stringify(errorBody);
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response(errorText, { status: statusCode })
        );

        const request = new Request('http://localhost/?aweme_id=123');
        const response = await worker.fetch(request);

        expect(response.status).toBe(statusCode);
        const responseText = await response.text();
        expect(responseText).toBe(errorText);
      }
    );

    it('should return a CORS-enabled 502 when upstream fetch throws', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS failure'));

      const request = new Request('http://localhost/?aweme_id=123');
      const response = await worker.fetch(request);

      expect(response.status).toBe(502);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(await response.json()).toEqual({ error: 'Upstream request failed' });
    });

    it('should pass an AbortSignal timeout to upstream fetch', async () => {
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (_url: string | URL | Request, opts?: RequestInit) => {
          capturedSignal = opts?.signal ?? undefined;
          return new Response(JSON.stringify({}), { status: 200 });
        }
      );

      const request = new Request('http://localhost/?aweme_id=123');
      await worker.fetch(request);

      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });
  });
});
