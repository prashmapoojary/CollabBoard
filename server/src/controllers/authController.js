import { User } from '../models/User.js';
import { PasswordResetOTP } from '../models/PasswordResetOTP.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../utils/token.js';
import { sendPasswordResetOTP } from '../services/emailService.js';
import { AppError } from '../middleware/errorHandler.js';

// POST /api/auth/signup
export const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return next(new AppError('An account with this email already exists.', 409));
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      avatarUrl: null,
      googleId: null,
    });

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), false);

    setRefreshTokenCookie(res, refreshToken, false);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const { email, password, keepSignedIn = false } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return next(new AppError('Invalid email or password.', 401));
    }

    if (!user.passwordHash) {
      return next(new AppError('Invalid email or password.', 401));
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return next(new AppError('Invalid email or password.', 401));
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString(), keepSignedIn);

    setRefreshTokenCookie(res, refreshToken, keepSignedIn);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user,
      accessToken,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/refresh
export const refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return next(new AppError('No refresh token provided. Please log in.', 401));
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      clearRefreshTokenCookie(res);
      return next(new AppError('Refresh token expired or invalid. Please log in again.', 401));
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      clearRefreshTokenCookie(res);
      return next(new AppError('User account not found.', 401));
    }

    const newAccessToken = generateAccessToken(user._id.toString());
    const newRefreshToken = generateRefreshToken(user._id.toString(), decoded.keepSignedIn);

    setRefreshTokenCookie(res, newRefreshToken, decoded.keepSignedIn);

    return res.status(200).json({
      success: true,
      user,
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/logout
export const logout = async (req, res, next) => {
  try {
    clearRefreshTokenCookie(res);
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
export const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Generate 6-digit numeric OTP
      const plainOTP = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await PasswordResetOTP.hashOTP(plainOTP);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Remove any existing active OTPs for this user to avoid stale codes
      await PasswordResetOTP.deleteMany({ userId: user._id });

      // Create new OTP record
      await PasswordResetOTP.create({
        userId: user._id,
        otpHash,
        expiresAt,
        used: false,
      });

      // Dispatch OTP email
      let previewUrl = null;
      try {
        const mailResult = await sendPasswordResetOTP(user.email, plainOTP);
        previewUrl = mailResult?.previewUrl || null;
      } catch (mailErr) {
        console.error('[Email Warning] Could not dispatch email:', mailErr.message);
      }

      return res.status(200).json({
        success: true,
        message: '6-digit code sent to email.',
        previewUrl,
      });
    }

    // Always return generic success message to prevent email enumeration
    return res.status(200).json({
      success: true,
      message: '6-digit code sent to email.',
      previewUrl: null,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return next(new AppError('Invalid or expired password reset code.', 400));
    }

    // Find latest unused, unexpired OTP for this user
    const otpRecord = await PasswordResetOTP.findOne({
      userId: user._id,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return next(new AppError('Invalid or expired password reset code. Please request a new code.', 400));
    }

    const isMatch = await otpRecord.compareOTP(otp.trim());
    if (!isMatch) {
      return next(new AppError('Invalid password reset code.', 400));
    }

    // Mark OTP as used and clean up
    otpRecord.used = true;
    await otpRecord.save();
    await PasswordResetOTP.deleteMany({ userId: user._id });

    // Set new password
    user.passwordHash = await User.hashPassword(newPassword);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};
