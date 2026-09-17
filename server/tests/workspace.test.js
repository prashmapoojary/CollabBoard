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

describe('Workspace & Role-Based Permissions Test Suite (Step 2)', () => {
  // Test users
  const ownerUser = {
    name: 'Workspace Owner',
    email: 'ws_owner_test@collabboard.io',
    password: 'Password123!',
  };

  const memberUser = {
    name: 'Workspace Member',
    email: 'ws_member_test@collabboard.io',
    password: 'Password123!',
  };

  const outsiderUser = {
    name: 'Outsider User',
    email: 'ws_outsider_test@collabboard.io',
    password: 'Password123!',
  };

  let ownerToken = '';
  let memberToken = '';
  let outsiderToken = '';
  let ownerId = '';
  let memberId = '';
  let outsiderId = '';

  before(async () => {
    await connectDB();

    // Clean up past test users/workspaces
    await User.deleteMany({
      email: { $in: [ownerUser.email, memberUser.email, outsiderUser.email] },
    });
    await Workspace.deleteMany({ name: /Test Workspace/i });

    // Register test users
    const ownerRes = await request(app).post('/api/auth/signup').send(ownerUser);
    ownerToken = ownerRes.body.accessToken;
    ownerId = ownerRes.body.user._id;

    const memberRes = await request(app).post('/api/auth/signup').send(memberUser);
    memberToken = memberRes.body.accessToken;
    memberId = memberRes.body.user._id;

    const outsiderRes = await request(app).post('/api/auth/signup').send(outsiderUser);
    outsiderToken = outsiderRes.body.accessToken;
    outsiderId = outsiderRes.body.user._id;
  });

  after(async () => {
    await User.deleteMany({
      email: { $in: [ownerUser.email, memberUser.email, outsiderUser.email] },
    });
    await Workspace.deleteMany({ name: /Test Workspace/i });
    await disconnectDB();
  });

  describe('1. Workspace Creation & Listing', () => {
    test('POST /api/workspaces creates a workspace and sets creator as owner & member', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Workspace Alpha' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.workspace.name, 'Test Workspace Alpha');
      assert.equal(res.body.workspace.ownerId._id.toString(), ownerId);
      assert.equal(res.body.workspace.members.length, 1);
      assert.equal(res.body.workspace.members[0].userId._id.toString(), ownerId);
      assert.equal(res.body.workspace.members[0].role, 'owner');
    });

    test('POST /api/workspaces rejects empty name', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '   ' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('GET /api/workspaces returns only workspaces the authenticated user is a member of', async () => {
      const res = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.workspaces));
      assert.ok(res.body.workspaces.length >= 1);

      // Outsider should have 0 workspaces
      const outsiderRes = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(outsiderRes.status, 200);
      assert.equal(outsiderRes.body.workspaces.length, 0);
    });
  });

  describe('2. Role-Based Access & Workspace Details', () => {
    let workspaceId = '';

    beforeEach(async () => {
      // Create fresh workspace
      const ws = await Workspace.create({
        name: 'Test Workspace RBAC',
        ownerId,
        members: [
          { userId: ownerId, role: 'owner', joinedAt: new Date() },
          { userId: memberId, role: 'editor', joinedAt: new Date() },
        ],
      });
      workspaceId = ws._id.toString();
    });

    test('GET /api/workspaces/:id allows member and returns workspace with role', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.currentUserRole, 'editor');
      assert.equal(res.body.workspace.name, 'Test Workspace RBAC');
    });

    test('GET /api/workspaces/:id returns 403 for non-member', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /not a member/i);
    });

    test('PATCH /api/workspaces/:id allows owner to rename workspace', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Test Workspace Renamed' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.workspace.name, 'Test Workspace Renamed');
    });

    test('PATCH /api/workspaces/:id returns 403 when editor attempts to rename', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ name: 'Hacked Workspace Name' });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /requires one of the following roles: owner/i);
    });
  });

  describe('3. Team Member Invitations', () => {
    let workspaceId = '';

    beforeEach(async () => {
      const ws = await Workspace.create({
        name: 'Test Workspace Invites',
        ownerId,
        members: [{ userId: ownerId, role: 'owner', joinedAt: new Date() }],
      });
      workspaceId = ws._id.toString();
    });

    test('POST /api/workspaces/:id/invite adds registered user with specified role', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: memberUser.email, role: 'editor' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updatedWs = await Workspace.findById(workspaceId);
      assert.equal(updatedWs.members.length, 2);
      const newMember = updatedWs.members.find((m) => m.userId.toString() === memberId);
      assert.ok(newMember);
      assert.equal(newMember.role, 'editor');
    });

    test('POST /api/workspaces/:id/invite returns 404 when inviting unregistered email', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: 'ghost.user.unregistered@collabboard.io', role: 'editor' });

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /no registered account found/i);
    });

    test('POST /api/workspaces/:id/invite returns 409 when user is already a member', async () => {
      // Invite owner (who is already a member)
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ email: ownerUser.email, role: 'editor' });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /already a member/i);
    });

    test('POST /api/workspaces/:id/invite returns 403 when editor attempts to invite', async () => {
      // Add member first
      await Workspace.findByIdAndUpdate(workspaceId, {
        $push: { members: { userId: memberId, role: 'editor', joinedAt: new Date() } },
      });

      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/invite`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: outsiderUser.email, role: 'viewer' });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });

  describe('4. Member Role Updates & Member Removal', () => {
    let workspaceId = '';

    beforeEach(async () => {
      const ws = await Workspace.create({
        name: 'Test Workspace Role Management',
        ownerId,
        members: [
          { userId: ownerId, role: 'owner', joinedAt: new Date() },
          { userId: memberId, role: 'editor', joinedAt: new Date() },
        ],
      });
      workspaceId = ws._id.toString();
    });

    test('PATCH /api/workspaces/:id/members/:userId allows owner to change role', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'viewer' });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updatedWs = await Workspace.findById(workspaceId);
      const targetMember = updatedWs.members.find((m) => m.userId.toString() === memberId);
      assert.equal(targetMember.role, 'viewer');
    });

    test('PATCH /api/workspaces/:id/members/:userId blocks demoting the only owner', async () => {
      const res = await request(app)
        .patch(`/api/workspaces/${workspaceId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'editor' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /cannot demote the only owner/i);
    });

    test('DELETE /api/workspaces/:id/members/:userId allows owner to remove a member', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const updatedWs = await Workspace.findById(workspaceId);
      assert.equal(updatedWs.members.length, 1);
      assert.equal(updatedWs.members[0].userId.toString(), ownerId);
    });

    test('DELETE /api/workspaces/:id/members/:userId blocks removing the only owner', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /cannot remove the only owner/i);
    });

    test('DELETE /api/workspaces/:id/members/:userId returns 403 for non-owners', async () => {
      const res = await request(app)
        .delete(`/api/workspaces/${workspaceId}/members/${ownerId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });
});
