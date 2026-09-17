import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';

import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Workspace } from '../src/models/Workspace.js';
import { Project } from '../src/models/Project.js';
import { List } from '../src/models/List.js';
import { Task } from '../src/models/Task.js';
import { Subitem } from '../src/models/Subitem.js';
import { ActivityLog } from '../src/models/ActivityLog.js';

describe('Subitems on Tasks Test Suite (Step 15 - Part B)', () => {
  const ts = Date.now();
  const ownerUser = {
    name: 'Subitem Owner',
    email: `sub_owner_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const creatorEditorUser = {
    name: 'Subitem Creator Editor',
    email: `sub_creator_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const otherEditorUser = {
    name: 'Subitem Other Editor',
    email: `sub_other_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'Subitem Viewer',
    email: `sub_viewer_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  let ownerToken, creatorEditorToken, otherEditorToken, viewerToken;
  let workspaceId, projectId, listId, taskId;

  before(async () => {
    await connectDB();

    // 1. Sign up test users
    const [resOwner, resCreator, resOther, resViewer] = await Promise.all([
      request(app).post('/api/auth/signup').send(ownerUser),
      request(app).post('/api/auth/signup').send(creatorEditorUser),
      request(app).post('/api/auth/signup').send(otherEditorUser),
      request(app).post('/api/auth/signup').send(viewerUser),
    ]);

    ownerToken = resOwner.body.accessToken;
    creatorEditorToken = resCreator.body.accessToken;
    otherEditorToken = resOther.body.accessToken;
    viewerToken = resViewer.body.accessToken;

    // 2. Create Workspace as Owner
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Subitem WS ${ts}` });
    workspaceId = wsRes.body.workspace._id;

    // 3. Invite members
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: creatorEditorUser.email, role: 'editor' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: otherEditorUser.email, role: 'editor' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerUser.email, role: 'viewer' });

    // 4. Create Project as Owner
    const projRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Subitem Project' });
    projectId = projRes.body.project._id;

    // Find default "To Do" list
    const getProj = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todoList = getProj.body.project.lists.find((l) => l.title === 'To Do');
    listId = todoList._id;

    // 5. Create a Task to attach subitems to
    const taskRes = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Task for Subitems Testing',
        description: 'Testing checklist subtasks',
        order: 0,
      });
    taskId = taskRes.body.task._id;
  });

  after(async () => {
    try {
      if (workspaceId) {
        await Workspace.findByIdAndDelete(workspaceId);
        await Project.deleteMany({ workspaceId });
        await Task.deleteMany({ projectId });
        await Subitem.deleteMany({ taskId });
        await ActivityLog.deleteMany({ workspaceId });
      }
    } finally {
      await disconnectDB();
    }
  });

  const findLogWithRetry = async (query, timeoutMs = 2500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const log = await ActivityLog.findOne(query);
      if (log) return log;
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  };

  describe('1. Subitem Creation & Permissions', () => {
    test('POST /api/tasks/:taskId/subitems: Editor can create subitem on task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${creatorEditorToken}`)
        .send({ text: 'Editor subitem 1' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.subitem.text, 'Editor subitem 1');
      assert.equal(res.body.subitem.completed, false);
      assert.equal(res.body.subitem.order, 0);

      // Verify activity log
      const log = await findLogWithRetry({
        actionType: 'subitem_created',
        targetId: res.body.subitem._id,
      });
      assert.ok(log, 'Activity log entry must be created for subitem_created');
      assert.equal(log.targetType, 'subitem');
      assert.equal(log.metadata.after.text, 'Editor subitem 1');
    });

    test('POST /api/tasks/:taskId/subitems: Owner can create subitem on task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ text: 'Owner subitem 2' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.subitem.text, 'Owner subitem 2');
      assert.equal(res.body.subitem.order, 1);
    });

    test('POST /api/tasks/:taskId/subitems: Viewer gets 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ text: 'Viewer should fail' });

      assert.equal(res.status, 403);
    });

    test('POST /api/tasks/:taskId/subitems: Rejects empty text with 400', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${creatorEditorToken}`)
        .send({ text: '   ' });

      assert.equal(res.status, 400);
    });

    test('POST /api/tasks/:taskId/subitems: Rejects text exceeding 300 characters with 400', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${creatorEditorToken}`)
        .send({ text: 'a'.repeat(301) });

      assert.equal(res.status, 400);
    });
  });

  describe('2. Subitem Retrieval', () => {
    test('GET /api/tasks/:taskId/subitems: Any member including viewer gets 200 list in order', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.subitems));
      assert.equal(res.body.subitems.length >= 2, true);
      assert.equal(res.body.subitems[0].text, 'Editor subitem 1');
      assert.equal(res.body.subitems[1].text, 'Owner subitem 2');
    });
  });

  describe('3. Subitem Collaborative Updates & Toggling', () => {
    let subitemId;

    before(async () => {
      const createRes = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${creatorEditorToken}`)
        .send({ text: 'Checklist to toggle' });
      subitemId = createRes.body.subitem._id;
    });

    test('PATCH /api/tasks/:taskId/subitems/:subitemId: Non-creator editor can toggle completed', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/subitems/${subitemId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`)
        .send({ completed: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.subitem.completed, true);

      // Verify activity log
      const log = await findLogWithRetry({
        actionType: 'subitem_updated',
        targetId: subitemId,
      });
      assert.ok(log, 'Activity log entry must be created for subitem_updated');
      assert.equal(log.targetType, 'subitem');
      assert.equal(log.metadata.after.completed, true);
    });

    test('PATCH /api/tasks/:taskId/subitems/:subitemId: Viewer gets 403 Forbidden', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/subitems/${subitemId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ completed: false });

      assert.equal(res.status, 403);
    });
  });

  describe('4. Subitem Deletion Permissions', () => {
    let subitemByEditorId;
    let subitemByOwnerId;

    before(async () => {
      const res1 = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${creatorEditorToken}`)
        .send({ text: 'Subitem created by editor' });
      subitemByEditorId = res1.body.subitem._id;

      const res2 = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ text: 'Subitem created by owner' });
      subitemByOwnerId = res2.body.subitem._id;
    });

    test('DELETE /api/tasks/:taskId/subitems/:subitemId: Non-creator editor is blocked with 403', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/subitems/${subitemByEditorId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`);

      assert.equal(res.status, 403);
      assert.match(res.body.message, /creator.*or.*owner/i);
    });

    test('DELETE /api/tasks/:taskId/subitems/:subitemId: Viewer is blocked with 403', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/subitems/${subitemByEditorId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 403);
    });

    test('DELETE /api/tasks/:taskId/subitems/:subitemId: Creator of subitem can delete (200)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/subitems/${subitemByEditorId}`)
        .set('Authorization', `Bearer ${creatorEditorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify deletion in DB
      const found = await Subitem.findById(subitemByEditorId);
      assert.equal(found, null);

      // Verify activity log
      const log = await findLogWithRetry({
        actionType: 'subitem_deleted',
        targetId: subitemByEditorId,
      });
      assert.ok(log);
      assert.equal(log.targetType, 'subitem');
    });

    test('DELETE /api/tasks/:taskId/subitems/:subitemId: Workspace owner can delete any subitem (200)', async () => {
      // Create subitem as other editor
      const tempRes = await request(app)
        .post(`/api/tasks/${taskId}/subitems`)
        .set('Authorization', `Bearer ${otherEditorToken}`)
        .send({ text: 'Temp subitem' });
      const tempId = tempRes.body.subitem._id;

      // Owner deletes it
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/subitems/${tempId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });
});
