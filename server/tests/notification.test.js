import { test, describe, before, after, beforeEach } from 'node:test';
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
import { emailDeliveryHistory, clearEmailHistory } from '../src/services/emailService.js';

describe('Notifications & Email Dispatch Test Suite (Step 17)', () => {
  const ts = Date.now();
  const ownerUser = {
    name: 'Notification Owner',
    email: `notif_owner_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const memberA = {
    name: 'Assignee Alpha',
    email: `notif_alpha_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const memberB = {
    name: 'Assignee Beta',
    email: `notif_beta_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  let ownerToken, memberAToken, memberBToken;
  let ownerId, memberAId, memberBId;
  let workspaceId, projectId, listId;

  // Helper to wait for background fire-and-forget email dispatches
  const waitForDelivery = async (predicate, timeoutMs = 2500) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate(emailDeliveryHistory)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return predicate(emailDeliveryHistory);
  };

  before(async () => {
    await connectDB();

    // 1. Sign up test users
    const [resOwner, resA, resB] = await Promise.all([
      request(app).post('/api/auth/signup').send(ownerUser),
      request(app).post('/api/auth/signup').send(memberA),
      request(app).post('/api/auth/signup').send(memberB),
    ]);

    ownerToken = resOwner.body.accessToken;
    ownerId = resOwner.body.user._id;

    memberAToken = resA.body.accessToken;
    memberAId = resA.body.user._id;

    memberBToken = resB.body.accessToken;
    memberBId = resB.body.user._id;

    // 2. Create workspace as owner
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Notifications Test Workspace ${ts}` });

    workspaceId = wsRes.body.workspace._id;

    // 3. Create project in workspace
    const projRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Notification Project ${ts}` });

    projectId = projRes.body.project._id;

    // 4. Create list in project
    const listRes = await request(app)
      .post(`/api/projects/${projectId}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'To Do', order: 1 });

    listId = listRes.body.list._id;
  });

  after(async () => {
    await Task.deleteMany({ projectId });
    await List.deleteMany({ projectId });
    await Project.deleteMany({ workspaceId });
    await Workspace.deleteMany({ _id: workspaceId });
    await User.deleteMany({
      email: { $in: [ownerUser.email, memberA.email, memberB.email] },
    });
    await disconnectDB();
  });

  beforeEach(() => {
    clearEmailHistory();
  });

  describe('1. Workspace Invite Email Notifications', () => {
    test('POST /api/workspaces/:id/invite sends invitation email in background without blocking response', async () => {
      const startTime = Date.now();

      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: memberA.email, role: 'editor' });

      const duration = Date.now() - startTime;

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Ensure HTTP response is fast (< 10000ms under remote Atlas test load)
      assert.ok(duration < 10000, `Expected instant non-blocking response, took ${duration}ms`);

      // Wait for background delivery
      const delivered = await waitForDelivery((hist) =>
        hist.some((e) => e.type === 'workspace_invite' && e.toEmail === memberA.email.toLowerCase())
      );

      assert.ok(delivered, 'Expected workspace invite email to be dispatched');
      const email = emailDeliveryHistory.find(
        (e) => e.type === 'workspace_invite' && e.toEmail === memberA.email.toLowerCase()
      );
      assert.equal(email.inviterName, ownerUser.name);
      assert.equal(email.role, 'editor');
    });
  });

  describe('2. Task Assignment Email Notifications', () => {
    let createdTaskId;

    test('POST /api/lists/:listId/tasks with assignees sends assignment email to assigned user', async () => {
      const res = await request(app)
        .post(`/api/lists/${listId}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Implement Notification System',
          description: 'Deliver Step 17 notifications',
          order: 1,
          assignees: [memberAId],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      createdTaskId = res.body.task._id;

      const delivered = await waitForDelivery((hist) =>
        hist.some((e) => e.type === 'task_assignment' && e.toEmail === memberA.email.toLowerCase())
      );

      assert.ok(delivered, 'Expected task assignment email to be dispatched to Member A');
      const email = emailDeliveryHistory.find(
        (e) => e.type === 'task_assignment' && e.toEmail === memberA.email.toLowerCase()
      );
      assert.equal(email.taskTitle, 'Implement Notification System');
      assert.equal(email.assigneeName, memberA.name);
      assert.equal(email.assignerName, ownerUser.name);
    });

    test('PATCH /api/tasks/:id with newly added assignee emails ONLY the new assignee', async () => {
      // Add memberB as an assignee while retaining memberA
      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          assignees: [memberAId, memberBId],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Wait for email to memberB
      const delivered = await waitForDelivery((hist) =>
        hist.some((e) => e.type === 'task_assignment' && e.toEmail === memberB.email.toLowerCase())
      );

      assert.ok(delivered, 'Expected task assignment email to Member B');

      // Verify that memberA did NOT get a duplicate assignment email
      const memberAEmails = emailDeliveryHistory.filter(
        (e) => e.type === 'task_assignment' && e.toEmail === memberA.email.toLowerCase()
      );
      assert.equal(
        memberAEmails.length,
        0,
        'Member A was already assigned previously and must not receive a duplicate email'
      );

      const memberBEmails = emailDeliveryHistory.filter(
        (e) => e.type === 'task_assignment' && e.toEmail === memberB.email.toLowerCase()
      );
      assert.equal(memberBEmails.length, 1, 'Member B must receive exactly 1 assignment email');
      assert.equal(memberBEmails[0].assigneeName, memberB.name);
    });

    test('PATCH /api/tasks/:id without changes to assignees does not trigger any assignment emails', async () => {
      clearEmailHistory();

      const res = await request(app)
        .patch(`/api/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Implement Notification System (Updated Title)',
          priority: 'urgent',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Wait a short duration to ensure no asynchronous emails are fired
      await new Promise((resolve) => setTimeout(resolve, 300));

      assert.equal(
        emailDeliveryHistory.length,
        0,
        'No emails should be dispatched when assignees are untouched'
      );
    });
  });
});
