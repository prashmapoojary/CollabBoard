import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import request from 'supertest';
import { io as Client } from 'socket.io-client';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';

import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { initSocket } from '../src/socket/index.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';
import { Project } from '../src/models/Project.js';
import { List } from '../src/models/List.js';
import { Task } from '../src/models/Task.js';

// Helper to wait for a socket event
const waitForEvent = (socket, eventName, timeoutMs = 45000) => {
  return new Promise((resolve, reject) => {
    let errorHandler;
    const timer = setTimeout(() => {
      if (errorHandler) socket.off('error', errorHandler);
      reject(new Error(`Timeout waiting for socket event: "${eventName}"`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      if (errorHandler) socket.off('error', errorHandler);
      resolve(data);
    });

    if (eventName !== 'error') {
      errorHandler = (err) => {
        clearTimeout(timer);
        reject(new Error(`Socket emitted error while waiting for "${eventName}": ${JSON.stringify(err)}`));
      };
      socket.once('error', errorHandler);
    }
  });
};

// Helper to assert an event is NOT received
const assertNoEvent = (socket, eventName, waitMs = 500) => {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      reject(new Error(`Unexpected event "${eventName}" received with data: ${JSON.stringify(data)}`));
    };
    socket.once(eventName, handler);
    setTimeout(() => {
      socket.off(eventName, handler);
      resolve();
    }, waitMs);
  });
};

describe('Socket.io Real-Time Layer Test Suite (Step 5)', () => {
  let httpServer;
  let ioServer;
  let serverUrl;

  const ownerUser = {
    name: 'Socket Owner',
    email: 'socket_owner_test@collabboard.io',
    password: 'Password123!',
  };

  const editorUser = {
    name: 'Socket Editor',
    email: 'socket_editor_test@collabboard.io',
    password: 'Password123!',
  };

  const outsiderUser = {
    name: 'Socket Outsider',
    email: 'socket_outsider_test@collabboard.io',
    password: 'Password123!',
  };

  let ownerToken = '';
  let editorToken = '';
  let outsiderToken = '';

  let ownerId = '';
  let editorId = '';
  let outsiderId = '';

  let workspace = null;
  let project = null;
  let list1 = null;
  let list2 = null;

  const activeSockets = [];

  const createClientSocket = (token, options = {}) => {
    const client = Client(serverUrl, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      multiplex: false,
      reconnection: false,
      ...options,
    });
    activeSockets.push(client);
    return client;
  };

  before(async () => {
    await connectDB();

    // Start HTTP server on dynamic port
    httpServer = http.createServer(app);
    ioServer = initSocket(httpServer);

    await new Promise((resolve) => httpServer.listen(0, resolve));
    const port = httpServer.address().port;
    serverUrl = `http://localhost:${port}`;

    // Clean up test data
    await User.deleteMany({
      email: { $in: [ownerUser.email, editorUser.email, outsiderUser.email] },
    });
    await Workspace.deleteMany({ name: /Socket Workspace/i });
    await Project.deleteMany({ title: /Socket Project/i });

    // Register test users
    const ownerRes = await request(app).post('/api/auth/signup').send(ownerUser);
    ownerToken = ownerRes.body.accessToken;
    ownerId = ownerRes.body.user._id;

    const editorRes = await request(app).post('/api/auth/signup').send(editorUser);
    editorToken = editorRes.body.accessToken;
    editorId = editorRes.body.user._id;

    const outsiderRes = await request(app).post('/api/auth/signup').send(outsiderUser);
    outsiderToken = outsiderRes.body.accessToken;
    outsiderId = outsiderRes.body.user._id;

    // Create primary workspace
    workspace = await Workspace.create({
      name: 'Socket Workspace Primary',
      ownerId,
      members: [
        { userId: ownerId, role: 'owner', joinedAt: new Date() },
        { userId: editorId, role: 'editor', joinedAt: new Date() },
      ],
    });

    // Create test project and lists
    project = await Project.create({
      workspaceId: workspace._id,
      title: 'Socket Project Alpha',
      createdBy: ownerId,
    });

    list1 = await List.create({
      projectId: project._id,
      title: 'Backlog',
      order: 0,
      createdBy: ownerId,
    });

    list2 = await List.create({
      projectId: project._id,
      title: 'Doing',
      order: 1,
      createdBy: ownerId,
    });
  });

  after(async () => {
    // Disconnect all clients
    for (const socket of activeSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }

    // Close server
    await new Promise((resolve) => {
      if (ioServer) ioServer.close(() => resolve());
      else resolve();
    });

    await new Promise((resolve) => {
      if (httpServer) httpServer.close(() => resolve());
      else resolve();
    });

    await Project.deleteMany({ title: /Socket Project/i });
    await Workspace.deleteMany({ name: /Socket Workspace/i });
    await User.deleteMany({
      email: { $in: [ownerUser.email, editorUser.email, outsiderUser.email] },
    });
    await disconnectDB();
  });

  describe('1. Socket Authentication Handshake', () => {
    test('Unauthenticated connection without token is rejected', async () => {
      const socket = createClientSocket(null);
      const err = await waitForEvent(socket, 'connect_error');

      assert.ok(err);
      assert.match(err.message, /Token required/i);
      assert.equal(socket.connected, false);
    });

    test('Connection with invalid token is rejected', async () => {
      const socket = createClientSocket('bad.jwt.token');
      const err = await waitForEvent(socket, 'connect_error');

      assert.ok(err);
      assert.match(err.message, /Invalid token/i);
      assert.equal(socket.connected, false);
    });

    test('Connection with valid JWT access token succeeds', async () => {
      const socket = createClientSocket(ownerToken);
      await waitForEvent(socket, 'connect');

      assert.equal(socket.connected, true);
      socket.disconnect();
    });
  });

  describe('2. Project Room Management & Authorization', () => {
    test('Workspace member can join project room', async () => {
      const socket = createClientSocket(editorToken);
      await waitForEvent(socket, 'connect');

      socket.emit('project:join', { projectId: project._id.toString() });
      const joinedData = await waitForEvent(socket, 'project:joined');

      assert.equal(joinedData.projectId, project._id.toString());
      socket.disconnect();
    });

    test('User NOT in project workspace is rejected when attempting project:join', async () => {
      const socket = createClientSocket(outsiderToken);
      await waitForEvent(socket, 'connect');

      socket.emit('project:join', { projectId: project._id.toString() });
      const errorData = await waitForEvent(socket, 'error');

      assert.ok(errorData);
      assert.match(errorData.message, /Not a member of this workspace/i);
      socket.disconnect();
    });

    test('Joining with invalid project ID format emits error event', async () => {
      const socket = createClientSocket(editorToken);
      await waitForEvent(socket, 'connect');

      socket.emit('project:join', { projectId: 'invalid-id-format' });
      const errorData = await waitForEvent(socket, 'error');

      assert.ok(errorData);
      assert.match(errorData.message, /Invalid project ID format/i);
      socket.disconnect();
    });
  });

  describe('3. Presence Tracking & Rosters', () => {
    let clientA;
    let clientB;

    before(async () => {
      clientA = createClientSocket(ownerToken);
      await waitForEvent(clientA, 'connect');
      clientA.emit('project:join', { projectId: project._id.toString() });
      await waitForEvent(clientA, 'project:joined');

      clientB = createClientSocket(editorToken);
      await waitForEvent(clientB, 'connect');
    });

    after(() => {
      if (clientA && clientA.connected) clientA.disconnect();
      if (clientB && clientB.connected) clientB.disconnect();
    });

    test('Client A receives member:presence "joined" when Client B joins project room', async () => {
      const presencePromise = waitForEvent(clientA, 'member:presence');
      clientB.emit('project:join', { projectId: project._id.toString() });
      await waitForEvent(clientB, 'project:joined');

      const presenceData = await presencePromise;
      assert.equal(presenceData.userId, editorId.toString());
      assert.equal(presenceData.name, editorUser.name);
      assert.equal(presenceData.status, 'joined');
    });

    test('project:presence:request returns current roster via project:presence:list', async () => {
      clientB.emit('project:presence:request', { projectId: project._id.toString() });
      const rosterData = await waitForEvent(clientB, 'project:presence:list');

      assert.equal(rosterData.projectId, project._id.toString());
      assert.ok(Array.isArray(rosterData.users));
      const userIds = rosterData.users.map((u) => u.userId);
      assert.ok(userIds.includes(ownerId.toString()));
      assert.ok(userIds.includes(editorId.toString()));
    });

    test('Client A receives member:presence "left" when Client B leaves project room', async () => {
      const presencePromise = waitForEvent(clientA, 'member:presence');
      clientB.emit('project:leave', { projectId: project._id.toString() });

      const presenceData = await presencePromise;
      assert.equal(presenceData.userId, editorId.toString());
      assert.equal(presenceData.status, 'left');
    });

    test('Client A receives member:presence "left" when Client B disconnects', async () => {
      // Rejoin project room
      clientB.emit('project:join', { projectId: project._id.toString() });
      await waitForEvent(clientB, 'project:joined');

      const presencePromise = waitForEvent(clientA, 'member:presence');
      clientB.disconnect();

      const presenceData = await presencePromise;
      assert.equal(presenceData.userId, editorId.toString());
      assert.equal(presenceData.status, 'left');
    });
  });

  describe('4. REST Mutation Broadcasts & Sender Exclusion (x-socket-id)', () => {
    let clientA;
    let clientB;
    let createdTaskId = '';

    before(async () => {
      clientA = createClientSocket(ownerToken);
      await waitForEvent(clientA, 'connect');
      clientA.emit('project:join', { projectId: project._id.toString() });
      await waitForEvent(clientA, 'project:joined');

      clientB = createClientSocket(editorToken);
      await waitForEvent(clientB, 'connect');
      clientB.emit('project:join', { projectId: project._id.toString() });
      await waitForEvent(clientB, 'project:joined');
    });

    after(() => {
      if (clientA && clientA.connected) clientA.disconnect();
      if (clientB && clientB.connected) clientB.disconnect();
    });

    test('POST /api/lists/:listId/tasks broadcasts task:created (sender excluded via x-socket-id)', async () => {
      const clientAPromise = waitForEvent(clientA, 'task:created');

      // Trigger mutation via REST with x-socket-id set to clientB's socket id
      const res = await request(app)
        .post(`/api/lists/${list1._id}/tasks`)
        .set('Authorization', `Bearer ${editorToken}`)
        .set('x-socket-id', clientB.id)
        .send({
          title: 'Real-Time Task Alpha',
          order: 0,
        });

      assert.equal(res.status, 201);
      createdTaskId = res.body.task._id;

      // Client A receives broadcast
      const broadcastData = await clientAPromise;
      assert.ok(broadcastData.task);
      assert.equal(broadcastData.task._id, createdTaskId);
      assert.equal(broadcastData.task.title, 'Real-Time Task Alpha');

      // Client B should NOT receive broadcast because x-socket-id excluded it
      await assertNoEvent(clientB, 'task:created', 300);
    });

    test('PATCH /api/tasks/:id broadcasts task:updated (sender excluded via x-socket-id)', async () => {
      const clientAPromise = waitForEvent(clientA, 'task:updated');

      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .set('x-socket-id', clientB.id)
        .send({ title: 'Real-Time Task Alpha Updated' });

      assert.equal(res.status, 200);

      const broadcastData = await clientAPromise;
      assert.ok(broadcastData.task);
      assert.equal(broadcastData.task.title, 'Real-Time Task Alpha Updated');

      await assertNoEvent(clientB, 'task:updated', 300);
    });

    test('PATCH /api/tasks/:id/move broadcasts task:moved (sender excluded via x-socket-id)', async () => {
      const clientAPromise = waitForEvent(clientA, 'task:moved');

      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}/move`)
        .set('Authorization', `Bearer ${editorToken}`)
        .set('x-socket-id', clientB.id)
        .send({ listId: list2._id.toString(), order: 5 });

      assert.equal(res.status, 200);

      const broadcastData = await clientAPromise;
      assert.ok(broadcastData.task);
      assert.equal(broadcastData.task.listId, list2._id.toString());
      assert.equal(broadcastData.task.order, 5);

      await assertNoEvent(clientB, 'task:moved', 300);
    });

    test('DELETE /api/tasks/:id broadcasts task:deleted to all if x-socket-id is absent', async () => {
      const clientAPromise = waitForEvent(clientA, 'task:deleted');
      const clientBPromise = waitForEvent(clientB, 'task:deleted');

      const res = await request(app)
        .delete(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${editorToken}`);

      assert.equal(res.status, 200);

      const dataA = await clientAPromise;
      const dataB = await clientBPromise;

      assert.equal(dataA.taskId, createdTaskId);
      assert.equal(dataA.projectId, project._id.toString());
      assert.equal(dataB.taskId, createdTaskId);
    });

    test('POST /api/projects/:projectId/lists broadcasts list:created', async () => {
      const clientAPromise = waitForEvent(clientA, 'list:created');

      const res = await request(app)
        .post(`/api/projects/${project._id}/lists`)
        .set('Authorization', `Bearer ${editorToken}`)
        .set('x-socket-id', clientB.id)
        .send({ title: 'Review List', order: 2 });

      assert.equal(res.status, 201);
      const createdListId = res.body.list._id;

      const broadcastData = await clientAPromise;
      assert.ok(broadcastData.list);
      assert.equal(broadcastData.list._id, createdListId);
      assert.equal(broadcastData.list.title, 'Review List');

      await assertNoEvent(clientB, 'list:created', 300);
    });

    test('PATCH /api/lists/:id broadcasts list:updated', async () => {
      // Start listening on clientB BEFORE sending the REST request
      const clientBPromise = waitForEvent(clientB, 'list:updated');

      const res = await request(app)
        .patch(`/api/lists/${list1._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-socket-id', clientA.id)
        .send({ title: 'Backlog Renamed' });

      assert.equal(res.status, 200);

      // Client B receives it because clientA was excluded
      const broadcastData = await clientBPromise;
      assert.ok(broadcastData.list);
      assert.equal(broadcastData.list.title, 'Backlog Renamed');

      await assertNoEvent(clientA, 'list:updated', 300);
    });

    test('DELETE /api/lists/:id broadcasts list:deleted', async () => {
      const clientBPromise = waitForEvent(clientB, 'list:deleted');

      const res = await request(app)
        .delete(`/api/lists/${list2._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-socket-id', clientA.id);

      assert.equal(res.status, 200);

      const broadcastData = await clientBPromise;
      assert.equal(broadcastData.listId, list2._id.toString());
      assert.equal(broadcastData.projectId, project._id.toString());

      await assertNoEvent(clientA, 'list:deleted', 300);
    });

    test('DELETE /api/projects/:id broadcasts project:deleted to room', async () => {
      const clientBPromise = waitForEvent(clientB, 'project:deleted');

      const res = await request(app)
        .delete(`/api/projects/${project._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-socket-id', clientA.id);

      assert.equal(res.status, 200);

      const broadcastData = await clientBPromise;
      assert.equal(broadcastData.projectId, project._id.toString());

      await assertNoEvent(clientA, 'project:deleted', 300);
    });

    test('Blocked mutation (403 from ownershipMiddleware) does NOT broadcast any event', async () => {
      // Re-create a project and list
      const secureProject = await Project.create({
        workspaceId: workspace._id,
        title: 'Secure Project',
        createdBy: ownerId,
      });

      const secureList = await List.create({
        projectId: secureProject._id,
        title: 'Secure List',
        order: 0,
        createdBy: ownerId,
      });

      const secureTask = await Task.create({
        listId: secureList._id,
        projectId: secureProject._id,
        title: 'Owner Protected Task',
        order: 0,
        createdBy: ownerId,
        assignees: [],
      });

      // Join clients to secure project room
      clientA.emit('project:join', { projectId: secureProject._id.toString() });
      await waitForEvent(clientA, 'project:joined');

      // Editor (clientB) attempts unauthorized title edit on task created by owner -> 403
      const res = await request(app)
        .patch(`/api/tasks/${secureTask._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Hacked Title' });

      assert.equal(res.status, 403);

      // Verify client A receives NO broadcast
      await assertNoEvent(clientA, 'task:updated', 500);
    });
  });
});
