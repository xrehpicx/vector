// Issue grouping fields
export type IssueGroupByField =
  | 'none'
  | 'priority'
  | 'status'
  | 'assignee'
  | 'team'
  | 'project';

// Project grouping fields
export type ProjectGroupByField = 'none' | 'status' | 'team' | 'lead';

// Generic group structure
export interface Group<T> {
  key: string;
  label: string;
  icon?: string | null;
  color?: string | null;
  /** Avatar data for person-based groups (assignee, lead) */
  avatar?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
  items: T[];
}

/**
 * Group items by a key extractor, returning groups in insertion order
 * with a "none" bucket for items missing the field.
 */
function groupByField<T>(
  items: T[],
  getKey: (item: T) => string,
  getLabel: (item: T) => string,
  opts?: {
    getIcon?: (item: T) => string | null | undefined;
    getColor?: (item: T) => string | null | undefined;
    getAvatar?: (item: T) => Group<T>['avatar'];
  },
): Group<T>[] {
  const map = new Map<string, Group<T>>();

  for (const item of items) {
    const key = getKey(item) || '__none__';
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        key,
        label: key === '__none__' ? 'No value' : getLabel(item),
        icon: opts?.getIcon?.(item) ?? null,
        color: opts?.getColor?.(item) ?? null,
        avatar: opts?.getAvatar?.(item) ?? null,
        items: [item],
      });
    }
  }

  // Move "none" group to end
  const groups = Array.from(map.values());
  const noneIdx = groups.findIndex(g => g.key === '__none__');
  if (noneIdx > -1) {
    const [noneGroup] = groups.splice(noneIdx, 1);
    groups.push(noneGroup);
  }

  return groups;
}

// Issue row shape (only the fields we need for grouping)
interface IssueGroupable {
  row: {
    priorityId?: string | null;
    priorityName?: string | null;
    priorityIcon?: string | null;
    priorityColor?: string | null;
    workflowStateId?: string | null;
    workflowStateType?: string | null;
    workflowStateName?: string | null;
    workflowStateIcon?: string | null;
    workflowStateColor?: string | null;
    teamKey?: string | null;
    projectKey?: string | null;
  };
  assigneeIds: string[];
  assignments: Array<{
    assigneeId: string | null;
    assigneeName: string | null;
    assigneeEmail?: string | null;
    assigneeImage?: string | null;
  }>;
}

export function groupIssues<T extends IssueGroupable>(
  items: T[],
  field: IssueGroupByField,
): Group<T>[] {
  switch (field) {
    case 'priority': {
      const groups = groupByField(
        items,
        i => i.row.priorityId || '',
        i => i.row.priorityName || 'Unknown',
        {
          getIcon: i => i.row.priorityIcon,
          getColor: i => i.row.priorityColor,
        },
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No priority';
      return groups;
    }
    case 'status': {
      const groups = groupByField(
        items,
        i => i.row.workflowStateId || '',
        i => i.row.workflowStateName || 'Unknown',
        {
          getIcon: i => i.row.workflowStateIcon,
          getColor: i => i.row.workflowStateColor,
        },
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No status';
      return groups;
    }
    case 'assignee': {
      const groups = groupByField(
        items,
        i => i.assignments[0]?.assigneeId || '',
        i => i.assignments[0]?.assigneeName || 'Unknown',
        {
          getAvatar: i => ({
            name: i.assignments[0]?.assigneeName,
            email: i.assignments[0]?.assigneeEmail,
            image: i.assignments[0]?.assigneeImage,
          }),
        },
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'Unassigned';
      return groups;
    }
    case 'team': {
      const groups = groupByField(
        items,
        i => i.row.teamKey || '',
        i => i.row.teamKey || 'Unknown',
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No team';
      return groups;
    }
    case 'project': {
      const groups = groupByField(
        items,
        i => i.row.projectKey || '',
        i => i.row.projectKey || 'Unknown',
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No project';
      return groups;
    }
    default:
      return [{ key: 'all', label: 'All', items }];
  }
}

// Project row shape
interface ProjectGroupable {
  statusId?: string | null;
  statusType?: string | null;
  statusName?: string | null;
  statusIcon?: string | null;
  statusColor?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  leadEmail?: string | null;
  leadImage?: string | null;
}

export function groupProjects<T extends ProjectGroupable>(
  items: T[],
  field: ProjectGroupByField,
): Group<T>[] {
  switch (field) {
    case 'status': {
      const groups = groupByField(
        items,
        i => i.statusId || '',
        i => i.statusName || 'Unknown',
        {
          getIcon: i => i.statusIcon,
          getColor: i => i.statusColor,
        },
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No status';
      return groups;
    }
    case 'team': {
      const groups = groupByField(
        items,
        i => i.teamId || '',
        i => i.teamName || 'Unknown',
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No team';
      return groups;
    }
    case 'lead': {
      const groups = groupByField(
        items,
        i => i.leadId || '',
        i => i.leadName || 'Unknown',
        {
          getAvatar: i => ({
            name: i.leadName,
            email: i.leadEmail,
            image: i.leadImage,
          }),
        },
      );
      const none = groups.find(g => g.key === '__none__');
      if (none) none.label = 'No lead';
      return groups;
    }
    default:
      return [{ key: 'all', label: 'All', items }];
  }
}
