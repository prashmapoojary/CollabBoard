import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DEFAULT_EXPIRY = '7d';
const REFRESH_TOKEN_LONG_EXPIRY = '30d';

const REFRESH_COOKIE_DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const REFRESH_COOKIE_LONG_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

export const generateAccessToken = (userId) => {
  const secret = process.env.JWT_SECRET || 'dev_jwt_access_secret_fallback';
  return jwt.sign({ userId }, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

export const generateRefreshToken = (userId, keepSignedIn = false) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_fallback';
  const expiresIn = keepSignedIn ? REFRESH_TOKEN_LONG_EXPIRY : REFRESH_TOKEN_DEFAULT_EXPIRY;
  return jwt.sign({ userId, keepSignedIn: Boolean(keepSignedIn) }, secret, { expiresIn });
};

export const verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET || 'dev_jwt_access_secret_fallback';
  return jwt.verify(token, secret);
};

export const verifyRefreshToken = (token) => {
  const secret = process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_fallback';
  return jwt.verify(token, secret);
};

export const setRefreshTokenCookie = (res, refreshToken, keepSignedIn = false) => {
  const maxAge = keepSignedIn ? REFRESH_COOKIE_LONG_MAX_AGE : REFRESH_COOKIE_DEFAULT_MAX_AGE;
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
};

export const clearRefreshTokenCookie = (res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
};
