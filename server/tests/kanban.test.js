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

describe('Kanban Core: Projects, Lists, Tasks Test Suite (Step 3)', () => {
  // Test users
  const ownerUser = {
    name: 'Kanban Owner',
    email: 'kanban_owner_test@collabboard.io',
    password: 'Password123!',
  };

  const editorUser = {
    name: 'Kanban Editor',
    email: 'kanban_editor_test@collabboard.io',
    password: 'Password123!',
  };

  const viewerUser = {
    name: 'Kanban Viewer',
    email: 'kanban_viewer_test@collabboard.io',
    password: 'Password123!',
  };

  const outsiderUser = {
    name: 'Kanban Outsider',
    email: 'kanban_outsider_test@collabboard.io',
    password: 'Password123!',
  };

  const secondEditorUser = {
    name: 'Kanban Second Editor',
    email: 'kanban_editor2_test@collabboard.io',
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
  let outsiderWorkspaceId = '';

  before(async () => {
    await connectDB();

    // Clean up test data from previous runs
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
    await Workspace.deleteMany({ name: /Kanban Workspace/i });
    await Project.deleteMany({ title: /Test Project/i });

    // Register users
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

    // Create primary workspace with owner
    const wsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Kanban Workspace Primary' });
    workspaceId = wsRes.body.workspace._id;

    // Add editors to workspace
    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: {
        members: {
          $each: [
            { userId: editorId, role: 'editor', joinedAt: new Date() },
            { userId: secondEditorId, role: 'editor', joinedAt: new Date() },
          ],
        },
      },
    });

    // Add viewer to workspace
    await Workspace.findByIdAndUpdate(workspaceId, {
      $push: { members: { userId: viewerId, role: 'viewer', joinedAt: new Date() } },
    });

    // Create separate workspace for outsider
    const outsiderWsRes = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Kanban Workspace Outsider' });
    outsiderWorkspaceId = outsiderWsRes.body.workspace._id;
  });

  after(async () => {
    await Project.deleteMany({ title: /Test Project/i });
    await Workspace.deleteMany({ name: /Kanban Workspace/i });
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

  describe('1. Project Management & Permissions', () => {
    let createdProjectId = '';

    test('POST /api/workspaces/:workspaceId/projects allows owner to create project', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Test Project Alpha' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.project.title, 'Test Project Alpha');
      assert.equal(res.body.project.workspaceId, workspaceId);
      createdProjectId = res.body.project._id;
    });

    test('POST /api/workspaces/:workspaceId/projects allows editor to create project', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Test Project Beta' });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.project.title, 'Test Project Beta');
    });

    test('POST /api/workspaces/:workspaceId/projects rejects viewer with 403', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'Test Project Viewer Attempt' });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });

    test('POST /api/workspaces/:workspaceId/projects validates title cannot be empty', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '   ' });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('GET /api/workspaces/:workspaceId/projects allows viewer, editor, and owner', async () => {
      const viewerRes = await request(app)
        .get(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(viewerRes.status, 200);
      assert.equal(viewerRes.body.success, true);
      assert.ok(Array.isArray(viewerRes.body.projects));
      assert.ok(viewerRes.body.projects.length >= 2);
    });

    test('GET /api/projects/:id returns project with sorted lists and tasks', async () => {
      // Clear auto-created default lists from project creation to test explicit list/task population
      await List.deleteMany({ projectId: createdProjectId });

      // Add a list and task to createdProjectId
      const list = await List.create({
        projectId: createdProjectId,
        title: 'Initial List',
        order: 0,
        createdBy: ownerId,
      });

      await Task.create({
        listId: list._id,
        projectId: createdProjectId,
        title: 'Initial Task',
        order: 0,
        createdBy: ownerId,
      });

      const res = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.project._id, createdProjectId);
      assert.ok(Array.isArray(res.body.project.lists));
      assert.equal(res.body.project.lists[0].title, 'Initial List');
      assert.ok(Array.isArray(res.body.project.lists[0].tasks));
      assert.equal(res.body.project.lists[0].tasks[0].title, 'Initial Task');
    });

    test('DELETE /api/projects/:id rejects viewer with 403', async () => {
      const res = await request(app)
        .delete(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      assert.equal(res.status, 403);
    });
  });

  describe('2. Lists Management & Permissions', () => {
    let testProject = null;
    let list1 = null;
    let list2 = null;

    before(async () => {
      testProject = await Project.create({
        workspaceId,
        title: 'Test Project for Lists',
        createdBy: ownerId,
      });
    });

    test('POST /api/projects/:projectId/lists allows editor/owner to create lists with order', async () => {
      const res1 = await request(app)
        .post(`/api/projects/${testProject._id}/lists`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'To Do', order: 0 });

      assert.equal(res1.status, 201);
      assert.equal(res1.body.success, true);
      assert.equal(res1.body.list.title, 'To Do');
      assert.equal(res1.body.list.order, 0);
      list1 = res1.body.list;

      const res2 = await request(app)
        .post(`/api/projects/${testProject._id}/lists`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'In Progress', order: 1 });

      assert.equal(res2.status, 201);
      assert.equal(res2.body.list.title, 'In Progress');
      list2 = res2.body.list;
    });

    test('POST /api/projects/:projectId/lists rejects viewer with 403', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject._id}/lists`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'Done', order: 2 });

      assert.equal(res.status, 403);
    });

    test('POST /api/projects/:projectId/lists validates title non-empty and order number', async () => {
      const res1 = await request(app)
        .post(`/api/projects/${testProject._id}/lists`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '', order: 0 });
      assert.equal(res1.status, 400);

      const res2 = await request(app)
        .post(`/api/projects/${testProject._id}/lists`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Valid Title', order: 'not-a-number' });
      assert.equal(res2.status, 400);
    });

    test('PATCH /api/lists/:id allows creator or owner to update list title and order, blocks non-creator editor', async () => {
      // 1. Non-creator editor trying to update title is blocked with 403
      const blockedRes = await request(app)
        .patch(`/api/lists/${list1._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Backlog', order: 5 });

      assert.equal(blockedRes.status, 403);
      assert.equal(
        blockedRes.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );

      // 2. Creator editor can update their own list (list2)
      const creatorRes = await request(app)
        .patch(`/api/lists/${list2._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'In Progress Updated', order: 5 });

      assert.equal(creatorRes.status, 200);
      assert.equal(creatorRes.body.success, true);
      assert.equal(creatorRes.body.list.title, 'In Progress Updated');
      assert.equal(creatorRes.body.list.order, 5);

      // 3. Workspace owner can update list1 (created by owner)
      const ownerRes = await request(app)
        .patch(`/api/lists/${list1._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Backlog', order: 5 });

      assert.equal(ownerRes.status, 200);
      assert.equal(ownerRes.body.success, true);
      assert.equal(ownerRes.body.list.title, 'Backlog');
      assert.equal(ownerRes.body.list.order, 5);
    });

    test('PATCH /api/lists/:id rejects viewer with 403', async () => {
      const res = await request(app)
        .patch(`/api/lists/${list1._id}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'Hacked Title' });

      assert.equal(res.status, 403);
    });
  });

  describe('3. Tasks CRUD, Validations, and Permissions', () => {
    let testProject = null;
    let testList = null;
    let testTask = null;

    before(async () => {
      testProject = await Project.create({
        workspaceId,
        title: 'Test Project for Tasks',
        createdBy: ownerId,
      });

      testList = await List.create({
        projectId: testProject._id,
        title: 'Development',
        order: 0,
        createdBy: ownerId,
      });
    });

    test('POST /api/lists/:listId/tasks creates task with labels, taskType, assignees, order', async () => {
      const res = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Implement Authentication Tests',
          description: 'Write end-to-end tests for all endpoints',
          order: 0,
          taskType: 'story',
          dueDate: new Date().toISOString(),
          assignees: [editorId],
          labels: [{ name: 'Backend', color: '#3b82f6' }],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.title, 'Implement Authentication Tests');
      assert.equal(res.body.task.taskType, 'story');
      assert.equal(res.body.task.priority, 'medium'); // Default priority
      assert.equal(res.body.task.labels[0].name, 'Backend');
      assert.equal(res.body.task.labels[0].color, '#3b82f6');
      assert.equal(res.body.task.assignees[0], editorId);
      testTask = res.body.task;
    });

    test('POST /api/lists/:listId/tasks creates task with explicit priority', async () => {
      const res = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          title: 'Critical Database Bug',
          order: 1,
          taskType: 'bug',
          priority: 'urgent',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.priority, 'urgent');
    });

    test('POST /api/lists/:listId/tasks rejects viewer with 403', async () => {
      const res = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          title: 'Viewer Task Attempt',
          order: 1,
        });

      assert.equal(res.status, 403);
    });

    test('POST /api/lists/:listId/tasks validates taskType and label color format and priority', async () => {
      // Invalid taskType
      const res1 = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Invalid Task Type',
          order: 1,
          taskType: 'feature', // not task|bug|story
        });
      assert.equal(res1.status, 400);

      // Invalid priority
      const resPriority = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Invalid Priority Task',
          order: 1,
          priority: 'super-urgent', // not low|medium|high|urgent
        });
      assert.equal(resPriority.status, 400);

      // Invalid label color (must be hex code)
      const res2 = await request(app)
        .post(`/api/lists/${testList._id}/tasks`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Invalid Label Color',
          order: 1,
          labels: [{ name: 'Tag', color: 'blue' }], // not #hex
        });
      assert.equal(res2.status, 400);
    });

    test('PATCH /api/tasks/:id allows updating task properties including priority', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${testTask._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: 'Updated Task Title',
          taskType: 'bug',
          priority: 'high',
          description: 'Detailed bug reproduction steps',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.title, 'Updated Task Title');
      assert.equal(res.body.task.taskType, 'bug');
      assert.equal(res.body.task.priority, 'high');
      assert.equal(res.body.task.description, 'Detailed bug reproduction steps');
    });

    test('PATCH /api/tasks/:id rejects viewer with 403', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${testTask._id}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'Hacked Title' });

      assert.equal(res.status, 403);
    });
  });

  describe('4. Task Move Endpoint & Project Boundary Check', () => {
    let projectA = null;
    let projectB = null;
    let listA1 = null;
    let listA2 = null;
    let listB1 = null;
    let movingTask = null;

    before(async () => {
      projectA = await Project.create({
        workspaceId,
        title: 'Test Project Move A',
        createdBy: ownerId,
      });

      projectB = await Project.create({
        workspaceId,
        title: 'Test Project Move B',
        createdBy: ownerId,
      });

      listA1 = await List.create({
        projectId: projectA._id,
        title: 'Project A - List 1',
        order: 0,
        createdBy: ownerId,
      });

      listA2 = await List.create({
        projectId: projectA._id,
        title: 'Project A - List 2',
        order: 1,
        createdBy: ownerId,
      });

      listB1 = await List.create({
        projectId: projectB._id,
        title: 'Project B - List 1',
        order: 0,
        createdBy: ownerId,
      });

      movingTask = await Task.create({
        listId: listA1._id,
        projectId: projectA._id,
        title: 'Move Me',
        order: 0,
        createdBy: ownerId,
      });
    });

    test('PATCH /api/tasks/:id/move updates listId and order within same project', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${movingTask._id}/move`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          listId: listA2._id.toString(),
          order: 3,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.listId, listA2._id.toString());
      assert.equal(res.body.task.order, 3);
    });

    test('PATCH /api/tasks/:id/move rejects moving task to a list on a different project', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${movingTask._id}/move`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          listId: listB1._id.toString(),
          order: 0,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.message, /different project/i);
    });

    test('PATCH /api/tasks/:id/move rejects viewer with 403', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${movingTask._id}/move`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          listId: listA1._id.toString(),
          order: 1,
        });

      assert.equal(res.status, 403);
    });
  });

  describe('5. Cascade Delete Verifications', () => {
    let cascadeProject = null;
    let cascadeList1 = null;
    let cascadeList2 = null;
    let task1a = null;
    let task1b = null;
    let task2a = null;

    before(async () => {
      cascadeProject = await Project.create({
        workspaceId,
        title: 'Test Project Cascade',
        createdBy: ownerId,
      });

      cascadeList1 = await List.create({
        projectId: cascadeProject._id,
        title: 'Cascade List 1',
        order: 0,
        createdBy: ownerId,
      });

      cascadeList2 = await List.create({
        projectId: cascadeProject._id,
        title: 'Cascade List 2',
        order: 1,
        createdBy: ownerId,
      });

      task1a = await Task.create({
        listId: cascadeList1._id,
        projectId: cascadeProject._id,
        title: 'Task 1A',
        order: 0,
        createdBy: ownerId,
      });

      task1b = await Task.create({
        listId: cascadeList1._id,
        projectId: cascadeProject._id,
        title: 'Task 1B',
        order: 1,
        createdBy: ownerId,
      });

      task2a = await Task.create({
        listId: cascadeList2._id,
        projectId: cascadeProject._id,
        title: 'Task 2A',
        order: 0,
        createdBy: ownerId,
      });
    });

    test('DELETE /api/lists/:id cascades and removes child tasks without touching sibling list', async () => {
      // Non-creator editor attempting to delete list created by owner is blocked with 403
      const blockedRes = await request(app)
        .delete(`/api/lists/${cascadeList1._id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      assert.equal(blockedRes.status, 403);
      assert.equal(
        blockedRes.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );

      // Workspace owner deletes the list successfully with cascade
      const res = await request(app)
        .delete(`/api/lists/${cascadeList1._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);

      // Verify List 1 is removed
      const deletedList = await List.findById(cascadeList1._id);
      assert.equal(deletedList, null);

      // Verify tasks 1a and 1b were deleted
      const deletedTask1a = await Task.findById(task1a._id);
      const deletedTask1b = await Task.findById(task1b._id);
      assert.equal(deletedTask1a, null);
      assert.equal(deletedTask1b, null);

      // Verify List 2 and task 2a still exist
      const remainingList2 = await List.findById(cascadeList2._id);
      const remainingTask2a = await Task.findById(task2a._id);
      assert.notEqual(remainingList2, null);
      assert.notEqual(remainingTask2a, null);
    });

    test('DELETE /api/projects/:id cascades and removes all remaining lists and tasks', async () => {
      const res = await request(app)
        .delete(`/api/projects/${cascadeProject._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);

      // Verify Project is deleted
      const deletedProject = await Project.findById(cascadeProject._id);
      assert.equal(deletedProject, null);

      // Verify all lists and tasks for that project are gone
      const remainingLists = await List.find({ projectId: cascadeProject._id });
      const remainingTasks = await Task.find({ projectId: cascadeProject._id });
      assert.equal(remainingLists.length, 0);
      assert.equal(remainingTasks.length, 0);
    });
  });

  describe('6. Cross-Workspace Security & Leakage Prevention', () => {
    let secretProject = null;
    let secretList = null;
    let secretTask = null;

    before(async () => {
      secretProject = await Project.create({
        workspaceId,
        title: 'Test Project Secret Primary',
        createdBy: ownerId,
      });

      secretList = await List.create({
        projectId: secretProject._id,
        title: 'Secret List',
        order: 0,
        createdBy: ownerId,
      });

      secretTask = await Task.create({
        listId: secretList._id,
        projectId: secretProject._id,
        title: 'Secret Task',
        order: 0,
        createdBy: ownerId,
      });
    });

    test('Outsider cannot list projects from another workspace (GET /api/workspaces/:id/projects)', async () => {
      const res = await request(app)
        .get(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });

    test('Outsider cannot create project in another workspace (POST /api/workspaces/:id/projects)', async () => {
      const res = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Intrusion Project' });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot view another workspace project (GET /api/projects/:id)', async () => {
      const res = await request(app)
        .get(`/api/projects/${secretProject._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });

    test('Outsider cannot delete another workspace project (DELETE /api/projects/:id)', async () => {
      const res = await request(app)
        .delete(`/api/projects/${secretProject._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });

    test('Outsider cannot create list on another workspace project (POST /api/projects/:id/lists)', async () => {
      const res = await request(app)
        .post(`/api/projects/${secretProject._id}/lists`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Intruder List', order: 0 });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot update list in another workspace (PATCH /api/lists/:id)', async () => {
      const res = await request(app)
        .patch(`/api/lists/${secretList._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Modified by Intruder' });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot delete list in another workspace (DELETE /api/lists/:id)', async () => {
      const res = await request(app)
        .delete(`/api/lists/${secretList._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });

    test('Outsider cannot create task on another workspace list (POST /api/lists/:id/tasks)', async () => {
      const res = await request(app)
        .post(`/api/lists/${secretList._id}/tasks`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Intruder Task', order: 0 });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot update task in another workspace (PATCH /api/tasks/:id)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${secretTask._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ title: 'Tampered Task' });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot move task in another workspace (PATCH /api/tasks/:id/move)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${secretTask._id}/move`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({ listId: secretList._id.toString(), order: 10 });

      assert.equal(res.status, 403);
    });

    test('Outsider cannot delete task in another workspace (DELETE /api/tasks/:id)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${secretTask._id}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      assert.equal(res.status, 403);
    });
  });

  describe('7. Ownership-Based Edit Permissions (Step 4)', () => {
    let permProject = null;
    let permList = null;
    let permList2 = null;
    let ownerTask = null;
    let assignedTask = null;
    let editorCreatedProject = null;
    let editorCreatedList = null;
    let editorCreatedTask = null;

    before(async () => {
      permProject = await Project.create({
        workspaceId,
        title: 'Permissions Test Project',
        createdBy: ownerId,
      });

      permList = await List.create({
        projectId: permProject._id,
        title: 'Permissions List 1',
        order: 0,
        createdBy: ownerId,
      });

      permList2 = await List.create({
        projectId: permProject._id,
        title: 'Permissions List 2',
        order: 1,
        createdBy: ownerId,
      });

      // Task created by owner with no assignees
      ownerTask = await Task.create({
        listId: permList._id,
        projectId: permProject._id,
        title: 'Owner-Created Task',
        order: 0,
        createdBy: ownerId,
        assignees: [],
      });

      // Task created by owner with secondEditorId as assignee
      assignedTask = await Task.create({
        listId: permList._id,
        projectId: permProject._id,
        title: 'Assigned Task',
        description: 'Initial description',
        order: 1,
        createdBy: ownerId,
        assignees: [secondEditorId],
      });

      // Project, list, task created by editorId
      editorCreatedProject = await Project.create({
        workspaceId,
        title: 'Editor Created Project',
        createdBy: editorId,
      });

      editorCreatedList = await List.create({
        projectId: editorCreatedProject._id,
        title: 'Editor Created List',
        order: 0,
        createdBy: editorId,
      });

      editorCreatedTask = await Task.create({
        listId: editorCreatedList._id,
        projectId: editorCreatedProject._id,
        title: 'Editor Created Task',
        order: 0,
        createdBy: editorId,
        assignees: [],
      });
    });

    test('Non-creator editor blocked from editing a task they did not create and are not assigned to (PATCH /api/tasks/:id -> 403)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${ownerTask._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Unauthorized Modification' });

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );
    });

    test('Non-creator editor blocked from deleting a task they did not create (DELETE /api/tasks/:id -> 403)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${ownerTask._id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );

      const stillExists = await Task.findById(ownerTask._id);
      assert.notEqual(stillExists, null);
    });

    test('Assignee CAN edit task content (PATCH /api/tasks/:id -> 200)', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${assignedTask._id}`)
        .set('Authorization', `Bearer ${secondEditorToken}`)
        .send({
          title: 'Assignee Updated Title',
          description: 'Updated by the assigned editor',
          taskType: 'bug',
          labels: [{ name: 'Assignee Tag', color: '#10b981' }],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.title, 'Assignee Updated Title');
      assert.equal(res.body.task.description, 'Updated by the assigned editor');
      assert.equal(res.body.task.taskType, 'bug');
      assert.equal(res.body.task.labels[0].name, 'Assignee Tag');
    });

    test('Assignee CANNOT delete task (DELETE /api/tasks/:id -> 403)', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${assignedTask._id}`)
        .set('Authorization', `Bearer ${secondEditorToken}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );

      const stillExists = await Task.findById(assignedTask._id);
      assert.notEqual(stillExists, null);
    });

    test('Moving a task (PATCH /api/tasks/:id/move) works for any editor regardless of creator (200)', async () => {
      // secondEditor is neither creator nor assignee of ownerTask, but can move it
      const res = await request(app)
        .patch(`/api/tasks/${ownerTask._id}/move`)
        .set('Authorization', `Bearer ${secondEditorToken}`)
        .send({
          listId: permList2._id.toString(),
          order: 9,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.task.listId, permList2._id.toString());
      assert.equal(res.body.task.order, 9);
    });

    test('Non-creator editor blocked from renaming a list they did not create (PATCH /api/lists/:id -> 403)', async () => {
      const res = await request(app)
        .patch(`/api/lists/${permList._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Hacked List Title' });

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );
    });

    test('Non-creator editor blocked from deleting a list they did not create (DELETE /api/lists/:id -> 403)', async () => {
      const res = await request(app)
        .delete(`/api/lists/${permList._id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );

      const stillExists = await List.findById(permList._id);
      assert.notEqual(stillExists, null);
    });

    test('Reordering list works for any editor when ONLY order is updated (PATCH /api/lists/:id -> 200)', async () => {
      const res = await request(app)
        .patch(`/api/lists/${permList._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ order: 42 });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.list.order, 42);
    });

    test('List update with BOTH title and order enforces ownership check on non-creator editor (403)', async () => {
      const res = await request(app)
        .patch(`/api/lists/${permList._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Both Title and Order', order: 100 });

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );
    });

    test('Non-creator editor blocked from deleting a project they did not create (DELETE /api/projects/:id -> 403)', async () => {
      const res = await request(app)
        .delete(`/api/projects/${permProject._id}`)
        .set('Authorization', `Bearer ${editorToken}`);

      assert.equal(res.status, 403);
      assert.equal(
        res.body.message,
        'Only the creator, an assignee, or the workspace owner can edit this'
      );
    });

    test('Workspace OWNER can edit and delete anything, regardless of who created it (200)', async () => {
      // Owner updates task created by editor
      const updateTaskRes = await request(app)
        .patch(`/api/tasks/${editorCreatedTask._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Owner Renamed Editor Task' });

      assert.equal(updateTaskRes.status, 200);
      assert.equal(updateTaskRes.body.task.title, 'Owner Renamed Editor Task');

      // Owner renames list created by editor
      const updateListRes = await request(app)
        .patch(`/api/lists/${editorCreatedList._id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'Owner Renamed Editor List' });

      assert.equal(updateListRes.status, 200);
      assert.equal(updateListRes.body.list.title, 'Owner Renamed Editor List');

      // Owner deletes task created by editor
      const deleteTaskRes = await request(app)
        .delete(`/api/tasks/${editorCreatedTask._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(deleteTaskRes.status, 200);
      const deletedTask = await Task.findById(editorCreatedTask._id);
      assert.equal(deletedTask, null);

      // Owner deletes list created by editor
      const deleteListRes = await request(app)
        .delete(`/api/lists/${editorCreatedList._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(deleteListRes.status, 200);
      const deletedList = await List.findById(editorCreatedList._id);
      assert.equal(deletedList, null);

      // Owner deletes project created by editor
      const deleteProjRes = await request(app)
        .delete(`/api/projects/${editorCreatedProject._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      assert.equal(deleteProjRes.status, 200);
      const deletedProj = await Project.findById(editorCreatedProject._id);
      assert.equal(deletedProj, null);
    });

    test('Creator editor can edit and delete their own creation (200)', async () => {
      // Editor creates project, list, and task
      const pRes = await request(app)
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Editor Own Project' });
      assert.equal(pRes.status, 201);
      const myProj = pRes.body.project;

      const lRes = await request(app)
        .post(`/api/projects/${myProj._id}/lists`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Editor Own List', order: 0 });
      assert.equal(lRes.status, 201);
      const myList = lRes.body.list;

      const tRes = await request(app)
        .post(`/api/lists/${myList._id}/tasks`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Editor Own Task', order: 0 });
      assert.equal(tRes.status, 201);
      const myTask = tRes.body.task;

      // Creator edits list title
      const patchListRes = await request(app)
        .patch(`/api/lists/${myList._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Editor Own List Modified' });
      assert.equal(patchListRes.status, 200);
      assert.equal(patchListRes.body.list.title, 'Editor Own List Modified');

      // Creator edits task
      const patchTaskRes = await request(app)
        .patch(`/api/tasks/${myTask._id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .send({ title: 'Editor Own Task Modified' });
      assert.equal(patchTaskRes.status, 200);
      assert.equal(patchTaskRes.body.task.title, 'Editor Own Task Modified');

      // Creator deletes task
      const delTaskRes = await request(app)
        .delete(`/api/tasks/${myTask._id}`)
        .set('Authorization', `Bearer ${editorToken}`);
      assert.equal(delTaskRes.status, 200);

      // Creator deletes list
      const delListRes = await request(app)
        .delete(`/api/lists/${myList._id}`)
        .set('Authorization', `Bearer ${editorToken}`);
      assert.equal(delListRes.status, 200);

      // Creator deletes project
      const delProjRes = await request(app)
        .delete(`/api/projects/${myProj._id}`)
        .set('Authorization', `Bearer ${editorToken}`);
      assert.equal(delProjRes.status, 200);
    });
  });
});
