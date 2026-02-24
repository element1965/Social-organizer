const GEO_API_URL = 'http://ip-api.com/json/';

// ip-api.com: free tier allows 45 requests/min
// Fields: countryCode is ISO 3166-1 alpha-2

export async function getCountryByIP(ip: string): Promise<string | null> {
  // Skip private/local IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip === 'localhost'
  ) {
    return null;
  }

  try {
    const res = await fetch(`${GEO_API_URL}${ip}?fields=countryCode`, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { countryCode?: string };
    return data.countryCode || null;
  } catch {
    return null;
  }
}

export function getClientIP(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  // Check X-Forwarded-For header (common in proxied environments)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ipValue = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    if (ipValue) return ipValue.trim();
  }

  // Check X-Real-IP header (Nginx)
  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    const ipValue = Array.isArray(realIP) ? realIP[0] : realIP;
    if (ipValue) return ipValue;
  }

  // Fallback to request IP
  return req.ip || '127.0.0.1';
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceHint(km: number): string {
  if (km < 1) return '<1 km';
  if (km < 10) return `~${Math.round(km)} km`;
  if (km < 100) return `~${Math.round(km / 10) * 10} km`;
  return `~${Math.round(km / 100) * 100} km`;
}
