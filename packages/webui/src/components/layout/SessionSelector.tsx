/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 *
 * SessionSelector component - Session list dropdown
 * Displays sessions grouped by date with search and infinite scroll
 */

import type { FC, KeyboardEvent, MouseEvent } from 'react';
import { Fragment, useState, useRef, useEffect } from 'react';
import {
  getTimeAgo,
  groupSessionsByDate,
} from '../../utils/sessionGrouping.js';
import { SearchIcon } from '../icons/NavigationIcons.js';
import { EditPencilIcon, TrashIcon } from '../icons/EditIcons.js';

/**
 * Props for SessionSelector component
 */
export interface SessionSelectorProps {
  /** Whether the selector is visible */
  visible: boolean;
  /** List of session objects */
  sessions: Array<Record<string, unknown>>;
  /** Currently selected session ID */
  currentSessionId: string | null;
  /** Current search query */
  searchQuery: string;
  /** Callback when search query changes */
  onSearchChange: (query: string) => void;
  /** Callback when a session is selected */
  onSelectSession: (sessionId: string) => void;
  /** Callback when selector should close */
  onClose: () => void;
  /** Whether there are more sessions to load */
  hasMore?: boolean;
  /** Whether loading is in progress */
  isLoading?: boolean;
  /** Callback to load more sessions */
  onLoadMore?: () => void;
  /** Callback when a session is renamed */
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  /** Callback when a session is deleted */
  onDeleteSession?: (sessionId: string) => void;
}

/**
 * SessionSelector component
 *
 * Features:
 * - Sessions grouped by date (Today, Yesterday, This Week, Older)
 * - Search filtering
 * - Infinite scroll to load more sessions
 * - Click outside to close
 * - Active session highlighting
 *
 * @example
 * ```tsx
 * <SessionSelector
 *   visible={true}
 *   sessions={sessions}
 *   currentSessionId="abc123"
 *   searchQuery=""
 *   onSearchChange={(q) => setQuery(q)}
 *   onSelectSession={(id) => loadSession(id)}
 *   onClose={() => setVisible(false)}
 * />
 * ```
 */
export const SessionSelector: FC<SessionSelectorProps> = ({
  visible,
  sessions,
  currentSessionId,
  searchQuery,
  onSearchChange,
  onSelectSession,
  onClose,
  hasMore = false,
  isLoading = false,
  onLoadMore,
  onRenameSession,
  onDeleteSession,
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  useEffect(() => {
    if (!visible) {
      setEditingSessionId(null);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const hasNoSessions = sessions.length === 0;

  const startEditing = (
    sessionId: string,
    currentTitle: string,
    e: MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const commitRename = () => {
    if (editingSessionId && editingTitle.trim() && onRenameSession) {
      onRenameSession(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  return (
    <>
      <div
        className="session-selector-backdrop fixed top-0 left-0 right-0 bottom-0 z-[999] bg-transparent"
        onClick={onClose}
      />
      <div
        className="session-dropdown fixed bg-[var(--app-menu-background)] rounded-[var(--corner-radius-small)] w-[min(400px,calc(100vw-32px))] max-h-[min(500px,50vh)] flex flex-col shadow-[0_4px_16px_rgba(0,0,0,0.1)] z-[1000] outline-none text-[var(--vscode-chat-font-size,13px)] font-[var(--vscode-chat-font-family)]"
        tabIndex={-1}
        style={{
          top: '30px',
          left: '10px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Box */}
        <div className="session-search p-2 flex items-center gap-2">
          <SearchIcon className="session-search-icon w-4 h-4 opacity-50 flex-shrink-0 text-[var(--app-primary-foreground)]" />
          <input
            type="text"
            className="session-search-input flex-1 bg-transparent border-none outline-none text-[var(--app-menu-foreground)] text-[var(--vscode-chat-font-size,13px)] font-[var(--vscode-chat-font-family)] p-0 placeholder:text-[var(--app-input-placeholder-foreground)] placeholder:opacity-60"
            placeholder="Search sessions…"
            aria-label="Search sessions"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Session List with Grouping */}
        <div
          className="session-list-content overflow-y-auto flex-1 select-none p-2"
          onScroll={(e) => {
            const el = e.currentTarget;
            const distanceToBottom =
              el.scrollHeight - (el.scrollTop + el.clientHeight);
            if (distanceToBottom < 48 && hasMore && !isLoading) {
              onLoadMore?.();
            }
          }}
        >
          {hasNoSessions ? (
            <div
              className="p-5 text-center text-[var(--app-secondary-foreground)]"
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--app-secondary-foreground)',
              }}
            >
              {searchQuery ? 'No matching sessions' : 'No sessions available'}
            </div>
          ) : (
            groupSessionsByDate(sessions).map((group) => (
              <Fragment key={group.label}>
                <div className="session-group-label p-1 px-2 text-[var(--app-primary-foreground)] opacity-50 text-[0.9em] font-medium [&:not(:first-child)]:mt-2">
                  {group.label}
                </div>
                <div className="session-group flex flex-col gap-[2px]">
                  {group.sessions.map((session) => {
                    const sessionId =
                      (session.id as string) ||
                      (session.sessionId as string) ||
                      '';
                    const title =
                      (session.title as string) ||
                      (session.name as string) ||
                      'Untitled';
                    const lastUpdated =
                      (session.lastUpdated as string) ||
                      (session.startTime as string) ||
                      '';
                    const isActive = sessionId === currentSessionId;
                    const isEditing = editingSessionId === sessionId;

                    return (
                      <div
                        key={sessionId}
                        className={`session-item group flex items-center justify-between py-1.5 px-2 rounded-md w-full text-[var(--vscode-chat-font-size,13px)] font-[var(--vscode-chat-font-family)] text-[var(--app-primary-foreground)] transition-colors duration-100 hover:bg-[var(--app-list-hover-background)] ${
                          isActive
                            ? 'active bg-[var(--app-list-active-background)] text-[var(--app-list-active-foreground)] font-[600]'
                            : ''
                        }`}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            className="flex-1 bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded px-1 py-0.5 text-[var(--vscode-chat-font-size,13px)] font-[var(--vscode-chat-font-family)] outline-none min-w-0"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            onBlur={commitRename}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <button
                            type="button"
                            className="flex-1 flex items-center bg-transparent border-none cursor-pointer text-left text-[var(--vscode-chat-font-size,13px)] font-[var(--vscode-chat-font-family)] text-[var(--app-primary-foreground)] min-w-0 p-0"
                            onClick={() => {
                              onSelectSession(sessionId);
                              onClose();
                            }}
                          >
                            <span className="session-item-title flex-1 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                              {title}
                            </span>
                          </button>
                        )}
                        {!isEditing && (
                          <div className="flex items-center flex-shrink-0 ml-2 gap-1">
                            {onRenameSession && (
                              <button
                                type="button"
                                className="session-rename-btn opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-transparent border-none cursor-pointer p-0.5 rounded text-[var(--app-primary-foreground)] transition-opacity duration-100"
                                title="Rename session"
                                onClick={(e) =>
                                  startEditing(sessionId, title, e)
                                }
                              >
                                <EditPencilIcon size={12} />
                              </button>
                            )}
                            {onDeleteSession && !isActive && (
                              <button
                                type="button"
                                className="session-delete-btn opacity-0 group-hover:opacity-60 hover:!opacity-100 bg-transparent border-none cursor-pointer p-0.5 rounded text-[var(--app-primary-foreground)] transition-opacity duration-100"
                                title="Delete session"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteSession(sessionId);
                                }}
                              >
                                <TrashIcon size={12} />
                              </button>
                            )}
                            <span className="session-item-time opacity-60 text-[0.9em]">
                              {getTimeAgo(lastUpdated)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Fragment>
            ))
          )}
          {hasMore && (
            <div className="p-2 text-center opacity-60 text-[0.9em]">
              {isLoading ? 'Loading…' : ''}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
