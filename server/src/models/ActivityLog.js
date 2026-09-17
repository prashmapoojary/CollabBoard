import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace ID is required'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor ID is required'],
    },
    actionType: {
      type: String,
      required: [true, 'Action type is required'],
      enum: [
        'task_created',
        'task_updated',
        'task_moved',
        'task_deleted',
        'list_created',
        'list_updated',
        'list_deleted',
        'project_created',
        'project_deleted',
        'workspace_renamed',
        'member_invited',
        'member_role_changed',
        'member_removed',
        'comment_created',
        'comment_deleted',
        'subitem_created',
        'subitem_updated',
        'subitem_deleted',
        'attachment_created',
        'attachment_deleted',
      ],
    },
    targetType: {
      type: String,
      required: [true, 'Target type is required'],
      enum: ['task', 'list', 'project', 'workspace', 'member', 'comment', 'subitem', 'attachment'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Target ID is required'],
    },
    metadata: {
      before: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      after: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        if (ret.actorId && typeof ret.actorId === 'object' && ret.actorId.name) {
          ret.actor = ret.actorId;
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Virtual for actor
activityLogSchema.virtual('actor', {
  ref: 'User',
  localField: 'actorId',
  foreignField: '_id',
  justOne: true,
});

// Compound indexes for fast timeline retrieval
activityLogSchema.index({ projectId: 1, createdAt: -1 });
activityLogSchema.index({ workspaceId: 1, createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
