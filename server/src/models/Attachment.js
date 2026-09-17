import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task ID is required'],
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader user ID is required'],
      index: true,
    },
    filename: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
    },
    storedFilename: {
      type: String,
      required: [true, 'Stored filename is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
    },
    sizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required'],
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
        if (ret.uploadedBy && typeof ret.uploadedBy === 'object' && ret.uploadedBy.name) {
          ret.uploader = ret.uploadedBy;
        }
        ret.downloadUrl = `/api/attachments/${ret._id}/download`;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
    },
  }
);

// Virtual for uploader user
attachmentSchema.virtual('uploader', {
  ref: 'User',
  localField: 'uploadedBy',
  foreignField: '_id',
  justOne: true,
});

// Virtual for download URL
attachmentSchema.virtual('downloadUrl').get(function () {
  return `/api/attachments/${this._id}/download`;
});

// Index for listing attachments for a task sorted by createdAt
attachmentSchema.index({ taskId: 1, createdAt: -1 });

export const Attachment = mongoose.model('Attachment', attachmentSchema);
