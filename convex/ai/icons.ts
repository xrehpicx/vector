/**
 * Lightweight icon metadata for the AI assistant's searchIcons tool.
 * This mirrors the icon definitions in src/lib/dynamic-icons.tsx but contains
 * only searchable metadata (no React components), so it's safe for the backend.
 */

interface IconEntry {
  /** Stored value (e.g. "ArrowUp", "font-awesome:FaRocket") */
  value: string;
  /** Human-readable label */
  label: string;
  /** Category grouping */
  category: string;
  /** Icon library */
  library: string;
  /** Extra search keywords */
  keywords: string[];
}

const ICONS: IconEntry[] = [
  // ── Lucide ──
  {
    value: 'ArrowUp',
    label: 'Arrow Up',
    category: 'Priority',
    library: 'lucide',
    keywords: ['up', 'high'],
  },
  {
    value: 'ArrowDown',
    label: 'Arrow Down',
    category: 'Priority',
    library: 'lucide',
    keywords: ['down', 'low'],
  },
  {
    value: 'ArrowRight',
    label: 'Arrow Right',
    category: 'Priority',
    library: 'lucide',
    keywords: ['right', 'medium'],
  },
  {
    value: 'ArrowLeft',
    label: 'Arrow Left',
    category: 'Priority',
    library: 'lucide',
    keywords: ['left'],
  },
  {
    value: 'TrendingUp',
    label: 'Trending Up',
    category: 'Priority',
    library: 'lucide',
    keywords: ['trend', 'growth'],
  },
  {
    value: 'TrendingDown',
    label: 'Trending Down',
    category: 'Priority',
    library: 'lucide',
    keywords: ['trend', 'decline'],
  },
  {
    value: 'ChevronUp',
    label: 'Chevron Up',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'ChevronDown',
    label: 'Chevron Down',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'ChevronsUp',
    label: 'Double Chevron Up',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'ChevronsDown',
    label: 'Double Chevron Down',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Minus',
    label: 'Minus',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Equal',
    label: 'Equal',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Plus',
    label: 'Plus',
    category: 'Priority',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Circle',
    label: 'Circle',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CircleDot',
    label: 'Circle Dot',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CircleCheck',
    label: 'Circle Check',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CircleX',
    label: 'Circle X',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CirclePause',
    label: 'Circle Pause',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CirclePlay',
    label: 'Circle Play',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CircleStop',
    label: 'Circle Stop',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'CheckCircle',
    label: 'Check Circle',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'XCircle',
    label: 'X Circle',
    category: 'State',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Play',
    label: 'Play',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Pause',
    label: 'Pause',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'SkipForward',
    label: 'Skip Forward',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'SkipBack',
    label: 'Skip Back',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'FastForward',
    label: 'Fast Forward',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Rewind',
    label: 'Rewind',
    category: 'Progress',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Check',
    label: 'Check',
    category: 'Status',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'X',
    label: 'X',
    category: 'Status',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Loader',
    label: 'Loader',
    category: 'Status',
    library: 'lucide',
    keywords: ['loading', 'spinner'],
  },
  {
    value: 'Clock',
    label: 'Clock',
    category: 'Status',
    library: 'lucide',
    keywords: ['time'],
  },
  {
    value: 'Timer',
    label: 'Timer',
    category: 'Status',
    library: 'lucide',
    keywords: ['time'],
  },
  {
    value: 'Hourglass',
    label: 'Hourglass',
    category: 'Status',
    library: 'lucide',
    keywords: ['wait'],
  },
  {
    value: 'Ban',
    label: 'Ban',
    category: 'Status',
    library: 'lucide',
    keywords: ['blocked'],
  },
  {
    value: 'AlertCircle',
    label: 'Alert Circle',
    category: 'Status',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'AlertTriangle',
    label: 'Alert Triangle',
    category: 'Status',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Info',
    label: 'Info',
    category: 'Status',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Square',
    label: 'Square',
    category: 'Shape',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Triangle',
    label: 'Triangle',
    category: 'Shape',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Diamond',
    label: 'Diamond',
    category: 'Shape',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Hexagon',
    label: 'Hexagon',
    category: 'Shape',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Octagon',
    label: 'Octagon',
    category: 'Shape',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'GitBranch',
    label: 'Git Branch',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'GitCommit',
    label: 'Git Commit',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'GitMerge',
    label: 'Git Merge',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'RotateCcw',
    label: 'Rotate Counter-clockwise',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'RotateCw',
    label: 'Rotate Clockwise',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Repeat',
    label: 'Repeat',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'RefreshCw',
    label: 'Refresh',
    category: 'Workflow',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Star',
    label: 'Star',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Heart',
    label: 'Heart',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Bookmark',
    label: 'Bookmark',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Flag',
    label: 'Flag',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Target',
    label: 'Target',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Zap',
    label: 'Zap',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Flame',
    label: 'Flame',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  {
    value: 'Settings',
    label: 'Settings',
    category: 'Misc',
    library: 'lucide',
    keywords: [],
  },
  // ── Phosphor ──
  {
    value: 'phosphor:PiKanbanDuotone',
    label: 'Kanban',
    category: 'Workflow',
    library: 'phosphor',
    keywords: ['board'],
  },
  {
    value: 'phosphor:PiRocketLaunchDuotone',
    label: 'Rocket Launch',
    category: 'Workflow',
    library: 'phosphor',
    keywords: ['launch'],
  },
  {
    value: 'phosphor:PiFlowArrowDuotone',
    label: 'Flow Arrow',
    category: 'Workflow',
    library: 'phosphor',
    keywords: ['flow'],
  },
  {
    value: 'phosphor:PiTargetDuotone',
    label: 'Target',
    category: 'Priority',
    library: 'phosphor',
    keywords: ['goal'],
  },
  {
    value: 'phosphor:PiFlagPennantDuotone',
    label: 'Pennant',
    category: 'Misc',
    library: 'phosphor',
    keywords: ['flag'],
  },
  {
    value: 'phosphor:PiSpinnerGapDuotone',
    label: 'Spinner Gap',
    category: 'Status',
    library: 'phosphor',
    keywords: ['loading'],
  },
  {
    value: 'phosphor:PiCheckCircleDuotone',
    label: 'Check Circle',
    category: 'State',
    library: 'phosphor',
    keywords: ['done'],
  },
  {
    value: 'phosphor:PiPauseCircleDuotone',
    label: 'Pause Circle',
    category: 'State',
    library: 'phosphor',
    keywords: ['hold'],
  },
  {
    value: 'phosphor:PiXCircleDuotone',
    label: 'X Circle',
    category: 'State',
    library: 'phosphor',
    keywords: ['cancel'],
  },
  {
    value: 'phosphor:PiClockCountdownDuotone',
    label: 'Countdown',
    category: 'Status',
    library: 'phosphor',
    keywords: ['timer'],
  },
  // ── Remix ──
  {
    value: 'remix:RiRocketLine',
    label: 'Rocket',
    category: 'Workflow',
    library: 'remix',
    keywords: ['launch'],
  },
  {
    value: 'remix:RiFlowChart',
    label: 'Flow Chart',
    category: 'Workflow',
    library: 'remix',
    keywords: ['graph'],
  },
  {
    value: 'remix:RiGitBranchLine',
    label: 'Git Branch',
    category: 'Workflow',
    library: 'remix',
    keywords: [],
  },
  {
    value: 'remix:RiCheckboxCircleLine',
    label: 'Checkbox Circle',
    category: 'State',
    library: 'remix',
    keywords: ['done'],
  },
  {
    value: 'remix:RiPauseCircleLine',
    label: 'Pause Circle',
    category: 'State',
    library: 'remix',
    keywords: [],
  },
  {
    value: 'remix:RiCloseCircleLine',
    label: 'Close Circle',
    category: 'State',
    library: 'remix',
    keywords: [],
  },
  {
    value: 'remix:RiLoader4Line',
    label: 'Loader 4',
    category: 'Status',
    library: 'remix',
    keywords: ['loading', 'spinner'],
  },
  {
    value: 'remix:RiTimerLine',
    label: 'Timer',
    category: 'Status',
    library: 'remix',
    keywords: ['clock'],
  },
  {
    value: 'remix:RiFlag2Line',
    label: 'Flag 2',
    category: 'Misc',
    library: 'remix',
    keywords: [],
  },
  {
    value: 'remix:RiSparklingLine',
    label: 'Sparkling',
    category: 'Misc',
    library: 'remix',
    keywords: ['sparkles'],
  },
  {
    value: 'remix:RiCompass3Line',
    label: 'Compass',
    category: 'Priority',
    library: 'remix',
    keywords: ['direction'],
  },
  // ── Tabler ──
  {
    value: 'tabler:TbProgressCheck',
    label: 'Progress Check',
    category: 'State',
    library: 'tabler',
    keywords: ['done'],
  },
  {
    value: 'tabler:TbProgress',
    label: 'Progress',
    category: 'Progress',
    library: 'tabler',
    keywords: [],
  },
  {
    value: 'tabler:TbClockPause',
    label: 'Clock Pause',
    category: 'Status',
    library: 'tabler',
    keywords: ['hold'],
  },
  {
    value: 'tabler:TbClockPlay',
    label: 'Clock Play',
    category: 'Status',
    library: 'tabler',
    keywords: ['resume'],
  },
  {
    value: 'tabler:TbRoute',
    label: 'Route',
    category: 'Workflow',
    library: 'tabler',
    keywords: ['path'],
  },
  {
    value: 'tabler:TbGitMerge',
    label: 'Git Merge',
    category: 'Workflow',
    library: 'tabler',
    keywords: [],
  },
  {
    value: 'tabler:TbRosetteDiscountCheck',
    label: 'Rosette Check',
    category: 'State',
    library: 'tabler',
    keywords: ['badge'],
  },
  {
    value: 'tabler:TbCircleDashedCheck',
    label: 'Dashed Check',
    category: 'State',
    library: 'tabler',
    keywords: ['circle'],
  },
  {
    value: 'tabler:TbTargetArrow',
    label: 'Target Arrow',
    category: 'Priority',
    library: 'tabler',
    keywords: [],
  },
  {
    value: 'tabler:TbFlag3',
    label: 'Flag 3',
    category: 'Misc',
    library: 'tabler',
    keywords: [],
  },
  {
    value: 'tabler:TbBolt',
    label: 'Bolt',
    category: 'Misc',
    library: 'tabler',
    keywords: ['zap'],
  },
  {
    value: 'tabler:TbFlame',
    label: 'Flame',
    category: 'Misc',
    library: 'tabler',
    keywords: [],
  },
  // ── Font Awesome ──
  {
    value: 'font-awesome:FaRocket',
    label: 'Rocket',
    category: 'Workflow',
    library: 'font-awesome',
    keywords: ['launch'],
  },
  {
    value: 'font-awesome:FaArrowsRotate',
    label: 'Arrows Rotate',
    category: 'Workflow',
    library: 'font-awesome',
    keywords: ['refresh'],
  },
  {
    value: 'font-awesome:FaCircleCheck',
    label: 'Circle Check',
    category: 'State',
    library: 'font-awesome',
    keywords: ['done'],
  },
  {
    value: 'font-awesome:FaCirclePause',
    label: 'Circle Pause',
    category: 'State',
    library: 'font-awesome',
    keywords: [],
  },
  {
    value: 'font-awesome:FaCircleXmark',
    label: 'Circle X',
    category: 'State',
    library: 'font-awesome',
    keywords: ['cancel'],
  },
  {
    value: 'font-awesome:FaHourglassHalf',
    label: 'Hourglass Half',
    category: 'Status',
    library: 'font-awesome',
    keywords: ['wait'],
  },
  {
    value: 'font-awesome:FaBullseye',
    label: 'Bullseye',
    category: 'Priority',
    library: 'font-awesome',
    keywords: ['target'],
  },
  {
    value: 'font-awesome:FaFlag',
    label: 'Flag',
    category: 'Misc',
    library: 'font-awesome',
    keywords: [],
  },
  {
    value: 'font-awesome:FaBolt',
    label: 'Bolt',
    category: 'Misc',
    library: 'font-awesome',
    keywords: ['zap'],
  },
  {
    value: 'font-awesome:FaFire',
    label: 'Fire',
    category: 'Misc',
    library: 'font-awesome',
    keywords: ['flame'],
  },
  {
    value: 'font-awesome:FaRoad',
    label: 'Road',
    category: 'Workflow',
    library: 'font-awesome',
    keywords: ['path'],
  },
  {
    value: 'font-awesome:FaWandMagicSparkles',
    label: 'Magic Sparkles',
    category: 'Misc',
    library: 'font-awesome',
    keywords: ['sparkles'],
  },
];

const VALID_ICON_VALUES = new Set(ICONS.map(i => i.value));

/**
 * Check whether a string is a valid icon value.
 */
export function isValidIconValue(value: string): boolean {
  return VALID_ICON_VALUES.has(value);
}

/**
 * Search available icons by keyword. Matches against label, category, library, and keywords.
 * Returns up to `limit` results (default 10).
 */
export function searchAvailableIcons(
  query: string,
  limit = 10,
): { value: string; label: string; category: string; library: string }[] {
  const q = query.toLowerCase().trim();
  if (!q) return ICONS.slice(0, limit).map(pick);

  const scored: { icon: IconEntry; score: number }[] = [];

  for (const icon of ICONS) {
    let score = 0;
    const labelLower = icon.label.toLowerCase();
    const valueLower = icon.value.toLowerCase();

    // Exact label match
    if (labelLower === q) score += 10;
    // Label starts with query
    else if (labelLower.startsWith(q)) score += 6;
    // Label contains query
    else if (labelLower.includes(q)) score += 4;
    // Value contains query
    else if (valueLower.includes(q)) score += 3;
    // Category match
    else if (icon.category.toLowerCase() === q) score += 2;
    // Library match
    else if (icon.library.toLowerCase() === q) score += 1;
    // Keyword match
    else if (icon.keywords.some(k => k.includes(q) || q.includes(k)))
      score += 5;

    if (score > 0) scored.push({ icon, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => pick(s.icon));
}

function pick(icon: IconEntry) {
  return {
    value: icon.value,
    label: icon.label,
    category: icon.category,
    library: icon.library,
  };
}
