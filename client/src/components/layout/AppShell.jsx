import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/axios';
import {
  LayoutGrid,
  FolderKanban,
  Users,
  Plus,
  Menu,
  X,
  ChevronDown,
  LogOut,
  User,
  Shield,
  Crown,
  Eye,
  CheckCircle2,
  Loader2,
  FolderPlus,
} from 'lucide-react';
import { TeamMembersPanel } from '../workspace/TeamMembersPanel';
import { CreateTaskModal } from '../task/CreateTaskModal';

export const AppShell = () => {
  const { workspaceId, projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [workspace, setWorkspace] = useState(null);
  const [userRole, setUserRole] = useState('viewer');
  const [allWorkspaces, setAllWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals & Drawers state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTeamMembersOpen, setIsTeamMembersOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);

  // Quick project create state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Counter to notify child pages to re-fetch when task or project is created
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Close mobile sidebar on route changes
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Fetch workspaces list
  const fetchAllWorkspaces = useCallback(async () => {
    try {
      const { data } = await api.get('/workspaces');
      setAllWorkspaces(data.workspaces || []);
    } catch (err) {
      console.error('Failed to fetch workspaces list:', err);
    }
  }, []);

  // Fetch current workspace and its projects
  const fetchWorkspaceData = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError('');

      const [wsRes, projRes] = await Promise.all([
        api.get(`/workspaces/${workspaceId}`),
        api.get(`/workspaces/${workspaceId}/projects`),
      ]);

      setWorkspace(wsRes.data.workspace);
      setUserRole(wsRes.data.currentUserRole || 'viewer');
      setProjects(projRes.data.projects || []);
    } catch (err) {
      console.error('Failed to load workspace data:', err);
      setError(err.response?.data?.message || 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchAllWorkspaces();
    fetchWorkspaceData();
  }, [fetchAllWorkspaces, fetchWorkspaceData]);

  // Handle quick project creation
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectTitle.trim()) return;

    setCreatingProject(true);
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/projects`, {
        title: newProjectTitle.trim(),
      });
      setProjects((prev) => [data.project, ...prev]);
      setNewProjectTitle('');
      setShowNewProjectModal(false);
      setRefreshTrigger((c) => c + 1);
      // Navigate to the newly created project
      navigate(`/workspaces/${workspaceId}/projects/${data.project._id}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const isAllView = !projectId || location.pathname.endsWith('/all');
  const activeProject = projects.find((p) => p._id === projectId);

  // Role badge helper
  const renderRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Crown className="w-2.5 h-2.5" />
            Owner
          </span>
        );
      case 'editor':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Shield className="w-2.5 h-2.5" />
            Editor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary text-muted-foreground border border-border">
            <Eye className="w-2.5 h-2.5" />
            Viewer
          </span>
        );
    }
  };

  if (loading && !workspace) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Loading workspace environment...</p>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center shadow-lg">
          <h3 className="text-lg font-bold font-serif text-destructive mb-2">Workspace Error</h3>
          <p className="text-xs text-muted-foreground mb-6">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Workspace Branding Header */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="relative">
            <button
              onClick={() => setIsWorkspaceDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Generated initial-letter logo using theme token */}
                <div className="w-9 h-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-serif font-bold text-base flex items-center justify-center shadow-xs shrink-0">
                  {workspace?.name ? workspace.name.charAt(0).toUpperCase() : 'W'}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold font-serif truncate leading-tight">
                    {workspace?.name || 'Workspace'}
                  </h2>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
                  </p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
            </button>

            {/* Workspace Switcher Dropdown */}
            {isWorkspaceDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-card text-card-foreground border border-border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  Your Workspaces
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {allWorkspaces.map((ws) => (
                    <button
                      key={ws._id}
                      onClick={() => {
                        setIsWorkspaceDropdownOpen(false);
                        navigate(`/workspaces/${ws._id}/all`);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-left cursor-pointer transition-colors ${
                        ws._id === workspaceId
                          ? 'bg-primary/10 text-primary font-semibold'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-md bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center">
                        {ws.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate flex-1">{ws.name}</span>
                      {ws._id === workspaceId && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          {/* Main Navigation */}
          <div className="space-y-1">
            {/* Team Members Nav Item (Triggers Step 2 Panel) */}
            <button
              onClick={() => setIsTeamMembersOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors cursor-pointer text-left group"
            >
              <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="flex-1">Team Members</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground font-mono">
                {workspace?.members?.length || 1}
              </span>
            </button>
          </div>

          {/* Projects Section */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Projects
              </span>
              {userRole !== 'viewer' && (
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  title="Create new project"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* "All" Item (Combined flat view) */}
            <Link
              to={`/workspaces/${workspaceId}/all`}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                isAllView
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs border border-sidebar-border'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <LayoutGrid className={`w-4 h-4 ${isAllView ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="flex-1">All</span>
            </Link>

            {/* Individual Project Items */}
            <div className="space-y-1 pt-1">
              {projects.map((proj) => {
                const isSelected = proj._id === projectId;
                return (
                  <Link
                    key={proj._id}
                    to={`/workspaces/${workspaceId}/projects/${proj._id}`}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors truncate ${
                      isSelected
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs border border-sidebar-border'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}
                  >
                    <FolderKanban
                      className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span className="truncate flex-1">{proj.title}</span>
                  </Link>
                );
              })}

              {projects.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
                  No projects yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-sidebar-border bg-sidebar/50">
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-card/60 border border-sidebar-border">
            <div className="flex items-center gap-2.5 min-w-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border border-border object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-serif font-bold text-xs flex items-center justify-center shrink-0">
                  {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold truncate leading-tight text-foreground">
                    {user?.name || 'User'}
                  </p>
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  {renderRoleBadge(userRole)}
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN LAYOUT WRAPPER (Top bar + Outlet Content) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* TOP BAR */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-card/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="p-2 rounded-xl text-foreground hover:bg-muted lg:hidden cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Title / Current View Header */}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold font-serif text-foreground truncate flex items-center gap-2">
                {isAllView ? (
                  <>
                    <LayoutGrid className="w-5 h-5 text-primary shrink-0" />
                    <span>All Projects</span>
                  </>
                ) : (
                  <>
                    <FolderKanban className="w-5 h-5 text-primary shrink-0" />
                    <span>{activeProject?.title || 'Project Board'}</span>
                  </>
                )}
              </h1>
            </div>
          </div>

          {/* Top Bar Actions */}
          <div className="flex items-center gap-3">
            {/* Create Task Button: HIDDEN FOR VIEWERS */}
            {userRole !== 'viewer' && (
              <button
                onClick={() => setIsCreateTaskOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Create</span>
              </button>
            )}
          </div>
        </header>

        {/* Content View Outlet */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <Outlet
            context={{
              workspace,
              workspaceId,
              projects,
              currentUserRole: userRole,
              refreshProjects: fetchWorkspaceData,
              refreshTrigger,
            }}
          />
        </main>
      </div>

      {/* Task Creation Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        workspaceId={workspaceId}
        projects={projects}
        members={workspace?.members || []}
        selectedProjectId={isAllView ? null : projectId}
        onTaskCreated={() => {
          setRefreshTrigger((c) => c + 1);
        }}
      />

      {/* Team Members Slide-Over Panel (Step 2 UI Reused) */}
      <TeamMembersPanel
        isDrawer={true}
        isOpen={isTeamMembersOpen}
        onClose={() => setIsTeamMembersOpen(false)}
        activeWorkspaceId={workspaceId}
        onWorkspaceUpdated={(updatedWs) => {
          if (updatedWs?._id === workspaceId) {
            setWorkspace(updatedWs);
            fetchAllWorkspaces();
          }
        }}
      />

      {/* Quick Project Creation Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl text-card-foreground animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h4 className="text-base font-bold font-serif text-foreground">Create Project</h4>
              </div>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  required
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="e.g. Website Redesign"
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  autoFocus
                  disabled={creatingProject}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                  disabled={creatingProject}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingProject || !newProjectTitle.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  {creatingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
