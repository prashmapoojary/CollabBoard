import mongoose from 'mongoose';

const subitemSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task ID is required'],
      index: true,
    },
    text: {
      type: String,
      required: [true, 'Subitem text is required'],
      trim: true,
      maxlength: [300, 'Subitem text cannot exceed 300 characters'],
    },
    completed: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user ID is required'],
    },
    order: {
      type: Number,
      default: 0,
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
        if (ret.createdBy && typeof ret.createdBy === 'object' && ret.createdBy.name) {
          ret.creator = ret.createdBy;
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Virtual for creator
subitemSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true,
});

// Index for retrieving subitems in order for a given task
subitemSchema.index({ taskId: 1, order: 1 });

export const Subitem = mongoose.model('Subitem', subitemSchema);
