import mongoose from 'mongoose';
import { ActivityLog } from '../models/ActivityLog.js';

/**
 * Normalizes values for clean JSON storage in activity metadata
 */
export const normalizeValue = (val) => {
  if (val === undefined || val === null) return val;

  if (val?._bsontype === 'ObjectID' || val instanceof mongoose.Types.ObjectId) {
    return val.toString();
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (Array.isArray(val)) {
    return val.map((item) => normalizeValue(item));
  }

  if (typeof val === 'object') {
    const plainObj = typeof val.toObject === 'function' ? val.toObject() : val;
    const normalized = {};
    for (const [k, v] of Object.entries(plainObj)) {
      normalized[k] = normalizeValue(v);
    }
    return normalized;
  }

  return val;
};

/**
 * Deep equality comparison for primitives, ObjectIds, Dates, and Arrays
 */
export const isEqual = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Handle Date comparison
  if (a instanceof Date || b instanceof Date) {
    const tA = new Date(a).getTime();
    const tB = new Date(b).getTime();
    return tA === tB;
  }

  // Handle ObjectId vs ObjectId or ObjectId vs String
  const isAObjectId = a?._bsontype === 'ObjectID' || a instanceof mongoose.Types.ObjectId;
  const isBObjectId = b?._bsontype === 'ObjectID' || b instanceof mongoose.Types.ObjectId;

  if (isAObjectId || isBObjectId) {
    const strA = a?.toString ? a.toString() : String(a);
    const strB = b?.toString ? b.toString() : String(b);
    return strA === strB;
  }

  // Handle Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle Object comparison
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
};

/**
 * Computes field-level difference between before and after states.
 * Only keys whose values actually changed will appear in the output.
 *
 * @param {Object} before - State before mutation
 * @param {Object} after - State after mutation
 * @param {string[]} [fieldsToCheck] - Optional array of fields to restrict diffing
 * @returns {{ before: Object|null, after: Object|null }}
 */
export const computeDiff = (before = {}, after = {}, fieldsToCheck = null) => {
  const diffBefore = {};
  const diffAfter = {};

  const keys =
    fieldsToCheck ||
    Array.from(
      new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    );

  for (const key of keys) {
    const valBefore = before ? before[key] : undefined;
    const valAfter = after ? after[key] : undefined;

    if (!isEqual(valBefore, valAfter)) {
      if (valBefore !== undefined) diffBefore[key] = normalizeValue(valBefore);
      if (valAfter !== undefined) diffAfter[key] = normalizeValue(valAfter);
    }
  }

  return {
    before: Object.keys(diffBefore).length > 0 ? diffBefore : null,
    after: Object.keys(diffAfter).length > 0 ? diffAfter : null,
  };
};

/**
 * Non-blocking activity logger helper.
 * Executes asynchronously without throwing, ensuring REST response cycles are never failed.
 *
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} options.workspaceId
 * @param {string|mongoose.Types.ObjectId} [options.projectId]
 * @param {string|mongoose.Types.ObjectId} options.actorId
 * @param {string} options.actionType
 * @param {'task'|'list'|'project'|'workspace'|'member'} options.targetType
 * @param {string|mongoose.Types.ObjectId} options.targetId
 * @param {Object} [options.metadata] - Explicit metadata override
 * @param {Object} [options.before] - Before state for diffing
 * @param {Object} [options.after] - After state for diffing
 */
export const logActivity = ({
  workspaceId,
  projectId = null,
  actorId,
  actionType,
  targetType,
  targetId,
  metadata = null,
  before = null,
  after = null,
}) => {
  Promise.resolve()
    .then(async () => {
      let finalMetadata = metadata;

      if (!finalMetadata) {
        if (actionType.endsWith('_created')) {
          finalMetadata = {
            before: null,
            after: after ? normalizeValue(after) : null,
          };
        } else if (actionType.endsWith('_deleted') || actionType === 'member_removed') {
          finalMetadata = {
            before: before ? normalizeValue(before) : null,
            after: null,
          };
        } else {
          // Updates or moves: field-level diff
          finalMetadata = computeDiff(before, after);
        }
      }

      await ActivityLog.create({
        workspaceId,
        projectId: projectId || null,
        actorId,
        actionType,
        targetType,
        targetId,
        metadata: finalMetadata || { before: null, after: null },
      });
    })
    .catch((err) => {
      console.error('[ActivityLog Error] Failed to record activity log:', err?.message || err);
    });
};
