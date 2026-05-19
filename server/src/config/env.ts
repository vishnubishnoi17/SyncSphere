const DEFAULT_CLIENT_URL = 'http://localhost:5173';

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const optional = (key: string, fallback: string): string => process.env[key] || fallback;

const parseOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const assertProductionSecret = (key: string, value: string): void => {
  if (process.env.NODE_ENV !== 'production') return;

  const lower = value.toLowerCase();
  if (value.length < 32 || lower.includes('change') || lower.includes('secret')) {
    throw new Error(`${key} must be a strong production secret with at least 32 characters`);
  }
};

const jwtSecret = required('JWT_SECRET');
const refreshTokenSecret = required('REFRESH_TOKEN_SECRET');

assertProductionSecret('JWT_SECRET', jwtSecret);
assertProductionSecret('REFRESH_TOKEN_SECRET', refreshTokenSecret);

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: Number.parseInt(optional('PORT', '3001'), 10),
  DATABASE_URL: required('DATABASE_URL'),
  DATABASE_SSL: optional('DATABASE_SSL', process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '7d'),
  REFRESH_TOKEN_SECRET: refreshTokenSecret,
  REFRESH_TOKEN_EXPIRES_IN: optional('REFRESH_TOKEN_EXPIRES_IN', '30d'),
  CLIENT_URL: optional('CLIENT_URL', DEFAULT_CLIENT_URL),
  CLIENT_ORIGINS: parseOrigins(optional('CLIENT_ORIGINS', optional('CLIENT_URL', DEFAULT_CLIENT_URL))),
};
