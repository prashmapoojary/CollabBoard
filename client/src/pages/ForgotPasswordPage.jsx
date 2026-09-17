import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Mail, Lock, CheckCircle2, AlertCircle, ArrowLeft, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';

export const ForgotPasswordPage = () => {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 = Request OTP, 2 = Verify OTP & Set Password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Step 1: Send OTP to email
  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setSubmitting(true);

    try {
      const res = await forgotPassword(email);
      setInfoMessage(res.message || '6-digit code sent to email.');
      if (res.previewUrl) {
        setPreviewUrl(res.previewUrl);
      }
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to request password reset. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Verify OTP and reset password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP code.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await resetPassword({ email, otp, newPassword });
      setResetSuccess(true);
      setInfoMessage(res.message || 'Password reset successfully!');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reset password. Please verify the code.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-card text-card-foreground rounded-2xl shadow-lg border border-border p-8">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight font-serif text-foreground">
            {resetSuccess ? 'Password Reset Complete' : step === 1 ? 'Forgot Password' : 'Enter Reset Code'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {resetSuccess
              ? 'Your password has been securely updated'
              : step === 1
              ? 'Enter your email to receive a 6-digit recovery code'
              : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive flex items-start gap-2.5 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {infoMessage && (
          <div className="mb-6 p-3.5 rounded-lg bg-primary/10 border border-primary/20 text-foreground flex items-start gap-2.5 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" />
            <span>{infoMessage}</span>
          </div>
        )}

        {resetSuccess ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                navigate('/login', {
                  state: {
                    email,
                    message: 'Password updated successfully! You can now log in with your new password.',
                  },
                })
              }
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-sm transition-all shadow-sm cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        ) : step === 1 ? (
          /* Step 1: Request Code */
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="email">
                Registered Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-card text-foreground placeholder:text-muted-foreground border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  disabled={submitting}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-sm transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 cursor-pointer mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending code...
                </>
              ) : (
                'Send 6-digit OTP'
              )}
            </button>
          </form>
        ) : (
          /* Step 2: Verify OTP & New Password */
          <div className="space-y-5">
            {previewUrl && (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Recovery Email Delivered
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                    Virtual Inbox
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your recovery email has arrived in your sandbox inbox. Click below to view the email and retrieve your 6-digit code:
                </p>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Received Email
                </a>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="otp">
                6-Digit Verification Code
              </label>
              <input
                id="otp"
                type="text"
                required
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full text-center text-xl tracking-widest font-mono py-2 bg-card text-foreground placeholder:text-muted-foreground border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="newPassword">
                New Password (min 8 characters)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-card text-foreground placeholder:text-muted-foreground border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="confirmPassword">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-card text-foreground placeholder:text-muted-foreground border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Didn't receive a code?</span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-primary hover:underline font-medium cursor-pointer"
              >
                Resend code
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-sm transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 cursor-pointer mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-6 pt-6 border-t border-border text-center">
          <Link to="/login" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};
