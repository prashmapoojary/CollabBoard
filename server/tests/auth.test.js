import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import dotenv from 'dotenv';
dotenv.config();

// Ensure test environment
process.env.NODE_ENV = 'test';

import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { PasswordResetOTP } from '../src/models/PasswordResetOTP.js';

describe('Auth & User Management Test Suite (Step 1)', () => {
  const testUser = {
    name: 'Alex Test',
    email: 'alex.test@collabboard.io',
    password: 'Password123!',
  };

  before(async () => {
    await connectDB();
  });

  after(async () => {
    // Clean up test data
    await User.deleteMany({ email: { $in: [testUser.email, 'ratelimit.test@collabboard.io'] } });
    await PasswordResetOTP.deleteMany({});
    await disconnectDB();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: testUser.email });
    await PasswordResetOTP.deleteMany({});
  });

  describe('1. Signup (POST /api/auth/signup)', () => {
    test('successfully signs up a new user with name, email, and password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send(testUser);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.name, testUser.name);
      assert.equal(res.body.user.email, testUser.email);
      assert.ok(res.body.accessToken, 'Access token should be returned');
      assert.equal(res.body.user.passwordHash, undefined, 'passwordHash must not leak in JSON');

      // Check cookie
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies, 'set-cookie header must be present');
      assert.match(cookies[0], /refreshToken=/, 'refreshToken cookie must be set');
      assert.match(cookies[0], /HttpOnly/, 'Cookie must be HttpOnly');
    });

    test('rejects signup with missing or short password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Short Pass',
          email: 'shortpass@collabboard.io',
          password: 'short',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /at least 8 characters/i);
    });

    test('rejects duplicate email registration with 409', async () => {
      await request(app).post('/api/auth/signup').send(testUser);

      const res = await request(app).post('/api/auth/signup').send(testUser);
      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /already exists/i);
    });
  });

  describe('2. Login & "Keep me signed in" (POST /api/auth/login)', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/signup').send(testUser);
    });

    test('successfully logs in with valid credentials and standard 7-day cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          keepSignedIn: false,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.accessToken);
      assert.equal(res.body.user.email, testUser.email);

      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
      // Default 7 days is 604800 seconds
      assert.match(cookies[0], /Max-Age=604800/);
    });

    test('sets extended 30-day cookie when keepSignedIn is true', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          keepSignedIn: true,
        });

      assert.equal(res.status, 200);
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
      // 30 days is 2592000 seconds
      assert.match(cookies[0], /Max-Age=2592000/);
    });

    test('rejects login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999!',
        });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /invalid email or password/i);
    });
  });

  describe('3. Token Refresh, Me, and Logout', () => {
    let authCookie;
    let token;

    beforeEach(async () => {
      const res = await request(app).post('/api/auth/signup').send(testUser);
      authCookie = res.headers['set-cookie'];
      token = res.body.accessToken;
    });

    test('GET /api/auth/me returns current user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.user.email, testUser.email);
    });

    test('GET /api/auth/me rejects request without Bearer token', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('POST /api/auth/refresh returns new access token with valid cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', authCookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.accessToken);
    });

    test('POST /api/auth/refresh fails without cookie', async () => {
      const res = await request(app).post('/api/auth/refresh');
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    test('POST /api/auth/logout clears refresh cookie', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', authCookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const cookies = res.headers['set-cookie'];
      assert.ok(cookies);
      assert.match(cookies[0], /refreshToken=;/);
    });
  });

  describe('4. OTP Password Reset Flow (Forgot & Reset Password)', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/signup').send(testUser);
    });

    test('POST /api/auth/forgot-password returns generic success for existing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: testUser.email });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /6-digit code sent to email/i);

      // Verify OTP document was created in MongoDB
      const user = await User.findOne({ email: testUser.email });
      const otpDoc = await PasswordResetOTP.findOne({ userId: user._id });
      assert.ok(otpDoc, 'OTP record must be stored');
      assert.equal(otpDoc.used, false);
      assert.ok(otpDoc.otpHash);
    });

    test('POST /api/auth/forgot-password returns generic success for non-existing email (no enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@collabboard.io' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.match(res.body.message, /6-digit code sent to email/i);
    });

    test('POST /api/auth/reset-password succeeds with valid OTP and updates password', async () => {
      const plainOtp = '123456';
      const user = await User.findOne({ email: testUser.email });
      const otpHash = await PasswordResetOTP.hashOTP(plainOtp);

      await PasswordResetOTP.create({
        userId: user._id,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });

      const newPassword = 'BrandNewPassword123!';
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testUser.email,
          otp: plainOtp,
          newPassword,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify old password no longer works
      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      assert.equal(oldLogin.status, 401);

      // Verify new password works
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: newPassword });
      assert.equal(newLogin.status, 200);
    });

    test('POST /api/auth/reset-password fails with invalid OTP code', async () => {
      const plainOtp = '123456';
      const user = await User.findOne({ email: testUser.email });
      const otpHash = await PasswordResetOTP.hashOTP(plainOtp);

      await PasswordResetOTP.create({
        userId: user._id,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: false,
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testUser.email,
          otp: '999999',
          newPassword: 'BrandNewPassword123!',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /invalid password reset code/i);
    });

    test('POST /api/auth/reset-password fails with expired OTP', async () => {
      const plainOtp = '123456';
      const user = await User.findOne({ email: testUser.email });
      const otpHash = await PasswordResetOTP.hashOTP(plainOtp);

      // Expired 5 minutes ago
      await PasswordResetOTP.create({
        userId: user._id,
        otpHash,
        expiresAt: new Date(Date.now() - 5 * 60 * 1000),
        used: false,
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testUser.email,
          otp: plainOtp,
          newPassword: 'BrandNewPassword123!',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /invalid or expired/i);
    });

    test('POST /api/auth/reset-password rejects reused OTP', async () => {
      const plainOtp = '123456';
      const user = await User.findOne({ email: testUser.email });
      const otpHash = await PasswordResetOTP.hashOTP(plainOtp);

      // Already marked used
      await PasswordResetOTP.create({
        userId: user._id,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        used: true,
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: testUser.email,
          otp: plainOtp,
          newPassword: 'BrandNewPassword123!',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /invalid or expired/i);
    });
  });

  describe('5. Rate Limiting on OTP Password Reset Attempts', () => {
    test('enforces max 5 reset-password attempts per email and returns 429 on 6th attempt', async () => {
      const targetEmail = 'ratelimit.test@collabboard.io';
      await User.create({
        name: 'Rate Limit Target',
        email: targetEmail,
        passwordHash: 'dummyHash',
      });

      // Send 5 failed attempts
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/reset-password')
          .send({
            email: targetEmail,
            otp: '000000',
            newPassword: 'Password123!',
          });
        assert.equal(res.status, 400);
      }

      // 6th attempt should trigger 429 Too Many Requests
      const blockedRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: targetEmail,
          otp: '000000',
          newPassword: 'Password123!',
        });

      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.body.success, false);
      assert.match(blockedRes.body.message, /too many password reset attempts/i);
    });
  });
});
