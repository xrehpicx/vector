'use client';

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

export type AssistantIssueDrop = {
  id: string;
  key: string;
  title: string;
  href: string;
  icon?: string | null;
  color?: string | null;
};

type IssueColumnDropHandler = (issue: IssueDragData) => void;
type AssistantIssueDropHandler = (issue: IssueDragData) => void;

export type IssueDragData = AssistantIssueDrop & {
  type: 'issue';
  origin: 'table' | 'kanban';
  assignmentId?: string | null;
  stateId?: string | null;
};

type AssistantIssueDropZoneData = {
  type: 'assistant-issue-drop';
  onIssueDrop: AssistantIssueDropHandler;
};

type IssueColumnDropData = {
  type: 'issue-column-drop';
  onIssueDrop: IssueColumnDropHandler;
};

type DropData = AssistantIssueDropZoneData | IssueColumnDropData;

type AssistantIssueDndContextValue = {
  activeIssueDrag: IssueDragData | null;
};

const AssistantIssueDndContext =
  createContext<AssistantIssueDndContextValue | null>(null);

function isIssueDragData(value: unknown): value is IssueDragData {
  if (!value || typeof value !== 'object') return false;
  return (value as { type?: string }).type === 'issue';
}

function isIssueColumnDropData(value: unknown): value is IssueColumnDropData {
  if (!value || typeof value !== 'object') return false;
  return (value as { type?: string }).type === 'issue-column-drop';
}

function isAssistantIssueDropZoneData(
  value: unknown,
): value is AssistantIssueDropZoneData {
  if (!value || typeof value !== 'object') return false;
  return (value as { type?: string }).type === 'assistant-issue-drop';
}

export function AssistantIssueDndProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const [activeIssueDrag, setActiveIssueDrag] = useState<IssueDragData | null>(
    null,
  );

  const resetActiveIssue = (
    _event?: DragCancelEvent | DragEndEvent | DragStartEvent,
  ) => {
    setActiveIssueDrag(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeData = event.active.data.current;
    setActiveIssueDrag(isIssueDragData(activeData) ? activeData : null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current;
    const overData = event.over?.data.current as DropData | undefined;

    if (!isIssueDragData(activeData) || !overData) {
      resetActiveIssue(event);
      return;
    }

    if (isAssistantIssueDropZoneData(overData)) {
      overData.onIssueDrop(activeData);
      resetActiveIssue(event);
      return;
    }

    if (isIssueColumnDropData(overData)) {
      overData.onIssueDrop(activeData);
    }

    resetActiveIssue(event);
  };

  const value = useMemo<AssistantIssueDndContextValue>(
    () => ({
      activeIssueDrag,
    }),
    [activeIssueDrag],
  );

  return (
    <AssistantIssueDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={resetActiveIssue}
      >
        {children}
      </DndContext>
    </AssistantIssueDndContext.Provider>
  );
}

export function useAssistantIssueDnd() {
  const context = useContext(AssistantIssueDndContext);
  if (!context) {
    throw new Error(
      'useAssistantIssueDnd must be used within AssistantIssueDndProvider',
    );
  }
  return context;
}
