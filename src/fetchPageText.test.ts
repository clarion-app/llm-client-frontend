import { describe, it, expect, vi } from 'vitest';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ text: 'page content' }),
});
vi.stubGlobal('fetch', mockFetch);

const { fetchPageText } = await import('./fetchPageText');

describe('fetchPageText - URL Validation', () => {
  it('rejects file:// scheme', async () => {
    await expect(fetchPageText('file:///etc/passwd')).rejects.toThrow(/scheme/i);
  });

  it('rejects javascript: scheme', async () => {
    await expect(fetchPageText('javascript:alert(1)')).rejects.toThrow(/scheme/i);
  });

  it('rejects data: scheme', async () => {
    await expect(fetchPageText('data:text/html,<script>alert(1)</script>')).rejects.toThrow(/scheme/i);
  });

  it('rejects localhost', async () => {
    await expect(fetchPageText('http://localhost/secret')).rejects.toThrow(/hostname/i);
  });

  it('rejects 127.0.0.1', async () => {
    await expect(fetchPageText('http://127.0.0.1/secret')).rejects.toThrow(/hostname/i);
  });

  it('rejects 10.x.x.x', async () => {
    await expect(fetchPageText('http://10.0.0.1/secret')).rejects.toThrow(/hostname/i);
  });

  it('rejects 192.168.x.x', async () => {
    await expect(fetchPageText('http://192.168.1.1/secret')).rejects.toThrow(/hostname/i);
  });

  it('rejects 169.254.x.x', async () => {
    await expect(fetchPageText('http://169.254.169.254/metadata')).rejects.toThrow(/hostname/i);
  });

  it('rejects 0.0.0.0', async () => {
    await expect(fetchPageText('http://0.0.0.0/secret')).rejects.toThrow(/hostname/i);
  });

  it('rejects [::1]', async () => {
    await expect(fetchPageText('http://[::1]/secret')).rejects.toThrow(/hostname/i);
  });

  it('allows valid https URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'page content' }),
    });
    const result = await fetchPageText('https://example.com/page');
    expect(result).toBe('page content');
  });
});
