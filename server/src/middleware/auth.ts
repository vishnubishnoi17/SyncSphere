import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
  deviceId?: string;
  email?: string;
}

interface JwtPayload {
  userId: string;
  deviceId?: string;
  email: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
    req.userId = payload.userId;
    req.deviceId = payload.deviceId;
    req.email = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
      req.userId = payload.userId;
      req.deviceId = payload.deviceId;
      req.email = payload.email;
    } catch {
      // ignore — optional
    }
  }
  next();
};
