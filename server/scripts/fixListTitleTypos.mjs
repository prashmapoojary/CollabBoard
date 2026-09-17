import 'dotenv/config';
import mongoose from 'mongoose';
import { Project } from '../src/models/Project.js';
import { List } from '../src/models/List.js';
import { Task } from '../src/models/Task.js';

const CANONICAL_TITLES = ['To Do', 'In Progress', 'Testing', 'Done'];

async function runCleanup() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('[Cleanup] Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('[Cleanup] Connected.');

  try {
    const projects = await Project.find({});
    console.log(`[Cleanup] Found ${projects.length} total projects in database.`);

    let affectedProjectsCount = 0;
    const affectedProjectsList = [];

    for (const project of projects) {
      let lists = await List.find({ projectId: project._id }).sort({ order: 1 });
      let projectWasModified = false;

      // 1. Check for typos like "On Progess" or "On Progress"
      const typoLists = lists.filter(
        (l) =>
          l.title.toLowerCase() === 'on progess' ||
          l.title.toLowerCase() === 'on progress' ||
          l.title.toLowerCase() === 'in progess'
      );

      const canonicalInProgress = lists.find(
        (l) => l.title.trim().toLowerCase() === 'in progress'
      );

      for (const typoList of typoLists) {
        if (canonicalInProgress && canonicalInProgress._id.toString() !== typoList._id.toString()) {
          // Both exist: reassign tasks from typo list to canonical In Progress list
          const movedTasks = await Task.updateMany(
            { listId: typoList._id },
            { listId: canonicalInProgress._id }
          );
          console.log(
            `[Cleanup] Project "${project.title}": Moved ${movedTasks.modifiedCount} tasks from typo list "${typoList.title}" to "In Progress"`
          );
          await List.findByIdAndDelete(typoList._id);
          projectWasModified = true;
        } else {
          // Only typo list exists: rename it directly to "In Progress"
          await List.findByIdAndUpdate(typoList._id, { title: 'In Progress' });
          console.log(
            `[Cleanup] Project "${project.title}": Renamed typo list "${typoList.title}" to "In Progress"`
          );
          projectWasModified = true;
        }
      }

      // Re-fetch lists after typo resolution
      lists = await List.find({ projectId: project._id }).sort({ order: 1 });

      // 2. Ensure each canonical title exists exactly once, and remove any extra unexpected duplicate lists
      for (let i = 0; i < CANONICAL_TITLES.length; i++) {
        const canonicalTitle = CANONICAL_TITLES[i];
        const matchingLists = lists.filter(
          (l) => l.title.trim().toLowerCase() === canonicalTitle.toLowerCase()
        );

        if (matchingLists.length === 0) {
          // Missing canonical list: create it
          const created = await List.create({
            projectId: project._id,
            title: canonicalTitle,
            order: i,
            createdBy: project.createdBy,
          });
          lists.push(created);
          projectWasModified = true;
          console.log(`[Cleanup] Project "${project.title}": Created missing list "${canonicalTitle}"`);
        } else if (matchingLists.length > 1) {
          // Multiple duplicates of the same canonical list: merge into matchingLists[0]
          const keeper = matchingLists[0];
          for (let j = 1; j < matchingLists.length; j++) {
            const dupe = matchingLists[j];
            await Task.updateMany({ listId: dupe._id }, { listId: keeper._id });
            await List.findByIdAndDelete(dupe._id);
            console.log(`[Cleanup] Project "${project.title}": Deleted duplicate list "${dupe.title}"`);
          }
          projectWasModified = true;
        }
      }

      // 3. Remove any non-canonical lists by moving tasks to "To Do" and deleting
      lists = await List.find({ projectId: project._id }).sort({ order: 1 });
      const todoList = lists.find((l) => l.title.trim().toLowerCase() === 'to do');

      for (const list of lists) {
        const isCanonical = CANONICAL_TITLES.some(
          (ct) => ct.toLowerCase() === list.title.trim().toLowerCase()
        );
        if (!isCanonical) {
          if (todoList) {
            await Task.updateMany({ listId: list._id }, { listId: todoList._id });
          }
          await List.findByIdAndDelete(list._id);
          projectWasModified = true;
          console.log(`[Cleanup] Project "${project.title}": Deleted non-canonical list "${list.title}"`);
        }
      }

      // 4. Normalize list orders strictly to 0, 1, 2, 3
      lists = await List.find({ projectId: project._id });
      for (let i = 0; i < CANONICAL_TITLES.length; i++) {
        const title = CANONICAL_TITLES[i];
        const targetList = lists.find((l) => l.title.trim().toLowerCase() === title.toLowerCase());
        if (targetList && targetList.order !== i) {
          await List.findByIdAndUpdate(targetList._id, { order: i, title });
          projectWasModified = true;
        }
      }

      if (projectWasModified) {
        affectedProjectsCount++;
        affectedProjectsList.push({ id: project._id, title: project.title });
      }
    }

    console.log('\n=== LIST CLEANUP SUMMARY ===');
    console.log(`Total projects checked: ${projects.length}`);
    console.log(`Affected projects modified: ${affectedProjectsCount}`);
    if (affectedProjectsList.length > 0) {
      console.log('Modified projects:');
      affectedProjectsList.forEach((p) => console.log(`  - ${p.title} (${p.id})`));
    }
    console.log('============================\n');
  } catch (error) {
    console.error('[Cleanup] Error during execution:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected from MongoDB.');
  }
}

runCleanup();
