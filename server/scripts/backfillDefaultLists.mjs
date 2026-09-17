import 'dotenv/config';
import mongoose from 'mongoose';
import { Project } from '../src/models/Project.js';
import { List } from '../src/models/List.js';

const DEFAULT_LIST_TITLES = ['To Do', 'In Progress', 'Testing', 'Done'];

async function runBackfill() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('[Migration] Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('[Migration] Connected.');

  try {
    const projects = await Project.find({});
    console.log(`[Migration] Found ${projects.length} total projects in database.`);

    let backfilledCount = 0;
    let skippedCount = 0;

    for (const project of projects) {
      const listCount = await List.countDocuments({ projectId: project._id });
      if (listCount === 0) {
        console.log(`[Migration] Backfilling project "${project.title}" (${project._id})...`);
        const listsToInsert = DEFAULT_LIST_TITLES.map((title, index) => ({
          projectId: project._id,
          title,
          order: index,
          createdBy: project.createdBy,
        }));
        await List.insertMany(listsToInsert);
        backfilledCount++;
      } else {
        skippedCount++;
      }
    }

    console.log('\n=== BACKFILL SUMMARY ===');
    console.log(`Total projects checked: ${projects.length}`);
    console.log(`Projects backfilled with 4 default lists: ${backfilledCount}`);
    console.log(`Projects already having lists (skipped): ${skippedCount}`);
    console.log('========================\n');
  } catch (error) {
    console.error('[Migration] Error during backfill:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Migration] MongoDB disconnected.');
  }
}

runBackfill();
