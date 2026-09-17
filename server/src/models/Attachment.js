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
    type: {
      type: String,
      enum: ['file', 'link'],
      default: 'file',
    },
    url: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (this.type === 'link') {
            return typeof v === 'string' && v.trim().length > 0;
          }
          return true;
        },
        message: 'URL is required for link attachments',
      },
    },
    filename: {
      type: String,
      required: [true, 'Original filename or title is required'],
      trim: true,
    },
    storedFilename: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          if (this.type === 'file') {
            return typeof v === 'string' && v.trim().length > 0;
          }
          return true;
        },
        message: 'Stored filename is required for file attachments',
      },
    },
    mimeType: {
      type: String,
      default: function () {
        return this.type === 'link' ? 'text/uri-list' : 'application/octet-stream';
      },
    },
    sizeBytes: {
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
        if (ret.uploadedBy && typeof ret.uploadedBy === 'object' && ret.uploadedBy.name) {
          ret.uploader = ret.uploadedBy;
        }
        ret.downloadUrl =
          ret.type === 'link'
            ? ret.url || ret.filename
            : `/api/attachments/${ret._id}/download`;
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
  if (this.type === 'link') {
    return this.url;
  }
  return `/api/attachments/${this._id}/download`;
});

// Index for listing attachments for a task sorted by createdAt
attachmentSchema.index({ taskId: 1, createdAt: -1 });

export const Attachment = mongoose.model('Attachment', attachmentSchema);
