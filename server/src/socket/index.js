import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { verifyAccessToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { Project } from '../models/Project.js';
import { Workspace } from '../models/Workspace.js';
import { checkWorkspaceRole } from '../utils/roleHelper.js';

let ioInstance = null;

// Server-side presence tracking:
// Map of projectId -> Map of userId -> { user: { userId, name, avatarUrl }, sockets: Set of socketIds }
const projectPresence = new Map();

// Map of socket.id -> Set of projectIds currently joined by this socket
const socketProjects = new Map();

/**
 * Attach and initialize Socket.io on the provided HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @param {Object} [options]
 * @returns {Server}
 */
export const initSocket = (httpServer, options = {}) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  ioInstance = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    ...options,
  });

  // Socket Auth Middleware: verify JWT from socket.handshake.auth.token
  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          return next(new Error('Authentication error: Token expired'));
        }
        return next(new Error('Authentication error: Invalid token'));
      }

      const userId = decoded.userId || decoded.id || decoded._id;
      const user = await User.findById(userId).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  ioInstance.on('connection', (socket) => {
    socketProjects.set(socket.id, new Set());

    // Join project room: socket.on('project:join', { projectId })
    socket.on('project:join', async (data) => {
      try {
        const projectId = typeof data === 'string' ? data : data?.projectId;

        if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
          return socket.emit('error', { message: 'Invalid project ID format' });
        }

        const project = await Project.findById(projectId);
        if (!project) {
          return socket.emit('error', { message: 'Project not found' });
        }

        const workspace = await Workspace.findById(project.workspaceId);
        if (!workspace) {
          return socket.emit('error', { message: 'Workspace not found' });
        }

        // Verify membership using existing role helper logic
        try {
          checkWorkspaceRole(workspace, socket.user._id, ['owner', 'editor', 'viewer']);
        } catch (roleErr) {
          return socket.emit('error', {
            message: roleErr.message || 'Unauthorized: Not a member of this workspace',
          });
        }

        const roomName = `project:${projectId}`;
        socket.join(roomName);

        // Track socket room
        const socketRooms = socketProjects.get(socket.id);
        if (socketRooms) {
          socketRooms.add(projectId.toString());
        }

        // Track active user in project room
        if (!projectPresence.has(projectId.toString())) {
          projectPresence.set(projectId.toString(), new Map());
        }
        const projectMap = projectPresence.get(projectId.toString());
        const userIdStr = socket.user._id.toString();

        const userInfo = {
          userId: userIdStr,
          name: socket.user.name,
          avatarUrl: socket.user.avatarUrl || null,
        };

        const existingEntry = projectMap.get(userIdStr);
        if (!existingEntry) {
          projectMap.set(userIdStr, { user: userInfo, sockets: new Set([socket.id]) });
        } else {
          existingEntry.sockets.add(socket.id);
        }

        // Broadcast presence joined to room (excluding sender)
        socket.to(roomName).emit('member:presence', {
          ...userInfo,
          status: 'joined',
        });

        socket.emit('project:joined', { projectId: projectId.toString() });
      } catch (err) {
        socket.emit('error', { message: err.message || 'Failed to join project room' });
      }
    });

    // Leave project room: socket.on('project:leave', { projectId })
    socket.on('project:leave', (data) => {
      try {
        const projectId = typeof data === 'string' ? data : data?.projectId;
        if (!projectId) return;

        const pidStr = projectId.toString();
        const roomName = `project:${pidStr}`;
        socket.leave(roomName);

        const socketRooms = socketProjects.get(socket.id);
        if (socketRooms) {
          socketRooms.delete(pidStr);
        }

        const projectMap = projectPresence.get(pidStr);
        if (projectMap && socket.user) {
          const userIdStr = socket.user._id.toString();
          const userEntry = projectMap.get(userIdStr);
          if (userEntry) {
            userEntry.sockets.delete(socket.id);
            if (userEntry.sockets.size === 0) {
              projectMap.delete(userIdStr);
              if (projectMap.size === 0) {
                projectPresence.delete(pidStr);
              }

              // Broadcast left to room
              ioInstance.to(roomName).emit('member:presence', {
                userId: userIdStr,
                name: socket.user.name,
                avatarUrl: socket.user.avatarUrl || null,
                status: 'left',
              });
            }
          }
        }

        socket.emit('project:left', { projectId: pidStr });
      } catch (err) {
        socket.emit('error', { message: err.message || 'Failed to leave project room' });
      }
    });

    // Presence roster request: socket.on('project:presence:request', { projectId })
    socket.on('project:presence:request', (data) => {
      try {
        const projectId = typeof data === 'string' ? data : data?.projectId;
        if (!projectId) return;

        const pidStr = projectId.toString();
        const projectMap = projectPresence.get(pidStr);
        const roster = projectMap
          ? Array.from(projectMap.values()).map((entry) => entry.user)
          : [];

        socket.emit('project:presence:list', {
          projectId: pidStr,
          users: roster,
          members: roster,
          roster,
        });
      } catch (err) {
        socket.emit('error', { message: err.message || 'Failed to retrieve presence roster' });
      }
    });

    // Disconnect cleanup: broadcast status: 'left' for any abandoned rooms
    socket.on('disconnect', () => {
      const socketRooms = socketProjects.get(socket.id);
      if (socketRooms && socket.user) {
        const userIdStr = socket.user._id.toString();

        for (const pidStr of socketRooms) {
          const roomName = `project:${pidStr}`;
          const projectMap = projectPresence.get(pidStr);

          if (projectMap) {
            const userEntry = projectMap.get(userIdStr);
            if (userEntry) {
              userEntry.sockets.delete(socket.id);
              if (userEntry.sockets.size === 0) {
                projectMap.delete(userIdStr);
                if (projectMap.size === 0) {
                  projectPresence.delete(pidStr);
                }

                ioInstance.to(roomName).emit('member:presence', {
                  userId: userIdStr,
                  name: socket.user.name,
                  avatarUrl: socket.user.avatarUrl || null,
                  status: 'left',
                });
              }
            }
          }
        }
      }
      socketProjects.delete(socket.id);
    });
  });

  return ioInstance;
};

/**
 * Returns the current Socket.io instance.
 *
 * @returns {Server|null}
 */
export const getIO = () => ioInstance;

/**
 * Broadcast an event to all clients in room `project:{projectId}`.
 * If req contains the `x-socket-id` header, the sender socket is excluded.
 *
 * @param {import('express').Request} req
 * @param {string|mongoose.Types.ObjectId} projectId
 * @param {string} event
 * @param {Object} data
 */
export const broadcastToProject = (req, projectId, event, data) => {
  if (!ioInstance || !projectId) return;

  const roomName = `project:${projectId.toString()}`;
  const senderSocketId = req?.headers ? req.headers['x-socket-id'] : null;

  if (senderSocketId) {
    ioInstance.to(roomName).except(senderSocketId).emit(event, data);
  } else {
    ioInstance.to(roomName).emit(event, data);
  }
};
