import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

const router = Router();

// Environment variables
const {
  APP_ID,
  APP_SECRET,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN = '15m',
  REFRESH_TOKEN_EXPIRES_IN = '7d'
} = process.env;

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later',
});

// Token generation functions
const generateAccessToken = (appId) => {
  return jwt.sign({ appId }, JWT_ACCESS_SECRET, { 
    expiresIn: ACCESS_TOKEN_EXPIRES_IN 
  });
};

const generateRefreshToken = (appId) => {
  return jwt.sign({ appId }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN
  });
};

// Auth routes
router.post('/token', authLimiter, (req, res) => {
  const { appId, appSecret } = req.body;

  if (!appId || !appSecret) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  if (appId !== APP_ID || appSecret !== APP_SECRET) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const accessToken = generateAccessToken(appId);
  const refreshToken = generateRefreshToken(appId);

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900
  });
});

router.post('/refresh', authLimiter, (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }
    
    const newAccessToken = generateAccessToken(decoded.appId);
    res.json({
      access_token: newAccessToken,
      expires_in: 900
    });
  });
});

// Authentication middleware
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

export default router;