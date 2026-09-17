import path from 'path';
import fs from 'fs';
import { Project } from '../models/Project.js';
import { List } from '../models/List.js';
import { Task } from '../models/Task.js';
import { Subitem } from '../models/Subitem.js';
import { Attachment } from '../models/Attachment.js';
import { UPLOADS_DIR } from '../middleware/uploadMiddleware.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { broadcastToProject } from '../socket/index.js';
import { logActivity } from '../utils/logActivity.js';

export const DEFAULT_LIST_TITLES = ['To Do', 'In Progress', 'Testing', 'Done'];

/**
 * POST /api/workspaces/:workspaceId/projects
 * Create a new project inside the resolved workspace (editor/owner only).
 * Automatically creates the 4 default lists: To Do, In Progress, Testing, Done.
 */
export const createProject = async (req, res, next) => {
  try {
    const { title } = req.body;

    const project = await Project.create({
      workspaceId: req.workspace._id,
      title,
      createdBy: req.user._id,
    });

    // Automatically create 4 default lists in order
    await List.insertMany(
      DEFAULT_LIST_TITLES.map((listTitle, index) => ({
        projectId: project._id,
        title: listTitle,
        order: index,
        createdBy: req.user._id,
      }))
    );

    logActivity({
      workspaceId: req.workspace._id,
      projectId: project._id,
      actorId: req.user._id,
      actionType: 'project_created',
      targetType: 'project',
      targetId: project._id,
      metadata: {
        before: null,
        after: { title: project.title },
      },
    });

    res.status(201).json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/workspaces/:workspaceId/projects
 * List all projects belonging to the resolved workspace (any workspace member).
 */
export const getProjectsByWorkspace = async (req, res, next) => {
  try {
    const projects = await Project.find({ workspaceId: req.workspace._id }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:id
 * Retrieve a single project along with its lists and tasks sorted by order (any workspace member).
 * Auto-creates 4 default lists if the project has zero lists.
 */
export const getProjectById = async (req, res, next) => {
  try {
    let lists = await List.find({ projectId: req.project._id }).sort({ order: 1 });

    // On-the-fly backfill if project has 0 lists
    if (lists.length === 0) {
      console.log(
        `[Auto-Create] Auto-populating default lists for project ${req.project._id} (${req.project.title})`
      );
      const creatorId = req.project.createdBy || req.user._id;
      const defaultLists = DEFAULT_LIST_TITLES.map((listTitle, index) => ({
        projectId: req.project._id,
        title: listTitle,
        order: index,
        createdBy: creatorId,
      }));
      lists = await List.insertMany(defaultLists);
    }
    const tasks = await Task.find({ projectId: req.project._id })
      .sort({ order: 1 })
      .populate('assignees', 'name email avatarUrl');

    const taskIds = tasks.map((t) => t._id);
    const subitemCounts = await Subitem.aggregate([
      { $match: { taskId: { $in: taskIds } } },
      {
        $group: {
          _id: '$taskId',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: ['$completed', 1, 0] },
          },
        },
      },
    ]);

    const subitemMap = new Map();
    for (const item of subitemCounts) {
      subitemMap.set(item._id.toString(), {
        total: item.total,
        completed: item.completed,
      });
    }

    const tasksByListId = {};
    for (const task of tasks) {
      const lid = task.listId.toString();
      if (!tasksByListId[lid]) {
        tasksByListId[lid] = [];
      }
      const taskObj = task.toObject();
      taskObj.subitemProgress = subitemMap.get(task._id.toString()) || {
        total: 0,
        completed: 0,
      };
      tasksByListId[lid].push(taskObj);
    }

    const listsWithTasks = lists.map((list) => {
      const listObj = list.toObject();
      listObj.tasks = tasksByListId[list._id.toString()] || [];
      return listObj;
    });

    const projectObj = req.project.toObject();
    projectObj.lists = listsWithTasks;

    res.status(200).json({
      success: true,
      project: projectObj,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/projects/:id
 * Cascade delete a project and all its associated lists and tasks (editor/owner only).
 */
export const deleteProject = async (req, res, next) => {
  try {
    const projectId = req.project._id;

    // Actual deleteMany calls to prevent orphaned documents
    const taskIds = (await Task.find({ projectId }).select('_id')).map((t) => t._id);
    if (taskIds.length > 0) {
      await Subitem.deleteMany({ taskId: { $in: taskIds } });
      const attachments = await Attachment.find({ taskId: { $in: taskIds } });
      for (const att of attachments) {
        try {
          const filePath = path.join(UPLOADS_DIR, att.storedFilename);
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
          }
        } catch (unlinkErr) {
          console.error('[Project Cascade] Error deleting file:', unlinkErr);
        }
      }
      await Attachment.deleteMany({ taskId: { $in: taskIds } });
    }
    await Task.deleteMany({ projectId });
    await List.deleteMany({ projectId });
    await Project.findByIdAndDelete(projectId);

    broadcastToProject(req, projectId, 'project:deleted', {
      projectId: projectId.toString(),
    });

    logActivity({
      workspaceId: req.project.workspaceId,
      projectId,
      actorId: req.user._id,
      actionType: 'project_deleted',
      targetType: 'project',
      targetId: projectId,
      metadata: {
        before: { title: req.project.title },
        after: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Project and all associated lists and tasks deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/projects/:projectId/activity
 * Paginated activity log for a project (any workspace member, viewer included).
 * Query params: page (default 1), limit (default 20, max 100).
 */
export const getProjectActivity = async (req, res, next) => {
  try {
    const projectId = req.project._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100);
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      ActivityLog.find({ projectId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'name avatarUrl'),
      ActivityLog.countDocuments({ projectId }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      entries,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
};

