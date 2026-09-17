import mongoose from 'mongoose';

const logHourSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task ID is required'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    hours: {
      type: Number,
      required: [true, 'Hours is required'],
      min: [0.01, 'Hours must be greater than 0'],
      max: [24, 'Hours cannot exceed 24 per entry'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: [300, 'Note cannot exceed 300 characters'],
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
        if (ret.userId && typeof ret.userId === 'object' && ret.userId.name) {
          ret.user = ret.userId;
        }
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Compound index for querying task's log entries sorted by date descending
logHourSchema.index({ taskId: 1, date: -1 });

// Virtual reference for user populating
logHourSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});

export const LogHour = mongoose.model('LogHour', logHourSchema);
