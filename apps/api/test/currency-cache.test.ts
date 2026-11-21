import { afterEach, describe, expect, it, vi } from 'vitest';
import { getExchangeRates, resetExchangeRatesCache } from '../src/services/currency.service.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetExchangeRatesCache();
});

const ok = (rates: unknown) =>
  Promise.resolve(new Response(JSON.stringify({ rates }), { status: 200 }));

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolveResponse) => {
    resolve = resolveResponse;
  });
  return { promise, resolve };
}

describe('exchange rates cache', () => {
  it('fetches once an hour and passes a timeout signal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = vi.fn(() => ok({ USD: 1, EUR: 0.9 }));
    vi.stubGlobal('fetch', fetch);

    expect(await getExchangeRates()).toEqual({ USD: 1, EUR: 0.9 });
    await getExchangeRates();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal);

    vi.setSystemTime(Date.now() + 61 * 60_000);
    await getExchangeRates();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    const fetch = vi.fn(() => ok({ USD: 1 }));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([getExchangeRates(), getExchangeRates(), getExchangeRates()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaults, then the last good rates, and retries after five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const fetch = vi.fn((): Promise<Response> => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetch);

    const fallback = await getExchangeRates();
    expect(fallback.USD).toBe(1);
    expect(fallback.KES).toBeGreaterThan(0);
    await getExchangeRates();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
    fetch.mockImplementationOnce(() => ok({ USD: 1, KES: 129 }));
    expect((await getExchangeRates()).KES).toBe(129);

    // A failure after a good answer keeps that answer
    vi.setSystemTime(Date.now() + 61 * 60_000);
    expect((await getExchangeRates()).KES).toBe(129);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['an empty map', {}],
    ['an array', [{ USD: 1 }]],
    ['a missing USD rate', { EUR: 0.8 }],
    ['a wrong USD rate', { USD: 2 }],
    ['a string rate', { USD: 1, EUR: '0.8' }],
    ['a zero rate', { USD: 1, EUR: 0 }],
    ['a negative rate', { USD: 1, EUR: -1 }],
  ])('keeps the last good rates after receiving %s', async (_label, invalid) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const good = { USD: 1, EUR: 0.9 };
    const fetch = vi.fn()
      .mockImplementationOnce(() => ok(good))
      .mockImplementationOnce(() => ok(invalid))
      .mockImplementation(() => ok({ USD: 1, EUR: 0.8 }));
    vi.stubGlobal('fetch', fetch);

    expect(await getExchangeRates()).toEqual(good);
    vi.setSystemTime(Date.now() + 60 * 60_000);
    expect(await getExchangeRates()).toEqual(good);
    vi.setSystemTime(Date.now() + 5 * 60_000 - 1);
    expect(await getExchangeRates()).toEqual(good);
    vi.setSystemTime(Date.now() + 1);
    expect(await getExchangeRates()).toEqual({ USD: 1, EUR: 0.8 });
  });

  it('serves fallback rates on timeout and retries successfully after five minutes', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    const fetch = vi.fn()
      .mockImplementationOnce((_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      )
      .mockImplementation(() => ok({ USD: 1, EUR: 0.8 }));
    vi.stubGlobal('fetch', fetch);

    const result = getExchangeRates();
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await result).EUR).toBe(0.92);
    vi.setSystemTime(Date.now() + 5 * 60_000 - 1);
    expect((await getExchangeRates()).EUR).toBe(0.92);
    vi.setSystemTime(Date.now() + 1);
    expect((await getExchangeRates()).EUR).toBe(0.8);
  });

  it('isolates an outstanding fetch from the cache and request started after a reset', async () => {
    const oldResponse = deferredResponse();
    const newResponse = deferredResponse();
    const fetch = vi.fn()
      .mockReturnValueOnce(oldResponse.promise)
      .mockReturnValueOnce(newResponse.promise);
    vi.stubGlobal('fetch', fetch);

    const oldRequest = getExchangeRates();
    resetExchangeRatesCache();
    const newRequest = getExchangeRates();

    const oldRates = { USD: 1, EUR: 0.9 };
    oldResponse.resolve(await ok(oldRates));
    expect(await oldRequest).toEqual(oldRates);
    const joinedRequest = getExchangeRates();

    const newRates = { USD: 1, EUR: 0.8 };
    newResponse.resolve(await ok(newRates));
    expect(await newRequest).toEqual(newRates);
    expect(await joinedRequest).toEqual(newRates);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
