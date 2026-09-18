import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  Edit2,
  Check,
  X,
  Trash2,
  Mail,
  Loader2,
  Crown,
  Eye,
  Edit3,
  Plus,
  AlertCircle,
  CheckCircle2,
  FolderPlus,
} from 'lucide-react';

export const TeamMembersPanel = ({
  isDrawer = false,
  isOpen = true,
  onClose,
  activeWorkspaceId = null,
  onWorkspaceUpdated,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Workspace creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  // Workspace rename state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Invite member state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Action loading states
  const [updatingMemberId, setUpdatingMemberId] = useState(null);

  // Fetch workspaces on mount
  const fetchWorkspaces = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/workspaces');
      const wsList = data.workspaces || [];
      setWorkspaces(wsList);
      if (wsList.length > 0) {
        setSelectedWorkspace((prev) => {
          if (activeWorkspaceId) {
            const found = wsList.find((w) => w._id === activeWorkspaceId);
            if (found) return found;
          }
          if (!prev) return wsList[0];
          const found = wsList.find((w) => w._id === prev._id);
          return found || wsList[0];
        });
      } else {
        setSelectedWorkspace(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load workspaces.');
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // Sync selected workspace when activeWorkspaceId prop changes
  useEffect(() => {
    if (activeWorkspaceId && workspaces.length > 0) {
      const match = workspaces.find((w) => w._id === activeWorkspaceId);
      if (match) setSelectedWorkspace(match);
    }
  }, [activeWorkspaceId, workspaces]);

  // Determine current user's role in selected workspace
  const currentMember = selectedWorkspace?.members?.find(
    (m) => (m.userId?._id || m.userId)?.toString() === user?._id?.toString()
  );
  const currentUserRole = currentMember?.role || 'viewer';
  const isOwner = currentUserRole === 'owner';

  // Clear notifications after 5 seconds
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // 1. Create Workspace
  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setCreatingWorkspace(true);
    setError('');

    try {
      const { data } = await api.post('/workspaces', { name: newWorkspaceName.trim() });
      setWorkspaces((prev) => [data.workspace, ...prev]);
      setSelectedWorkspace(data.workspace);
      setNewWorkspaceName('');
      setShowCreateModal(false);
      setSuccessMsg(`Workspace "${data.workspace.name}" created successfully.`);
      toast.success(`Workspace "${data.workspace.name}" created successfully.`);
      onWorkspaceUpdated?.(data.workspace);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create workspace.';
      setError(msg);
      toast.error(msg);
    } finally {
      setCreatingWorkspace(false);
    }
  };

  // 2. Rename Workspace
  const handleRenameWorkspace = async () => {
    if (!editedName.trim() || editedName === selectedWorkspace.name) {
      setIsEditingName(false);
      return;
    }

    setRenaming(true);
    setError('');

    try {
      const { data } = await api.patch(`/workspaces/${selectedWorkspace._id}`, {
        name: editedName.trim(),
      });
      setSelectedWorkspace(data.workspace);
      setWorkspaces((prev) =>
        prev.map((w) => (w._id === data.workspace._id ? data.workspace : w))
      );
      setIsEditingName(false);
      setSuccessMsg('Workspace renamed successfully.');
      onWorkspaceUpdated?.(data.workspace);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to rename workspace.');
    } finally {
      setRenaming(false);
    }
  };

  // 3. Invite Member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    setInviteError('');

    try {
      const { data } = await api.post(`/workspaces/${selectedWorkspace._id}/invite`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      setSelectedWorkspace(data.workspace);
      setWorkspaces((prev) =>
        prev.map((w) => (w._id === data.workspace._id ? data.workspace : w))
      );
      setInviteEmail('');
      setShowInviteModal(false);
      const msg = data.message || 'Invitation sent successfully.';
      setSuccessMsg(msg);
      toast.success(msg);
      onWorkspaceUpdated?.(data.workspace);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to invite member. Please verify the email.';
      setInviteError(msg);
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  // 4. Update Member Role
  const handleRoleChange = async (memberUserId, newRole) => {
    setUpdatingMemberId(memberUserId);
    setError('');

    try {
      const { data } = await api.patch(
        `/workspaces/${selectedWorkspace._id}/members/${memberUserId}`,
        { role: newRole }
      );
      setSelectedWorkspace(data.workspace);
      setWorkspaces((prev) =>
        prev.map((w) => (w._id === data.workspace._id ? data.workspace : w))
      );
      setSuccessMsg('Member role updated successfully.');
      toast.success('Member role updated successfully.');
      onWorkspaceUpdated?.(data.workspace);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update member role.';
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdatingMemberId(null);
    }
  };

  // 5. Remove Member
  const handleRemoveMember = async (memberUserId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName || 'this member'} from the workspace?`)) {
      return;
    }

    setUpdatingMemberId(memberUserId);
    setError('');

    try {
      const { data } = await api.delete(
        `/workspaces/${selectedWorkspace._id}/members/${memberUserId}`
      );
      setSelectedWorkspace(data.workspace);
      setWorkspaces((prev) =>
        prev.map((w) => (w._id === data.workspace._id ? data.workspace : w))
      );
      setSuccessMsg('Member removed from workspace.');
      toast.success('Member removed from workspace.');
      onWorkspaceUpdated?.(data.workspace);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to remove member.';
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdatingMemberId(null);
    }
  };

  if (isDrawer && !isOpen) {
    return null;
  }

  const renderContainer = (content) => {
    if (!isDrawer) {
      return content;
    }
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
        <div className="relative w-full max-w-2xl bg-card border-l border-border shadow-2xl z-10 flex flex-col h-full overflow-hidden">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border flex items-center justify-between bg-sidebar/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base font-serif text-foreground">Workspace & Team</h3>
                <p className="text-xs text-muted-foreground">Manage members, roles, and settings</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {content}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return renderContainer(
      <div className="w-full bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted/70" />
            <div className="space-y-1.5">
              <div className="h-5 bg-muted/70 rounded w-36" />
              <div className="h-3 bg-muted/40 rounded w-20" />
            </div>
          </div>
          <div className="h-8 bg-muted/50 rounded-xl w-24" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3.5 border border-border/60 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted/70" />
                <div className="space-y-1.5">
                  <div className="h-4 bg-muted/70 rounded w-28" />
                  <div className="h-3 bg-muted/40 rounded w-36" />
                </div>
              </div>
              <div className="h-6 w-16 bg-muted/50 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // If user has no workspaces at all
  if (!selectedWorkspace) {
    return renderContainer(
      <div className="w-full bg-card border border-border rounded-2xl p-8 text-center max-w-xl mx-auto shadow-sm">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
          <FolderPlus className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold font-serif mb-2 text-foreground">No Workspaces Found</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Create your first team workspace to start collaborating and managing members with role-based access.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-sm flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create First Workspace
        </button>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 w-full max-w-md shadow-xl text-left">
              <h4 className="text-lg font-bold font-serif mb-2">Create Workspace</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Enter a workspace name (e.g., Engineering, Marketing, Product).
              </p>
              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="e.g., Product Design"
                    className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingWorkspace}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60"
                  >
                    {creatingWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return renderContainer(
    <div className="w-full bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Workspace Header Bar */}
      <div className="border-b border-border p-5 md:p-6 bg-secondary/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-serif font-bold text-lg border border-primary/20">
            {selectedWorkspace.name.charAt(0).toUpperCase()}
          </div>

          <div>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameWorkspace();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  className="px-2.5 py-1 text-base font-bold bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  autoFocus
                  disabled={renaming}
                />
                <button
                  onClick={handleRenameWorkspace}
                  disabled={renaming}
                  className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
                  title="Save Name"
                >
                  {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-serif text-foreground">{selectedWorkspace.name}</h2>
                {isOwner && (
                  <button
                    onClick={() => {
                      setEditedName(selectedWorkspace.name);
                      setIsEditingName(true);
                    }}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    title="Rename Workspace (Owner only)"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              <span>Your Role:</span>
              <span
                className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full ${
                  currentUserRole === 'owner'
                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                    : currentUserRole === 'editor'
                    ? 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {currentUserRole === 'owner' && <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                {currentUserRole === 'editor' && <Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                {currentUserRole === 'viewer' && <Eye className="w-3 h-3 text-muted-foreground" />}
                {currentUserRole}
              </span>
            </div>
          </div>
        </div>

        {/* Actions & Workspace Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Workspace Switcher */}
          {workspaces.length > 1 && (
            <select
              value={selectedWorkspace._id}
              onChange={(e) => {
                const ws = workspaces.find((w) => w._id === e.target.value);
                if (ws) setSelectedWorkspace(ws);
              }}
              className="px-3 py-1.5 text-xs bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
            >
              {workspaces.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          {/* Create New Workspace */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 rounded-xl border border-border bg-background hover:bg-muted text-foreground text-xs transition-colors cursor-pointer"
            title="Create another workspace"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Invite Member (Owner only) */}
          {isOwner && (
            <button
              onClick={() => {
                setInviteError('');
                setShowInviteModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-all shadow-xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Invite Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Notices */}
      {error && (
        <div className="m-5 p-3.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="m-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Team Members List */}
      <div className="p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold font-serif text-foreground">Team Members</h3>
            <p className="text-xs text-muted-foreground">
              {selectedWorkspace.members.length} {selectedWorkspace.members.length === 1 ? 'member' : 'members'} with access to this board
            </p>
          </div>
        </div>

        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-background">
          {selectedWorkspace.members.map((member) => {
            const memberObj = member.userId || {};
            const isSelf = memberObj._id?.toString() === user?._id?.toString();
            const memberName = memberObj.name || 'Member';
            const memberEmail = memberObj.email || '';
            const memberRole = member.role;
            const isTargetOwner = memberRole === 'owner';
            const ownerCount = selectedWorkspace.members.filter((m) => m.role === 'owner').length;
            const isSoleOwner = isTargetOwner && ownerCount <= 1;

            return (
              <div
                key={memberObj._id || member.userId}
                className="p-3.5 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
              >
                {/* User Info */}
                <div className="flex items-center gap-3">
                  {memberObj.avatarUrl ? (
                    <img
                      src={memberObj.avatarUrl}
                      alt={memberName}
                      className="w-9 h-9 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-secondary text-primary font-serif font-bold text-sm flex items-center justify-center border border-border">
                      {memberName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{memberName}</span>
                      {isSelf && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-primary/15 text-primary">
                          You
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{memberEmail}</span>
                  </div>
                </div>

                {/* Role & Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pl-12 sm:pl-0">
                  {/* Role Badge / Dropdown */}
                  {isOwner && !isSoleOwner ? (
                    <div className="relative">
                      <select
                        value={memberRole}
                        disabled={updatingMemberId === (memberObj._id || member.userId)}
                        onChange={(e) => handleRoleChange(memberObj._id || member.userId, e.target.value)}
                        className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded-lg border border-input bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-[11px] px-2.5 py-1 rounded-md ${
                        memberRole === 'owner'
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                          : memberRole === 'editor'
                          ? 'bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-500/30'
                          : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {memberRole === 'owner' && <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                      {memberRole === 'editor' && <Edit3 className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                      {memberRole === 'viewer' && <Eye className="w-3 h-3 text-muted-foreground" />}
                      {memberRole}
                    </span>
                  )}

                  {/* Remove Button (Owner only, cannot remove the sole owner) */}
                  {isOwner && (
                    <button
                      onClick={() => handleRemoveMember(memberObj._id || member.userId, memberName)}
                      disabled={isSoleOwner || updatingMemberId === (memberObj._id || member.userId)}
                      className={`p-1.5 rounded-lg border border-transparent transition-colors ${
                        isSoleOwner
                          ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                          : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 cursor-pointer'
                      }`}
                      title={isSoleOwner ? 'Cannot remove the only workspace owner' : `Remove ${memberName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h4 className="text-lg font-bold font-serif">Invite Team Member</h4>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-4">
              Invite a registered CollabBoard user by email. They will receive an email invitation to join <strong>{selectedWorkspace.name}</strong>.
            </p>

            {inviteError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                    disabled={inviting}
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Role & Permissions
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring text-foreground cursor-pointer"
                  disabled={inviting}
                >
                  <option value="editor">Editor — Can view and edit boards & tasks</option>
                  <option value="viewer">Viewer — Read-only access to boards</option>
                  <option value="owner">Owner — Full administrative control</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                  disabled={inviting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60 shadow-xs"
                >
                  {inviting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Sending Invite...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-card text-card-foreground border border-border rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h4 className="text-lg font-bold font-serif mb-2">Create New Workspace</h4>
            <p className="text-xs text-muted-foreground mb-4">
              Add a new workspace to organize your boards and team members.
            </p>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g., Marketing Q3"
                  className="w-full px-3 py-2 text-sm bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border border-border cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingWorkspace}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60"
                >
                  {creatingWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
