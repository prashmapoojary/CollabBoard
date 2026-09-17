import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Label name is required'],
      trim: true,
    },
    color: {
      type: String,
      required: [true, 'Label color is required'],
      trim: true,
    },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'List',
      required: [true, 'List ID is required'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [255, 'Task title cannot exceed 255 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    assignees: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
      default: [],
    },
    labels: {
      type: [labelSchema],
      default: [],
    },
    dueDate: {
      type: Date,
      default: null,
    },
    taskType: {
      type: String,
      enum: {
        values: ['task', 'bug', 'story'],
        message: '{VALUE} is not a valid task type',
      },
      default: 'task',
    },
    priority: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high', 'urgent'],
        message: '{VALUE} is not a valid priority',
      },
      default: 'medium',
    },
    order: {
      type: Number,
      required: [true, 'Task order index is required'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user ID is required'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for querying tasks in order within a list or project
taskSchema.index({ listId: 1, order: 1 });
taskSchema.index({ projectId: 1, order: 1 });

export const Task = mongoose.model('Task', taskSchema);
