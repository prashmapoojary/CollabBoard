import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  User,
  Check,
  X,
  Search,
  ChevronDown,
  UserPlus,
  Crown,
  Shield,
  Eye,
} from 'lucide-react';

export const AssigneePicker = ({
  members = [],
  selectedUserIds = [],
  onChange,
  disabled = false,
  placeholder = 'Select assignees...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize members list (handling both workspace member objects and flat user objects)
  const normalizedMembers = useMemo(() => {
    return (members || [])
      .map((m) => {
        const u = m.userId && typeof m.userId === 'object' ? m.userId : m;
        return {
          id: (u._id || u.id || m._id || m.id)?.toString(),
          name: u.name || 'Team Member',
          email: u.email || '',
          avatarUrl: u.avatarUrl || null,
          role: m.role || 'editor',
        };
      })
      .filter((m) => Boolean(m.id));
  }, [members]);

  // Normalize selected IDs as a Set of string IDs
  const selectedSet = useMemo(() => {
    return new Set(
      (selectedUserIds || [])
        .map((item) =>
          (typeof item === 'object' && item !== null ? item._id || item.id : item)?.toString()
        )
        .filter(Boolean)
    );
  }, [selectedUserIds]);

  // Selected members objects for rendering chips
  const selectedMembers = useMemo(() => {
    return normalizedMembers.filter((m) => selectedSet.has(m.id));
  }, [normalizedMembers, selectedSet]);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return normalizedMembers;
    const q = searchQuery.toLowerCase().trim();
    return normalizedMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
    );
  }, [normalizedMembers, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const toggleMember = (memberId) => {
    if (disabled) return;
    const newSet = new Set(selectedSet);
    if (newSet.has(memberId)) {
      newSet.delete(memberId);
    } else {
      newSet.add(memberId);
    }
    onChange?.(Array.from(newSet));
  };

  const removeMember = (e, memberId) => {
    e.stopPropagation();
    if (disabled) return;
    const newSet = new Set(selectedSet);
    newSet.delete(memberId);
    onChange?.(Array.from(newSet));
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-3 h-3 text-amber-500" />;
      case 'editor':
        return <Shield className="w-3 h-3 text-blue-500" />;
      case 'viewer':
        return <Eye className="w-3 h-3 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger & Chips Container */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`min-h-[42px] w-full px-3 py-1.5 bg-background border rounded-xl flex items-center justify-between gap-2 flex-wrap transition-all ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-input'
            : isOpen
            ? 'border-primary ring-2 ring-primary/20 cursor-pointer'
            : 'border-input hover:border-muted-foreground/40 cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0 py-0.5">
          {selectedMembers.length > 0 ? (
            selectedMembers.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-0.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium border border-border shadow-2xs group select-none"
              >
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt={m.name}
                    className="w-4 h-4 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-primary/20 text-primary font-bold text-[9px] flex items-center justify-center shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate max-w-[120px]">{m.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeMember(e, m.id)}
                    className="ml-0.5 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                    title={`Remove ${m.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 select-none">
              <UserPlus className="w-3.5 h-3.5 opacity-60" />
              <span>{placeholder}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-muted-foreground shrink-0 pointer-events-none">
          {selectedMembers.length > 0 && (
            <span className="text-[11px] font-semibold text-primary font-mono mr-1">
              {selectedMembers.length}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-card border border-border rounded-xl shadow-xl p-2 space-y-2 text-card-foreground animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members by name or email..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Members List */}
          <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => {
                const isSelected = selectedSet.has(member.id);
                return (
                  <div
                    key={member.id}
                    onClick={() => toggleMember(member.id)}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors select-none ${
                      isSelected
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'hover:bg-muted/60 text-foreground border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Checkbox indicator */}
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/40 bg-background'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      {/* Avatar */}
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-secondary text-primary font-bold text-[10px] flex items-center justify-center shrink-0 border border-border">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Name & Email */}
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-foreground leading-tight">
                          {member.name}
                        </p>
                        {member.email && (
                          <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Role Badge */}
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium capitalize px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground shrink-0 border border-border/50"
                      title={`Role: ${member.role}`}
                    >
                      {getRoleIcon(member.role)}
                      <span>{member.role}</span>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No members found matching "{searchQuery}"
              </div>
            )}
          </div>

          {/* Quick Clear / Done actions */}
          <div className="pt-1.5 border-t border-border flex items-center justify-between text-[11px] px-1 text-muted-foreground">
            <span>
              {selectedSet.size} of {normalizedMembers.length} selected
            </span>
            <div className="flex items-center gap-2">
              {selectedSet.size > 0 && (
                <button
                  type="button"
                  onClick={() => onChange?.([])}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold cursor-pointer text-[11px] hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
