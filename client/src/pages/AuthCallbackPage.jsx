import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export const AuthCallbackPage = () => {
  const { restoreSession } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Authenticating with Google...');

  useEffect(() => {
    let isMounted = true;

    const handleCallback = async () => {
      try {
        const user = await restoreSession();
        if (isMounted) {
          if (user) {
            navigate('/dashboard', { replace: true });
          } else {
            navigate('/login?error=google_auth_failed', { replace: true });
          }
        }
      } catch (err) {
        console.error('Error establishing session in OAuth callback:', err);
        if (isMounted) {
          navigate('/login?error=google_auth_failed', { replace: true });
        }
      }
    };

    handleCallback();

    return () => {
      isMounted = false;
    };
  }, [restoreSession, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4">
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border shadow-md max-w-sm w-full text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <h2 className="text-lg font-serif font-semibold">{status}</h2>
        <p className="text-xs text-muted-foreground">Securing your session and redirecting...</p>
      </div>
    </div>
  );
};
