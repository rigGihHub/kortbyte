import { createNeonAuth } from '@neondatabase/auth/next/server';

const baseUrl = process.env.NEON_AUTH_BASE_URL || 'http://127.0.0.1:9/auth-disabled';
const secret = process.env.NEON_AUTH_COOKIE_SECRET || 'kortbyte-demo-only-cookie-secret-32-chars';

export const auth = createNeonAuth({
  baseUrl,
  cookies: { secret },
});

export const hasLiveConfig = Boolean(
  process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET
);
