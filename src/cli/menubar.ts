/**
 * Vector menu bar tray icon — pure TypeScript using systray2.
 * No native compilation required.
 */

import SysTray from 'systray2';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

const CONFIG_DIR = join(homedir(), '.vector');
const BRIDGE_CONFIG_FILE = join(CONFIG_DIR, 'bridge.json');
const PID_FILE = join(CONFIG_DIR, 'bridge.pid');
const LIVE_ACTIVITIES_FILE = join(CONFIG_DIR, 'live-activities.json');

// ── Icon ────────────────────────────────────────────────────────────────────

// Base64-encoded Vector icon PNG (18x18, used as tray icon)
function loadIconBase64(): string {
  // Try to load from assets
  const iconPath = join(CONFIG_DIR, 'assets', 'vector-menubar.png');
  if (existsSync(iconPath)) {
    return readFileSync(iconPath).toString('base64');
  }
  // Fallback: a minimal 1x1 transparent PNG
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

// ── State ───────────────────────────────────────────────────────────────────

interface BridgeConfig {
  deviceId: string;
  displayName: string;
  userId: string;
  convexUrl: string;
}

interface LiveActivity {
  _id: string;
  issueKey: string;
  issueTitle: string;
  provider: string;
  title?: string;
  status: string;
  latestSummary?: string;
}

function loadConfig(): BridgeConfig | null {
  try {
    return JSON.parse(readFileSync(BRIDGE_CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function loadActivities(): LiveActivity[] {
  try {
    return JSON.parse(readFileSync(LIVE_ACTIVITIES_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function isBridgeRunning(): { running: boolean; pid?: number } {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf-8').trim());
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false };
  }
}

function getOrgSlug(): string {
  try {
    const session = JSON.parse(
      readFileSync(join(CONFIG_DIR, 'cli-default.json'), 'utf-8'),
    );
    return session.activeOrgSlug ?? 'oss-lab';
  } catch {
    return 'oss-lab';
  }
}

function providerLabel(provider: string): string {
  if (provider === 'claude_code') return 'Claude';
  if (provider === 'codex') return 'Codex';
  return provider;
}

// ── Menu Builder ────────────────────────────────────────────────────────────

type MenuItem = {
  title: string;
  tooltip?: string;
  enabled?: boolean;
  checked?: boolean;
};

function buildMenu(): {
  items: MenuItem[];
  actions: Map<number, () => void>;
} {
  const config = loadConfig();
  const { running, pid } = isBridgeRunning();
  const activities = loadActivities();
  const items: MenuItem[] = [];
  const actions = new Map<number, () => void>();
  let idx = 0;

  // Header
  if (running && config) {
    items.push({
      title: `Vector Bridge — Running (PID ${pid})`,
      enabled: false,
    });
    idx++;
    items.push({ title: `  ${config.displayName}`, enabled: false });
    idx++;
  } else if (config) {
    items.push({ title: 'Vector Bridge — Offline', enabled: false });
    idx++;
  } else {
    items.push({ title: 'Vector Bridge — Not Configured', enabled: false });
    idx++;
    items.push({
      title: '  Run: vcli service start',
      enabled: false,
    });
    idx++;
  }

  // Separator
  items.push({ title: '---', enabled: false });
  idx++;

  // Live activities
  if (activities.length > 0) {
    items.push({ title: 'Active Sessions', enabled: false });
    idx++;

    const orgSlug = getOrgSlug();
    for (const a of activities) {
      const label = `${a.issueKey} — ${a.title ?? a.issueTitle} (${providerLabel(a.provider)})`;
      items.push({ title: label, tooltip: a.latestSummary });
      const issueKey = a.issueKey;
      actions.set(idx, () => {
        const url = `http://localhost:3000/${orgSlug}/issues/${issueKey}`;
        try {
          execSync(`open "${url}"`, { stdio: 'ignore' });
        } catch {
          /* ignore */
        }
      });
      idx++;
    }

    items.push({ title: '---', enabled: false });
    idx++;
  }

  // Controls
  if (running) {
    items.push({ title: 'Stop Bridge' });
    actions.set(idx, () => {
      try {
        if (pid) process.kill(pid, 'SIGTERM');
      } catch {
        /* ignore */
      }
    });
    idx++;

    items.push({ title: 'Restart Bridge' });
    actions.set(idx, () => {
      try {
        if (pid) process.kill(pid, 'SIGTERM');
        setTimeout(() => {
          execSync('vcli service start', { stdio: 'ignore' });
        }, 2000);
      } catch {
        /* ignore */
      }
    });
    idx++;
  } else if (config) {
    items.push({ title: 'Start Bridge' });
    actions.set(idx, () => {
      try {
        execSync('vcli service start', { stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    });
    idx++;
  }

  items.push({ title: '---', enabled: false });
  idx++;

  items.push({ title: 'Open Vector' });
  actions.set(idx, () => {
    try {
      execSync('open http://localhost:3000', { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  });
  idx++;

  items.push({ title: 'Quit' });
  actions.set(idx, () => {
    process.exit(0);
  });
  idx++;

  return { items, actions };
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function startMenuBar(): Promise<void> {
  const icon = loadIconBase64();
  const { items, actions } = buildMenu();

  const systray = new SysTray({
    menu: {
      icon,
      title: '',
      tooltip: 'Vector Bridge',
      items: items.map(item => ({
        title: item.title,
        tooltip: item.tooltip ?? '',
        checked: item.checked ?? false,
        enabled: item.enabled ?? true,
        hidden: false,
      })),
    },
    debug: false,
    copyDir: false,
  });

  void systray.onClick(action => {
    const handler = actions.get(action.seq_id);
    if (handler) handler();
  });

  // Refresh the menu every 15 seconds
  setInterval(() => {
    const { items: newItems, actions: newActions } = buildMenu();
    // systray2 doesn't support full menu rebuild, but we can update items
    // For now, the initial menu is static. User can quit + restart for refresh.
    // TODO: Use systray.sendAction to update individual items
    void newItems;
    void newActions;
  }, 15_000);
}

// Run standalone if called directly
if (
  process.argv[1]?.endsWith('menubar.ts') ||
  process.argv[1]?.endsWith('menubar.js')
) {
  startMenuBar().catch(e => {
    console.error('Menu bar error:', e);
    process.exit(1);
  });
}
