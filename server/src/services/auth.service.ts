import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { env } from '../config/env';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  deviceName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  deviceName?: string;
  deviceType?: string;
}

const generateTokens = (userId: string, email: string, deviceId: string) => {
  const accessToken = jwt.sign(
    { userId, email, deviceId },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { userId, deviceId },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
};

export const registerUser = async (input: RegisterInput) => {
  const { email, password, name, deviceName } = input;

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) throw new Error('Email already registered');

  const passwordHash = await bcrypt.hash(password, 12);
  const userResult = await query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
    [email, passwordHash, name]
  );
  const user = userResult.rows[0];

  const deviceResult = await query(
    'INSERT INTO devices (user_id, device_name, device_type) VALUES ($1, $2, $3) RETURNING id',
    [user.id, deviceName || 'Web Browser', 'web']
  );
  const deviceId = deviceResult.rows[0].id;

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, deviceId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, device_id, token, expires_at) VALUES ($1, $2, $3, $4)',
    [user.id, deviceId, refreshToken, expiresAt]
  );

  return { user, accessToken, refreshToken, deviceId };
};

export const loginUser = async (input: LoginInput) => {
  const { email, password, deviceName, deviceType } = input;

  const userResult = await query(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [email]
  );
  if (userResult.rows.length === 0) throw new Error('Invalid credentials');
  const user = userResult.rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  const deviceResult = await query(
    'INSERT INTO devices (user_id, device_name, device_type) VALUES ($1, $2, $3) RETURNING id',
    [user.id, deviceName || 'Web Browser', deviceType || 'web']
  );
  const deviceId = deviceResult.rows[0].id;

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, deviceId);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, device_id, token, expires_at) VALUES ($1, $2, $3, $4)',
    [user.id, deviceId, refreshToken, expiresAt]
  );

  // Update last_seen
  await query('UPDATE devices SET last_seen = NOW() WHERE id = $1', [deviceId]);

  const { password_hash: _, ...safeUser } = user;
  return { user: safeUser, accessToken, refreshToken, deviceId };
};

export const refreshAccessToken = async (refreshToken: string) => {
  let payload: { userId: string; deviceId: string };
  try {
    payload = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as {
      userId: string;
      deviceId: string;
    };
  } catch {
    throw new Error('Invalid refresh token');
  }

  const tokenResult = await query(
    'SELECT id FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
    [refreshToken, payload.userId]
  );
  if (tokenResult.rows.length === 0) throw new Error('Refresh token expired or not found');

  const userResult = await query('SELECT id, email FROM users WHERE id = $1', [payload.userId]);
  const user = userResult.rows[0];

  const { accessToken } = generateTokens(user.id, user.email, payload.deviceId);
  return { accessToken };
};

export const getDevices = async (userId: string) => {
  const result = await query(
    'SELECT id, device_name, device_type, last_seen, created_at FROM devices WHERE user_id = $1 ORDER BY last_seen DESC',
    [userId]
  );
  return result.rows;
};
