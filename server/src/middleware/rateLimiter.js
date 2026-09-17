import rateLimit from 'express-rate-limit';

// Standard auth limiter for signup, login, forgot-password
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 30, // Relaxed for automated test suites
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again later.',
  },
});

// Strict rate limiter for reset-password OTP brute-force protection
// Max 5 attempts per email (or IP fallback) per 15 minutes
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => {
    // Key by normalized email if present in body, otherwise fallback to IP
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : null;
    return email || req.ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: 'Too many password reset attempts for this email. Please wait 15 minutes before trying again.',
    });
  },
});
