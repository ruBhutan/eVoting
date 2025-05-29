import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { logger } from '../utils/logger.js';

const router = Router();

const {
  APP_ID,
  APP_SECRET,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN
} = process.env;

const apiLimiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many login attempts, please try again later',
});

const generateAccessToken = (appId) => {
  return jwt.sign({ appId }, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
};

const generateRefreshToken = (appId) => {
  return jwt.sign({ appId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
};

router.post('/token', (req, res) => {
  const { appId, appSecret } = req.body;

  if (!appId || !appSecret) {
    logger.warn('Missing credentials in token request');
    return res.status(400).json({ error: 'Missing credentials' });
  }

  if (appId !== APP_ID || appSecret !== APP_SECRET) {
    logger.warn('Invalid credentials provided');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = generateAccessToken(appId);
  const refreshToken = generateRefreshToken(appId);

  logger.info('Access token issued successfully');
  res.json({
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_EXPIRES_IN
  });
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    logger.warn('Refresh token not provided');
    return res.status(400).json({ error: 'Refresh token required' });
  }

  jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) {
      logger.warn(`Invalid refresh token: ${err.message}`);
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(decoded.appId);
    logger.info('Access token refreshed successfully');
    res.json({
      access_token: newAccessToken,
      expires_in: REFRESH_TOKEN_EXPIRES_IN
    });
  });
});

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    logger.warn(`Missing token for ${req.method} ${req.url}`);
    return res.status(401).json({ error: 'Authorization token required' });
  }

  jwt.verify(token, JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      logger.warn(`Invalid token on ${req.method} ${req.url}: ${err.message}`);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

export default router;
