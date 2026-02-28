import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface GoogleUserData {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserData | null> {
  if (!GOOGLE_CLIENT_ID) {
    console.error('[Google] GOOGLE_CLIENT_ID not set');
    return null;
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0] || 'User',
      picture: payload.picture,
      email_verified: payload.email_verified ?? false,
    };
  } catch (err) {
    console.error('[Google] Token verification failed:', err);
    return null;
  }
}
