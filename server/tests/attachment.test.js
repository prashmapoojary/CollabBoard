import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

process.env.NODE_ENV = 'test';

import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Workspace } from '../src/models/Workspace.js';
import { Project } from '../src/models/Project.js';
import { Task } from '../src/models/Task.js';
import { Attachment } from '../src/models/Attachment.js';
import { ActivityLog } from '../src/models/ActivityLog.js';
import { UPLOADS_DIR } from '../src/middleware/uploadMiddleware.js';

describe('Attachments on Tasks Test Suite (Step 15 - Part C)', () => {
  const ts = Date.now();
  const ownerUser = {
    name: 'Attach Owner',
    email: `att_owner_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const uploaderEditorUser = {
    name: 'Attach Uploader Editor',
    email: `att_uploader_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const otherEditorUser = {
    name: 'Attach Other Editor',
    email: `att_other_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'Attach Viewer',
    email: `att_viewer_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  const nonMemberUser = {
    name: 'Attach NonMember',
    email: `att_nonmember_${ts}@collabboard.io`,
    password: 'Password123!',
  };

  let ownerToken, uploaderToken, otherEditorToken, viewerToken, nonMemberToken;
  let workspaceId, projectId, listId, taskId;

  before(async () => {
    await connectDB();

    // 1. Sign up test users
    const [resOwner, resUploader, resOther, resViewer, resNonMember] = await Promise.all([
      request(app).post('/api/auth/signup').send(ownerUser),
      request(app).post('/api/auth/signup').send(uploaderEditorUser),
      request(app).post('/api/auth/signup').send(otherEditorUser),
      request(app).post('/api/auth/signup').send(viewerUser),
      request(app).post('/api/auth/signup').send(nonMemberUser),
    ]);

    ownerToken = resOwner.body.accessToken;
    uploaderToken = resUploader.body.accessToken;
    otherEditorToken = resOther.body.accessToken;
    viewerToken = resViewer.body.accessToken;
    nonMemberToken = resNonMember.body.accessToken;

    // 2. Create Workspace as Owner
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Attach WS ${ts}` });
    workspaceId = wsRes.body.workspace._id;

    // 3. Invite members
    await request(app)
      .post(`/api/workspaces/${workspaceId}/invite`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: uploaderEditorUser.email, role: 'editor' });

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
      .send({ title: 'Attach Project' });
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
        title: 'Task for File Uploads',
        description: 'Testing attachments',
        order: 0,
      });
    taskId = taskRes.body.task._id;
  });

  after(async () => {
    try {
      if (workspaceId) {
        // Clean up DB
        await Workspace.findByIdAndDelete(workspaceId);
        await Project.deleteMany({ workspaceId });
        await Task.deleteMany({ projectId });
        const attachments = await Attachment.find({ taskId });
        for (const a of attachments) {
          try {
            const p = path.join(UPLOADS_DIR, a.storedFilename);
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch (e) {}
        }
        await Attachment.deleteMany({ taskId });
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

  describe('1. File Upload & Validation', () => {
    test('POST /api/tasks/:taskId/attachments: Editor can upload a file (201)', async () => {
      const buffer = Buffer.from('Hello CollabBoard file attachment contents');

      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('file', buffer, 'notes.txt');

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.attachment.filename, 'notes.txt');
      assert.ok(res.body.attachment.storedFilename);
      assert.ok(res.body.attachment.sizeBytes > 0);

      // Verify file exists on disk
      const filePath = path.join(UPLOADS_DIR, res.body.attachment.storedFilename);
      assert.equal(fs.existsSync(filePath), true, 'File must exist on disk');

      // Verify activity log
      const log = await findLogWithRetry({
        actionType: 'attachment_created',
        targetId: res.body.attachment._id,
      });
      assert.ok(log, 'Activity log must be created for attachment_created');
      assert.equal(log.targetType, 'attachment');
      assert.equal(log.metadata.after.filename, 'notes.txt');
    });

    test('POST /api/tasks/:taskId/attachments: Viewer gets 403 Forbidden', async () => {
      const buffer = Buffer.from('Viewer file content');

      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('file', buffer, 'viewer_doc.pdf');

      assert.equal(res.status, 403);
    });

    test('POST /api/tasks/:taskId/attachments: Rejects dangerous executable script (.exe) with 400', async () => {
      const buffer = Buffer.from('MZ binary executable content');

      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('file', buffer, 'malicious.exe');

      assert.equal(res.status, 400);
      assert.match(res.body.message, /not allowed/i);
    });

    test('POST /api/tasks/:taskId/attachments: Rejects oversized file (>10MB) with 400', async () => {
      // 10MB + 1KB buffer
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1024);

      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('file', oversized, 'huge_file.zip');

      assert.equal(res.status, 400);
      assert.match(res.body.message, /10MB limit/i);
    });
  });

  describe('2. Attachment Retrieval & Download', () => {
    let attachmentId;

    before(async () => {
      const buffer = Buffer.from('PDF Document mock content for download test');
      const uploadRes = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('file', buffer, 'spec.pdf');
      attachmentId = uploadRes.body.attachment._id;
    });

    test('GET /api/tasks/:taskId/attachments: Any member including viewer gets 200 list', async () => {
      const res = await request(app)
        .get(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.attachments));
      assert.ok(res.body.attachments.length >= 1);
      assert.ok(res.body.attachments.some((a) => a.filename === 'spec.pdf'));
    });

    test('GET /api/attachments/:id/download: Workspace member can download file (200)', async () => {
      const res = await request(app)
        .get(`/api/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .buffer();

      assert.equal(res.status, 200);
      assert.match(res.headers['content-disposition'], /spec\.pdf/);
      assert.equal((res.text || res.body?.toString()), 'PDF Document mock content for download test');
    });

    test('GET /api/attachments/:id/download: Non-member is blocked with 403', async () => {
      const res = await request(app)
        .get(`/api/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${nonMemberToken}`);

      assert.equal(res.status, 403);
    });
  });

  describe('3. Attachment Deletion & Disk Cleanup', () => {
    let attachmentToDeleteId;
    let storedFilenameToDelete;

    before(async () => {
      const buffer = Buffer.from('File to be deleted');
      const uploadRes = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .attach('file', buffer, 'temp_to_delete.txt');
      attachmentToDeleteId = uploadRes.body.attachment._id;
      storedFilenameToDelete = uploadRes.body.attachment.storedFilename;
    });

    test('DELETE /api/attachments/:id: Non-uploader editor is blocked with 403', async () => {
      const res = await request(app)
        .delete(`/api/attachments/${attachmentToDeleteId}`)
        .set('Authorization', `Bearer ${otherEditorToken}`);

      assert.equal(res.status, 403);
      assert.match(res.body.message, /uploader.*or.*owner/i);
    });

    test('DELETE /api/attachments/:id: Uploader can delete attachment and removes file from disk (200)', async () => {
      const diskPath = path.join(UPLOADS_DIR, storedFilenameToDelete);
      assert.equal(fs.existsSync(diskPath), true, 'File must exist prior to deletion');

      const res = await request(app)
        .delete(`/api/attachments/${attachmentToDeleteId}`)
        .set('Authorization', `Bearer ${uploaderToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify file is gone from disk
      assert.equal(fs.existsSync(diskPath), false, 'File must be unlinked from disk');

      // Verify record is gone from DB
      const found = await Attachment.findById(attachmentToDeleteId);
      assert.equal(found, null);

      // Verify activity log
      const log = await findLogWithRetry({
        actionType: 'attachment_deleted',
        targetId: attachmentToDeleteId,
      });
      assert.ok(log);
      assert.equal(log.targetType, 'attachment');
    });

    test('DELETE /api/attachments/:id: Workspace owner can delete any attachment (200)', async () => {
      // Upload as other editor
      const buffer = Buffer.from('Owner deletion test file');
      const uploadRes = await request(app)
        .post(`/api/tasks/${taskId}/attachments`)
        .set('Authorization', `Bearer ${otherEditorToken}`)
        .attach('file', buffer, 'owner_delete_target.png');

      const attId = uploadRes.body.attachment._id;
      const storedName = uploadRes.body.attachment.storedFilename;
      const diskPath = path.join(UPLOADS_DIR, storedName);

      // Owner deletes it
      const res = await request(app)
        .delete(`/api/attachments/${attId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(fs.existsSync(diskPath), false, 'Owner delete must remove file from disk');
    });
  });

  describe('4. Link Attachments (Step 15 Enhancement)', () => {
    let linkAttachmentId;

    test('POST /api/tasks/:taskId/attachments/link: Editor can attach a URL link (201)', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments/link`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .send({
          url: 'https://figma.com/file/collabboard-spec',
          title: 'Figma Design Spec',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.attachment.type, 'link');
      assert.equal(res.body.attachment.url, 'https://figma.com/file/collabboard-spec');
      assert.equal(res.body.attachment.filename, 'Figma Design Spec');
      assert.equal(res.body.attachment.sizeBytes, 0);
      assert.equal(res.body.attachment.downloadUrl, 'https://figma.com/file/collabboard-spec');
      linkAttachmentId = res.body.attachment._id;

      // Activity log
      const log = await findLogWithRetry({
        actionType: 'attachment_created',
        targetId: linkAttachmentId,
      });
      assert.ok(log);
      assert.equal(log.metadata.after.type, 'link');
    });

    test('POST /api/tasks/:taskId/attachments/link: Viewer gets 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments/link`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          url: 'https://google.com',
          title: 'Google Doc',
        });

      assert.equal(res.status, 403);
    });

    test('POST /api/tasks/:taskId/attachments/link: Rejects empty or invalid URL with 400', async () => {
      const res = await request(app)
        .post(`/api/tasks/${taskId}/attachments/link`)
        .set('Authorization', `Bearer ${uploaderToken}`)
        .send({
          url: '   ',
        });

      assert.equal(res.status, 400);
      assert.match(res.body.message, /valid URL/i);
    });

    test('GET /api/attachments/:id/download: Redirects to URL for link attachments (302)', async () => {
      const res = await request(app)
        .get(`/api/attachments/${linkAttachmentId}/download`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 302);
      assert.equal(res.headers.location, 'https://figma.com/file/collabboard-spec');
    });

    test('DELETE /api/attachments/:id: Can delete link attachment cleanly without disk error (200)', async () => {
      const res = await request(app)
        .delete(`/api/attachments/${linkAttachmentId}`)
        .set('Authorization', `Bearer ${uploaderToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const found = await Attachment.findById(linkAttachmentId);
      assert.equal(found, null);
    });
  });
});
