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
import { Task } from '../src/models/Task.js';
import { LogHour } from '../src/models/LogHour.js';
import { ActivityLog } from '../src/models/ActivityLog.js';

describe('Log Hours on Tasks Test Suite (Step 16)', () => {
  const ts = Date.now();
  const ownerUser = {
    name: 'LogHour Owner',
    email: `lh_owner_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const authorEditorUser = {
    name: 'LogHour Author Editor',
    email: `lh_author_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const otherEditorUser = {
    name: 'LogHour Other Editor',
    email: `lh_other_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'LogHour Viewer',
    email: `lh_viewer_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const nonMemberUser = {
    name: 'LogHour NonMember',
    email: `lh_nonmember_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  let ownerToken, authorToken, otherEditorToken, viewerToken, nonMemberToken;
  let ownerId, authorId, otherEditorId;
  let workspaceId, projectId, listId, taskId;
  let createdLogId;

  before(async () => {
    await connectDB();

    // 1. Sign up test users
    const [resOwner, resAuthor, resOther, resViewer, resNonMember] = await Promise.all([
      request(app).post('/api/auth/signup').send(ownerUser),
      request(app).post('/api/auth/signup').send(authorEditorUser),
      request(app).post('/api/auth/signup').send(otherEditorUser),
      request(app).post('/api/auth/signup').send(viewerUser),
      request(app).post('/api/auth/signup').send(nonMemberUser),
    ]);

    ownerToken = resOwner.body.accessToken;
    ownerId = resOwner.body.user._id;
    authorToken = resAuthor.body.accessToken;
    authorId = resAuthor.body.user._id;
    otherEditorToken = resOther.body.accessToken;
    otherEditorId = resOther.body.user._id;
    viewerToken = resViewer.body.accessToken;
    nonMemberToken = resNonMember.body.accessToken;

    // 2. Create Workspace
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `LogHour WS ${ts}` });
    workspaceId = wsRes.body.workspace._id;

    // 3. Invite members
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: authorEditorUser.email, role: 'editor' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: otherEditorUser.email, role: 'editor' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerUser.email, role: 'viewer' });

    // 4. Create Project & Task
    const projRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Time Tracking Project' });
    projectId = projRes.body.project._id;

    const getProj = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todoList = getProj.body.project.lists.find((l) => l.title === 'To Do');
    listId = todoList._id;

    const taskRes = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Trackable Task',
        order: 0,
      });
    taskId = taskRes.body.task._id;
  });

  after(async () => {
    // Cleanup workspace and child items
    if (workspaceId) {
      await LogHour.deleteMany({ taskId });
      await Task.deleteMany({ projectId });
      await Project.deleteMany({ workspaceId });
      await Workspace.findByIdAndDelete(workspaceId);
    }
    await disconnectDB();
  });

  describe('1. Log Hours Creation & Anti-Spoofing', () => {
    test('POST /api/tasks/:taskId/loghours: Editor can log time and userId is set automatically from auth token', async () => {
      const fakeSpoofedId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          hours: 3.5,
          date: '2026-09-15',
          note: 'Investigated and resolved database connection bottleneck',
          userId: fakeSpoofedId, // Attempted spoof
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.logHour.hours, 3.5);
      assert.equal(res.body.logHour.note, 'Investigated and resolved database connection bottleneck');

      // Crucial: Anti-spoofing verification
      assert.notEqual(res.body.logHour.userId.toString(), fakeSpoofedId);
      const returnedAuthorId = res.body.logHour.userId?._id || res.body.logHour.userId;
      assert.equal(returnedAuthorId.toString(), authorId.toString());

      createdLogId = res.body.logHour._id;
    });

    test('POST /api/tasks/:taskId/loghours: Owner can log time as well', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hours: 2,
          date: '2026-09-16',
          note: 'Reviewed architecture and merged pull request',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.logHour.hours, 2);
      const returnedOwnerId = res.body.logHour.userId?._id || res.body.logHour.userId;
      assert.equal(returnedOwnerId.toString(), ownerId.toString());
    });

    test('POST /api/tasks/:taskId/loghours: Viewer is blocked with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          hours: 1,
          date: '2026-09-17',
        });

      assert.equal(res.status, 403);
    });

    test('POST /api/tasks/:taskId/loghours: Validates hours bounds (0.25 to 24), valid date, and max note length', async () => {
      // Negative / zero hours
      const resZero = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ hours: 0, date: '2026-09-15' });
      assert.equal(resZero.status, 400);

      // Exceeds 24 hours
      const resOver24 = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ hours: 25, date: '2026-09-15' });
      assert.equal(resOver24.status, 400);

      // Invalid date
      const resBadDate = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ hours: 4, date: 'not-a-valid-date' });
      assert.equal(resBadDate.status, 400);

      // Oversized note (>300 chars)
      const resLongNote = await request(app)
        .post(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ hours: 2, date: '2026-09-15', note: 'A'.repeat(301) });
      assert.equal(resLongNote.status, 400);
    });
  });

  describe('2. Log Hours Retrieval & Running Total', () => {
    test('GET /api/tasks/:taskId/loghours: Any member including viewer gets 200 list with computed total', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.logHours));
      assert.equal(res.body.logHours.length, 2);

      // Total hours: 3.5 + 2 = 5.5
      assert.equal(res.body.totalHours, 5.5);

      // Check most-recent-date-first ordering (Sep 16 before Sep 15)
      const firstDate = new Date(res.body.logHours[0].date).getTime();
      const secondDate = new Date(res.body.logHours[1].date).getTime();
      assert.ok(firstDate >= secondDate);
    });

    test('GET /api/tasks/:taskId/loghours: Non-member gets 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/loghours`)
        .set('Authorization', `Bearer ${nonMemberToken}`);

      assert.equal(res.status, 403);
    });
  });

  describe('3. Strict Author or Workspace Owner Permissions on Edit & Delete', () => {
    test('PATCH /api/tasks/:taskId/loghours/:logId: DIFFERENT editor gets 403 Forbidden trying to edit someone else\'s log', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/loghours/${createdLogId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`)
        .send({ hours: 4 });

      assert.equal(res.status, 403);
      assert.match(res.body.message, /author or workspace owner/i);
    });

    test('DELETE /api/tasks/:taskId/loghours/:logId: DIFFERENT editor gets 403 Forbidden trying to delete someone else\'s log', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/loghours/${createdLogId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`);

      assert.equal(res.status, 403);
      assert.match(res.body.message, /author or workspace owner/i);
    });

    test('PATCH /api/tasks/:taskId/loghours/:logId: Author CAN edit their own log entry', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/loghours/${createdLogId}`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({
          hours: 4.5,
          note: 'Updated note: final profiling completed',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.logHour.hours, 4.5);
      assert.equal(res.body.logHour.note, 'Updated note: final profiling completed');
    });

    test('PATCH /api/tasks/:taskId/loghours/:logId: Workspace owner CAN edit any user\'s log entry', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${taskId}/loghours/${createdLogId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          hours: 5,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.logHour.hours, 5);
    });

    test('DELETE /api/tasks/:taskId/loghours/:logId: Workspace owner CAN delete any user\'s log entry', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/loghours/${createdLogId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify deletion in database
      const found = await LogHour.findById(createdLogId);
      assert.equal(found, null);
    });
  });

  describe('4. ActivityLog & Task Cascade Cleanup', () => {
    test('ActivityLog records loghour_created, loghour_updated, and loghour_deleted', async () => {
      const logs = await ActivityLog.find({
        workspaceId,
        targetType: 'loghour',
      });

      assert.ok(logs.length >= 3);
      assert.ok(logs.some((l) => l.actionType === 'loghour_created'));
      assert.ok(logs.some((l) => l.actionType === 'loghour_updated'));
      assert.ok(logs.some((l) => l.actionType === 'loghour_deleted'));
    });

    test('Deleting parent task cascades and removes all remaining LogHour documents', async () => {
      // Create a new task and log hours on it
      const tempTaskRes = await request(app)
        .post(`/api/lists/${listId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Task to be deleted', order: 5 });
      const tempTaskId = tempTaskRes.body.task._id;

      await request(app)
        .post(`/api/tasks/${tempTaskId}/loghours`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ hours: 2, date: '2026-09-17' });

      const beforeDeleteCount = await LogHour.countDocuments({ taskId: tempTaskId });
      assert.equal(beforeDeleteCount, 1);

      // Delete the parent task
      const delRes = await request(app)
        .delete(`/api/tasks/${tempTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      assert.equal(delRes.status, 200);

      // Verify LogHour documents were cascade-deleted
      const afterDeleteCount = await LogHour.countDocuments({ taskId: tempTaskId });
      assert.equal(afterDeleteCount, 0);
    });
  });
});
