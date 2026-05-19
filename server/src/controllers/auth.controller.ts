import { Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { AuthRequest } from '../middleware/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  deviceName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().optional(),
  deviceType: z.string().optional(),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.registerUser(data);
    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      deviceId: result.deviceId,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Registration failed';
    res.status(400).json({ error: message });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.loginUser(data);
    res.json({
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      deviceId: result.deviceId,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    res.status(401).json({ error: 'Invalid credentials' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const devices = await authService.getDevices(req.userId!);
    res.json({ userId: req.userId, email: req.email, devices });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
};
