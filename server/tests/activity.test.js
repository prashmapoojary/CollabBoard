import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';

import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Workspace } from '../src/models/Workspace.js';
import { Project } from '../src/models/Project.js';
import { List } from '../src/models/List.js';
import { Task } from '../src/models/Task.js';
import { ActivityLog } from '../src/models/ActivityLog.js';

describe('ActivityLog & Audit Trail Test Suite (Step 6)', () => {
  const ownerUser = {
    name: 'Audit Owner',
    email: 'audit_owner_test@collabboard.io',
    password: 'Password123!',
  };

  const editorUser = {
    name: 'Audit Editor',
    email: 'audit_editor_test@collabboard.io',
    password: 'Password123!',
  };

  const secondEditorUser = {
    name: 'Audit Second Editor',
    email: 'audit_editor2_test@collabboard.io',
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'Audit Viewer',
    email: 'audit_viewer_test@collabboard.io',
    password: 'Password123!',
  };

  const outsiderUser = {
    name: 'Audit Outsider',
    email: 'audit_outsider_test@collabboard.io',
    password: 'Password123!',
  };

  let ownerToken = '';
  let editorToken = '';
  let secondEditorToken = '';
  let viewerToken = '';
  let outsiderToken = '';

  let ownerId = '';
  let editorId = '';
  let secondEditorId = '';
  let viewerId = '';
  let outsiderId = '';

  let workspaceId = '';
  let projectId = '';
  let list1Id = '';
  let list2Id = '';

  // Polling helper to wait for non-blocking async activity logging
  async function waitForLog(query, timeoutMs = 8000, intervalMs = 150) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const log = await ActivityLog.findOne(query).sort({ createdAt: -1 });
      if (log) return log;
      await new Promise((res) => setTimeout(res, intervalMs));
    }
    return null;
  }

  // Helper to ensure no log entry was created
  async function assertNoLog(query, waitMs = 1000) {
    await new Promise((res) => setTimeout(res, waitMs));
    const log = await ActivityLog.findOne(query);
    assert.equal(log, null, `Expected no log matching ${JSON.stringify(query)}, but found one.`);
  }

  before(async () => {
    await connectDB();

    // Clean up test users and data
    await User.deleteMany({
      email: {
        $in: [
          ownerUser.email,
          editorUser.email,
          secondEditorUser.email,
          viewerUser.email,
          outsiderUser.email,
        ],
      },
    });
    await Workspace.deleteMany({ name: /Audit Workspace/i });

    // Register test users
    const ownerRes = await request(app).post('/api/auth/signup').send(ownerUser);
    ownerToken = ownerRes.body.accessToken;
    ownerId = ownerRes.body.user._id;

    const editorRes = await request(app).post('/api/auth/signup').send(editorUser);
    editorToken = editorRes.body.accessToken;
    editorId = editorRes.body.user._id;

    const secondEditorRes = await request(app).post('/api/auth/signup').send(secondEditorUser);
    secondEditorToken = secondEditorRes.body.accessToken;
    secondEditorId = secondEditorRes.body.user._id;

    const viewerRes = await request(app).post('/api/auth/signup').send(viewerUser);
    viewerToken = viewerRes.body.accessToken;
    viewerId = viewerRes.body.user._id;

    const outsiderRes = await request(app).post('/api/auth/signup').send(outsiderUser);
    outsiderToken = outsiderRes.body.accessToken;
    outsiderId = outsiderRes.body.user._id;

    // Create workspace
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Audit Workspace Test' });
    workspaceId = wsRes.body.workspace._id;

    // Add members: editor, second editor, viewer
    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: {
        members: {
          $each: [
            { userId: editorId, role: 'editor', joinedAt: new Date() },
            { userId: secondEditorId, role: 'editor', joinedAt: new Date() },
            { userId: viewerId, role: 'viewer', joinedAt: new Date() },
          ],
        },
      },
    });

    // Create project
    const projRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Audit Board Primary' });
    projectId = projRes.body.project._id;

    // Create two lists
    const list1Res = await request(app)
      .post(`/api/projects/${projectId}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Audit Backlog', order: 0 });
    list1Id = list1Res.body.list._id;

    const list2Res = await request(app)
      .post(`/api/projects/${projectId}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Audit In Progress', order: 1 });
    list2Id = list2Res.body.list._id;
  });

  after(async () => {
    // Clean up all collections
    if (workspaceId) {
      await ActivityLog.deleteMany({ workspaceId });
      await Task.deleteMany({ projectId });
      await List.deleteMany({ projectId });
      await Project.deleteMany({ workspaceId });
      await Workspace.findByIdAndDelete(workspaceId);
    }
    await User.deleteMany({
      email: {
        $in: [
          ownerUser.email,
          editorUser.email,
          secondEditorUser.email,
          viewerUser.email,
          outsiderUser.email,
        ],
      },
    });
    await disconnectDB();
  });

  describe('1. Mutation Log Entry Shapes (Spot-Checks)', () => {
    let createdTaskId = '';

    test('task_created: logs entry with targetType "task", metadata.after, and null metadata.before', async () => {
      const res = await request(app)
        .post(`/api/lists/${list1Id}/tasks`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Audit Task 1',
          description: 'Initial description',
          order: 0,
          taskType: 'bug',
        });

      assert.equal(res.status, 201);
      createdTaskId = res.body.task._id;

      const log = await waitForLog({
        actionType: 'task_created',
        targetId: createdTaskId,
      });

      assert.ok(log, 'task_created log entry should exist');
      assert.equal(log.targetType, 'task');
      assert.equal(log.workspaceId.toString(), workspaceId.toString());
      assert.equal(log.projectId.toString(), projectId.toString());
      assert.equal(log.actorId.toString(), editorId.toString());
      assert.equal(log.metadata.before, null);
      assert.equal(log.metadata.after.title, 'Audit Task 1');
      assert.equal(log.metadata.after.description, 'Initial description');
      assert.equal(log.metadata.after.taskType, 'bug');
    });

    test('task_moved: logs entry with targetType "task" and changed listId/order in before/after', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}/move`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          listId: list2Id,
          order: 5,
        });

      assert.equal(res.status, 200);

      const log = await waitForLog({
        actionType: 'task_moved',
        targetId: createdTaskId,
      });

      assert.ok(log, 'task_moved log entry should exist');
      assert.equal(log.targetType, 'task');
      assert.equal(log.metadata.before.listId, list1Id.toString());
      assert.equal(log.metadata.after.listId, list2Id.toString());
      assert.equal(log.metadata.after.order, 5);
    });

    test('list_updated: list rename logs targetType "list" with diffed title', async () => {
      const res = await request(app)
        .patch(`/api/lists/${list1Id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Audit Backlog Renamed' });

      assert.equal(res.status, 200);

      const log = await waitForLog({
        actionType: 'list_updated',
        targetId: list1Id,
      });

      assert.ok(log, 'list_updated log entry should exist');
      assert.equal(log.targetType, 'list');
      assert.equal(log.metadata.before.title, 'Audit Backlog');
      assert.equal(log.metadata.after.title, 'Audit Backlog Renamed');
      // Order did not change, so it should not be in metadata.before or metadata.after
      assert.equal(log.metadata.before.order, undefined);
      assert.equal(log.metadata.after.order, undefined);
    });

    test('member_role_changed: logs targetType "member" with role diff', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${secondEditorId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'viewer' });

      assert.equal(res.status, 200);

      const log = await waitForLog({
        actionType: 'member_role_changed',
        targetId: secondEditorId,
      });

      assert.ok(log, 'member_role_changed log entry should exist');
      assert.equal(log.targetType, 'member');
      assert.equal(log.metadata.before.role, 'editor');
      assert.equal(log.metadata.after.role, 'viewer');
      assert.equal(log.actorId.toString(), ownerId.toString());
    });

    test('project_deleted: logs targetType "project" with before title and null after', async () => {
      // Create a temporary project to delete
      const createProjRes = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Temporary Delete Project' });

      const tempProjId = createProjRes.body.project._id;

      const deleteRes = await request(app)
        .delete(`/api/projects/${tempProjId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(deleteRes.status, 200);

      const log = await waitForLog({
        actionType: 'project_deleted',
        targetId: tempProjId,
      });

      assert.ok(log, 'project_deleted log entry should exist');
      assert.equal(log.targetType, 'project');
      assert.equal(log.metadata.before.title, 'Temporary Delete Project');
      assert.equal(log.metadata.after, null);
    });
  });

  describe('2. Field-Level Diffing on Updates', () => {
    let diffTaskId = '';

    before(async () => {
      const taskRes = await request(app)
        .post(`/api/lists/${list1Id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Diff Original Title',
          description: 'Stable description',
          order: 1,
          taskType: 'bug',
          labels: [{ name: 'backend', color: '#ff0000' }],
        });
      diffTaskId = taskRes.body.task._id;
    });

    test('Updating single field (title) only includes that field in metadata.before/after', async () => {
      const updateRes = await request(app)
        .patch(`/api/tasks/${diffTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Diff Updated Title' });

      assert.equal(updateRes.status, 200);

      const log = await waitForLog({
        actionType: 'task_updated',
        targetId: diffTaskId,
        'metadata.after.title': 'Diff Updated Title',
      });

      assert.ok(log, 'task_updated log entry should exist');
      assert.equal(log.metadata.before.title, 'Diff Original Title');
      assert.equal(log.metadata.after.title, 'Diff Updated Title');

      // Unchanged fields must NOT be present in before or after
      assert.equal(log.metadata.before.description, undefined);
      assert.equal(log.metadata.after.description, undefined);
      assert.equal(log.metadata.before.order, undefined);
      assert.equal(log.metadata.after.order, undefined);
      assert.equal(log.metadata.before.labels, undefined);
      assert.equal(log.metadata.after.labels, undefined);
    });

    test('Updating multiple fields (description & labels) only includes those two fields', async () => {
      const updateRes = await request(app)
        .patch(`/api/tasks/${diffTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          description: 'Brand new description',
          labels: [{ name: 'frontend', color: '#00ff00' }],
        });

      assert.equal(updateRes.status, 200);

      const log = await waitForLog({
        actionType: 'task_updated',
        targetId: diffTaskId,
        'metadata.after.description': 'Brand new description',
      });

      assert.ok(log, 'task_updated log entry should exist');
      assert.equal(log.metadata.before.description, 'Stable description');
      assert.equal(log.metadata.after.description, 'Brand new description');
      assert.deepEqual(log.metadata.before.labels, [{ name: 'backend', color: '#ff0000' }]);
      assert.deepEqual(log.metadata.after.labels, [{ name: 'frontend', color: '#00ff00' }]);

      // Title & order were unchanged
      assert.equal(log.metadata.before.title, undefined);
      assert.equal(log.metadata.after.title, undefined);
      assert.equal(log.metadata.before.order, undefined);
      assert.equal(log.metadata.after.order, undefined);
    });
  });

  describe('3. Exclusion of Blocked / 403 Mutations', () => {
    test('A mutation blocked by workspaceRoleMiddleware (viewer list create 403) produces NO log entry', async () => {
      const beforeCount = await ActivityLog.countDocuments({
        workspaceId,
        actionType: 'list_created',
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/lists`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'Illegal Viewer List', order: 99 });

      assert.equal(res.status, 403);

      await assertNoLog({
        workspaceId,
        'metadata.after.title': 'Illegal Viewer List',
      });

      const afterCount = await ActivityLog.countDocuments({
        workspaceId,
        actionType: 'list_created',
      });
      assert.equal(beforeCount, afterCount);
    });

    test('A mutation blocked by ownershipMiddleware (non-creator editor 403) produces NO log entry', async () => {
      // Create task as owner
      const taskRes = await request(app)
        .post(`/api/lists/${list1Id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Owner Only Task', order: 0 });
      const ownerTaskId = taskRes.body.task._id;

      // Editor attempts to edit owner's task (not creator, not assignee)
      const res = await request(app)
        .patch(`/api/tasks/${ownerTaskId}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Hacked Title' });

      assert.equal(res.status, 403);

      await assertNoLog({
        actionType: 'task_updated',
        targetId: ownerTaskId,
        'metadata.after.title': 'Hacked Title',
      });
    });
  });

  describe('4. Pagination on GET /api/projects/:projectId/activity', () => {
    let paginationProjectId = '';

    before(async () => {
      // Create an isolated project for pagination tests
      const pRes = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Audit Board Pagination' });
      paginationProjectId = pRes.body.project._id;

      // Wait for background project_created log to settle, then clear to ensure precise count
      await new Promise((res) => setTimeout(res, 800));
      await ActivityLog.deleteMany({ projectId: paginationProjectId });

      // Seed 25 activity log entries directly for this project
      const seedEntries = [];
      const baseTime = Date.now();
      for (let i = 1; i <= 25; i++) {
        seedEntries.push({
          workspaceId,
          projectId: paginationProjectId,
          actorId: ownerId,
          actionType: 'task_created',
          targetType: 'task',
          targetId: new User()._id,
          metadata: {
            before: null,
            after: { title: `Seed Task ${i}` },
          },
          createdAt: new Date(baseTime + i * 1000), // strictly ascending
        });
      }
      await ActivityLog.insertMany(seedEntries);
    });

    test('Default pagination returns first page with default limit 20, descending sort', async () => {
      const res = await request(app)
        .get(`/api/projects/${paginationProjectId}/activity`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.limit, 20);
      assert.equal(res.body.total, 25);
      assert.equal(res.body.totalPages, 2);
      assert.equal(res.body.entries.length, 20);

      // Most-recent-first: first item should be Seed Task 25
      assert.equal(res.body.entries[0].metadata.after.title, 'Seed Task 25');
    });

    test('Custom page & limit works across >20 entries with non-overlapping pages', async () => {
      // Page 1 with limit 10
      const page1Res = await request(app)
        .get(`/api/projects/${paginationProjectId}/activity?page=1&limit=10`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(page1Res.status, 200);
      assert.equal(page1Res.body.entries.length, 10);
      assert.equal(page1Res.body.totalPages, 3);
      const page1Ids = page1Res.body.entries.map((e) => e._id);

      // Page 2 with limit 10
      const page2Res = await request(app)
        .get(`/api/projects/${paginationProjectId}/activity?page=2&limit=10`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(page2Res.status, 200);
      assert.equal(page2Res.body.entries.length, 10);
      const page2Ids = page2Res.body.entries.map((e) => e._id);

      // Verify no overlap between page 1 and page 2
      const intersection = page1Ids.filter((id) => page2Ids.includes(id));
      assert.equal(intersection.length, 0, 'Page 1 and Page 2 should not share entries');

      // Page 3 with limit 10 (remaining 5 items)
      const page3Res = await request(app)
        .get(`/api/projects/${paginationProjectId}/activity?page=3&limit=10`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(page3Res.status, 200);
      assert.equal(page3Res.body.entries.length, 5);
    });

    test('Limit parameter clamps to maximum of 100', async () => {
      const res = await request(app)
        .get(`/api/projects/${paginationProjectId}/activity?limit=250`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.limit, 100);
    });
  });

  describe('5. Access Control & Population on Activity Endpoint', () => {
    test('Viewer CAN call GET /api/projects/:projectId/activity', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.entries));
      assert.ok(res.body.total > 0);

      // Verify actor population: has name & avatarUrl, but NO password
      const entryWithActor = res.body.entries.find((e) => e.actor && e.actor.name);
      assert.ok(entryWithActor, 'At least one entry should have populated actor');
      assert.ok(entryWithActor.actor.name, 'Actor must have name');
      assert.equal(entryWithActor.actor.password, undefined, 'Actor must not expose password');
    });

    test('Non-workspace member (outsider) is blocked with 403', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/activity`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });

    test('Non-existent project ID returns 404', async () => {
      const fakeId = new User()._id;
      const res = await request(app)
        .get(`/api/projects/${fakeId}/activity`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 404);
    });
  });

  describe('6. Non-Blocking Resilience', () => {
    test('A simulated logging failure does NOT cause the original mutation response to fail', async () => {
      // Temporarily mock ActivityLog.create to throw an error
      const originalCreate = ActivityLog.create;
      ActivityLog.create = async () => {
        throw new Error('Simulated Database Crash in ActivityLog');
      };

      try {
        // Perform a mutation that should succeed even though logger fails
        const res = await request(app)
          .post(`/api/lists/${list1Id}/tasks`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({
            title: 'Resilient Task Created Despite Logging Failure',
            order: 99,
          });

        assert.equal(res.status, 201, 'Mutation should succeed with 201 despite logging failure');
        assert.ok(res.body.task, 'Task document must be returned in REST response');
        assert.equal(res.body.task.title, 'Resilient Task Created Despite Logging Failure');

        // Confirm task was truly saved to database
        const savedTask = await Task.findById(res.body.task._id);
        assert.ok(savedTask, 'Task must exist in DB');
      } finally {
        // Restore original ActivityLog.create
        ActivityLog.create = originalCreate;
      }
    });
  });
});
