import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { TaskItem } from './TaskItem';

export const ListColumn = ({
  list,
  projectId,
  workspaceId,
  currentUserRole = 'viewer',
  membersMap = null,
  onTaskClick,
}) => {
  const tasks = list.tasks || [];
  const taskIds = tasks.map((t) => t._id);

  // Make the entire column a droppable zone
  const { setNodeRef, isOver } = useDroppable({
    id: list._id,
    data: {
      type: 'Column',
      list,
    },
  });

  const isDragDisabled = currentUserRole === 'viewer';

  return (
    <div
      ref={setNodeRef}
      className={`w-72 sm:w-80 shrink-0 bg-card border rounded-2xl p-3 flex flex-col max-h-[calc(100vh-190px)] shadow-xs transition-colors duration-150 ${
        isOver ? 'border-primary/60 bg-primary/[0.02]' : 'border-border'
      }`}
    >
      {/* Column Header (Fixed Title & Live Task Count Badge - No 3-dot Menu) */}
      <div className="flex items-center justify-between pb-2.5 px-1 border-b border-border select-none">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-xs font-bold font-serif text-foreground truncate cursor-default">
            {list.title}
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-mono font-semibold shrink-0">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Task Cards Container (Sortable & Scrollable) */}
      <div className="flex-1 overflow-y-auto space-y-2 py-2 px-0.5 min-h-[120px]">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskItem
              key={task._id}
              task={task}
              isDragDisabled={isDragDisabled}
              membersMap={membersMap}
              onClick={() => onTaskClick?.(task, list)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="py-8 text-center text-muted-foreground/50 text-xs italic border border-dashed border-border/80 rounded-xl select-none">
            No tasks in this list
          </div>
        )}
      </div>
    </div>
  );
};
