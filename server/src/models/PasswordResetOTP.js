import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const passwordResetOTPSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// TTL index on expiresAt so MongoDB automatically removes documents when expiresAt is reached
passwordResetOTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Hash OTP before storing
passwordResetOTPSchema.statics.hashOTP = async function (plainOTP) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainOTP, salt);
};

// Compare candidate OTP with stored hash
passwordResetOTPSchema.methods.compareOTP = async function (candidateOTP) {
  return bcrypt.compare(candidateOTP, this.otpHash);
};

export const PasswordResetOTP = mongoose.model('PasswordResetOTP', passwordResetOTPSchema);
