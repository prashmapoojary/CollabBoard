import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { User } from '../models/User.js';

export const configurePassport = () => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[Passport] Google OAuth credentials not fully defined. Google login will be disabled.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value?.toLowerCase();
          const name = profile.displayName || `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() || 'Google User';
          const avatarUrl = profile.photos?.[0]?.value || null;

          if (!email) {
            return done(new Error('No email found in Google account profile'), null);
          }

          // 1. Try finding user by googleId
          let user = await User.findOne({ googleId });

          if (user) {
            // Existing Google user - update avatar if changed
            if (avatarUrl && !user.avatarUrl) {
              user.avatarUrl = avatarUrl;
              await user.save();
            }
            return done(null, user);
          }

          // 2. Try finding user by email to link existing email/password account
          user = await User.findOne({ email });

          if (user) {
            user.googleId = googleId;
            if (avatarUrl && !user.avatarUrl) {
              user.avatarUrl = avatarUrl;
            }
            await user.save();
            console.log(`[Passport] Linked Google ID to existing account: ${email}`);
            return done(null, user);
          }

          // 3. Create brand new user without passwordHash
          user = await User.create({
            name,
            email,
            googleId,
            avatarUrl,
            passwordHash: null,
          });

          console.log(`[Passport] Created new user via Google OAuth: ${email}`);
          return done(null, user);
        } catch (error) {
          console.error('[Passport] Error in Google strategy callback:', error);
          return done(error, null);
        }
      }
    )
  );
};
