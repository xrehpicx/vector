export const ISSUE_PRIORITY_DEFAULTS = [
  { name: "No priority", weight: 0, color: "#94a3b8", icon: "Minus" },
  { name: "Low", weight: 1, color: "#34d399", icon: "ArrowDown" },
  { name: "Medium", weight: 2, color: "#facc15", icon: "ArrowRight" },
  { name: "High", weight: 3, color: "#fb923c", icon: "ArrowUp" },
  { name: "Urgent", weight: 4, color: "#f87171", icon: "ChevronsUp" },
] as const;

export const ISSUE_STATE_DEFAULTS = [
  {
    name: "Backlog",
    position: 0,
    color: "#6b7280",
    type: "backlog",
    icon: "Circle",
  },
  {
    name: "To Do",
    position: 1,
    color: "#3b82f6",
    type: "todo",
    icon: "CircleDot",
  },
  {
    name: "In Progress",
    position: 2,
    color: "#f59e0b",
    type: "in_progress",
    icon: "Loader",
  },
  {
    name: "Done",
    position: 3,
    color: "#10b981",
    type: "done",
    icon: "CheckCircle",
  },
  {
    name: "Canceled",
    position: 4,
    color: "#ef4444",
    type: "canceled",
    icon: "XCircle",
  },
] as const;

export const PROJECT_STATUS_DEFAULTS = [
  {
    name: "Backlog",
    position: 0,
    color: "#6b7280",
    type: "backlog",
    icon: "Square",
  },
  {
    name: "Planned",
    position: 1,
    color: "#3b82f6",
    type: "planned",
    icon: "CircleDot",
  },
  {
    name: "In Progress",
    position: 2,
    color: "#f59e0b",
    type: "in_progress",
    icon: "Play",
  },
  {
    name: "Completed",
    position: 3,
    color: "#10b981",
    type: "completed",
    icon: "Check",
  },
  {
    name: "Canceled",
    position: 4,
    color: "#ef4444",
    type: "canceled",
    icon: "X",
  },
] as const;
