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
import { Comment } from '../src/models/Comment.js';
import { ActivityLog } from '../src/models/ActivityLog.js';

describe('Comments on Tasks Test Suite (Step 13)', () => {
  const ts = Date.now();
  const ownerUser = {
    name: 'Comment Owner',
    email: `comm_owner_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const authorEditorUser = {
    name: 'Author Editor',
    email: `comm_author_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const otherEditorUser = {
    name: 'Other Editor',
    email: `comm_other_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'Comment Viewer',
    email: `comm_viewer_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  let ownerToken, authorToken, otherEditorToken, viewerToken;
  let workspaceId, projectId, listId, taskId;

  before(async () => {
    await connectDB();

    // 1. Sign up all test users
    const [resOwner, resAuthor, resOther, resViewer] = await Promise.all([
      request(app).post('/api/auth/signup').send(ownerUser),
      request(app).post('/api/auth/signup').send(authorEditorUser),
      request(app).post('/api/auth/signup').send(otherEditorUser),
      request(app).post('/api/auth/signup').send(viewerUser),
    ]);

    ownerToken = resOwner.body.accessToken;
    authorToken = resAuthor.body.accessToken;
    otherEditorToken = resOther.body.accessToken;
    viewerToken = resViewer.body.accessToken;

    // 2. Create Workspace as Owner
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Comment WS ${ts}` });
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

    // 4. Create Project
    const projRes = await request(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Comment Project' });
    projectId = projRes.body.project._id;

    // Find default "To Do" list
    const getProj = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const todoList = getProj.body.project.lists.find((l) => l.title === 'To Do');
    listId = todoList._id;

    // 5. Create Task
    const taskRes = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Task for Comments',
        taskType: 'task',
        priority: 'medium',
        order: 0,
      });
    taskId = taskRes.body.task._id;
  });

  after(async () => {
    try {
      if (workspaceId) {
        await Comment.deleteMany({ taskId });
        await Task.deleteMany({ projectId });
        await List.deleteMany({ projectId });
        await Project.deleteMany({ workspaceId });
        await ActivityLog.deleteMany({ workspaceId });
        await Workspace.findByIdAndDelete(workspaceId);
      }
      await User.deleteMany({
        email: {
          $in: [
            ownerUser.email,
            authorEditorUser.email,
            otherEditorUser.email,
            viewerUser.email,
          ],
        },
      });
    } catch {
      // Ignore cleanup error
    } finally {
      await disconnectDB();
    }
  });

  describe('1. Comment Creation & Permissions', () => {
    test('POST /api/tasks/:taskId/comments: Editor can create comment on task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ text: 'Hello from Author Editor!' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.comment.text, 'Hello from Author Editor!');
      assert.equal(res.body.comment.taskId, taskId.toString());
      assert.ok(res.body.comment.author);
      assert.equal(res.body.comment.author.name, authorEditorUser.name);
    });

    test('POST /api/tasks/:taskId/comments: Owner can create comment on task', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ text: 'Hello from Owner!' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.comment.text, 'Hello from Owner!');
    });

    test('POST /api/tasks/:taskId/comments: Viewer gets 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ text: 'Viewer trying to comment' });

      assert.equal(res.status, 403);
    });

    test('POST /api/tasks/:taskId/comments: Rejects empty text with 400', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ text: '   ' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('POST /api/tasks/:taskId/comments: Rejects text exceeding 2000 characters with 400', async () => {
      const longText = 'a'.repeat(2001);
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ text: longText });

      assert.equal(res.status, 400);
    });
  });

  describe('2. Comment Retrieval & Pagination', () => {
    test('GET /api/tasks/:taskId/comments: Viewer can read comments (200) sorted oldest-first', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.comments));
      assert.ok(res.body.comments.length >= 2);

      // Verify oldest first
      const firstTime = new Date(res.body.comments[0].createdAt).getTime();
      const secondTime = new Date(res.body.comments[1].createdAt).getTime();
      assert.ok(firstTime <= secondTime);
    });

    test('GET /api/tasks/:taskId/comments: Pagination with limit works', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/comments?page=1&limit=1`)
        .set('Authorization', `Bearer ${authorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.comments.length, 1);
      assert.ok(res.body.totalPages >= 2);
      assert.ok(res.body.total >= 2);
    });
  });

  describe('3. Comment Deletion & Ownership Permissions', () => {
    let commentToDeleteId;

    before(async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ text: 'Comment specifically for delete test' });
      commentToDeleteId = res.body.comment._id;
    });

    test('DELETE: Non-author, non-owner editor gets 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/comments/${commentToDeleteId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`);

      assert.equal(res.status, 403);
      assert.match(res.body.message, /Only the comment author or the workspace owner/);
    });

    test('DELETE: Viewer gets 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/comments/${commentToDeleteId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 403);
    });

    test('DELETE: Comment author can delete own comment (200 OK)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${taskId}/comments/${commentToDeleteId}`)
        .set('Authorization', `Bearer ${authorToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify it no longer exists
      const checkRes = await request(app)
        .get(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`);
      const found = checkRes.body.comments.some((c) => c._id === commentToDeleteId);
      assert.equal(found, false);
    });

    test('DELETE: Workspace owner can delete another user\'s comment (200 OK)', async () => {
      // Create comment by author
      const createRes = await request(app)
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authorToken}`)
        .send({ text: 'Author comment to be deleted by owner' });
      const idToDelete = createRes.body.comment._id;

      // Delete by owner
      const delRes = await request(app)
        .delete(`/api/tasks/${taskId}/comments/${idToDelete}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);
    });
  });

  describe('4. ActivityLog Audit Trail Integration', () => {
    test('ActivityLog records comment_created and comment_deleted entries', async () => {
      // Allow async logger to finish writing
      await new Promise((r) => setTimeout(r, 600));

      const logs = await ActivityLog.find({
        workspaceId,
        actionType: { $in: ['comment_created', 'comment_deleted'] },
      });

      assert.ok(logs.length > 0);
      const createdLog = logs.find((l) => l.actionType === 'comment_created');
      assert.ok(createdLog);
      assert.equal(createdLog.targetType, 'comment');
      assert.ok(createdLog.metadata.after.text);

      const deletedLog = logs.find((l) => l.actionType === 'comment_deleted');
      assert.ok(deletedLog);
      assert.equal(deletedLog.targetType, 'comment');
      assert.ok(deletedLog.metadata.before.text);
    });
  });
});
