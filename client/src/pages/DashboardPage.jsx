import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/axios';
import { LogOut, User, CheckCircle, ShieldCheck } from 'lucide-react';
import { TeamMembersPanel } from '../components/workspace/TeamMembersPanel';

export const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const checkWorkspaces = async () => {
      try {
        const { data } = await api.get('/workspaces');
        if (data.workspaces && data.workspaces.length > 0) {
          navigate(`/workspaces/${data.workspaces[0]._id}/all`, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load workspaces for dashboard redirect:', err);
      }
    };
    checkWorkspaces();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navigation Header */}
      <header className="border-b border-border bg-card px-6 py-3.5 flex items-center justify-between shadow-2xs sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-lg shadow-xs">
            C
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight font-serif">CollabBoard</h1>
            <p className="text-[11px] text-muted-foreground">Step 2: Workspace & Team RBAC</p>
          </div>
        </div>

        {/* User badge & Logout */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-border">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-border object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-secondary text-primary font-serif font-bold text-xs flex items-center justify-center border border-border">
                {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
            )}
            <div className="text-left">
              <p className="text-xs font-semibold leading-none text-foreground">{user?.name}</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        {/* Workspace Team Management Section */}
        <section>
          <TeamMembersPanel />
        </section>

        {/* Account Details Card */}
        <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Account Status</h4>
                <p className="text-xs text-muted-foreground">
                  Signed in as <span className="font-semibold text-foreground">{user?.name}</span> ({user?.email})
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center text-primary font-medium">
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Active Session
              </span>
              <span className="hidden sm:inline text-border">•</span>
              <span>Account ID: <code className="font-mono text-foreground text-[11px]">{user?._id}</code></span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
