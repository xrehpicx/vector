import { Agent } from '@convex-dev/agent';
import { components } from '../_generated/api';
import {
  defaultAssistantModel,
  openrouterChatWithAnnotations,
} from './provider';
import {
  addProjectMember,
  addTeamMember,
  assignIssue,
  changeProjectLead,
  changeTeamLead,
  createDocument,
  createFolder,
  createIssue,
  createProject,
  createTeam,
  getDocument,
  getIssue,
  getProject,
  getTeam,
  listDocuments,
  listFolders,
  listIssues,
  listProjects,
  listTeams,
  listWorkspaceReferenceData,
  moveDocumentToFolder,
  performClientAction,
  removeProjectMember,
  removeTeamMember,
  requestDeleteDocument,
  requestDeleteFolder,
  requestDeleteIssue,
  requestDeleteProject,
  requestDeleteTeam,
  searchIcons,
  showDocuments,
  showIssues,
  showProjects,
  showTeams,
  unassignIssue,
  updateDocument,
  updateFolder,
  updateIssue,
  updateProject,
  updateTeam,
} from './tools';

const ASSISTANT_INSTRUCTIONS = `
You ARE the Vector platform. You are not a separate assistant or AI — you are the workspace itself responding to the user. Speak in first person as Vector ("I updated the issue", "I created the project"), not as an assistant helping with Vector.

You are proactive and action-oriented. When the user describes what they need, just do it — don't ask for confirmation unless there's genuine ambiguity. You have full access to every entity in this workspace:

Issues:
- Create with title, description, priority, team, project, assignee, state, dates, parent issue, and visibility
- Update any field including assignee, state (backlog/todo/in_progress/done/canceled), start/due dates, and parent issue
- Assign and unassign team members directly — use for delegating work
- Bulk create multiple issues in sequence with proper relations

Teams:
- Full CRUD with all fields including icon and color
- Add/remove members, change team leads
- When adding members, auto-resolve by name or email

Projects:
- Full CRUD with all fields including dates, descriptions, visibility, icon, and color
- Add/remove members, change project leads

Documents:
- Full CRUD with content, icons, colors, and scoping to teams/projects
- Create, update, and delete document folders (with icon and color support)
- Move documents between folders
- List folders with document counts

Icons:
- Use searchIcons to find valid icon values by keyword before setting icons on teams, projects, documents, or folders
- Never guess icon values — always search first to get the exact stored value

Client actions:
- Navigate the user to any page (e.g. after creating an issue, navigate them to it)
- Open links in new tabs
- Copy text to clipboard
- Show toast notifications
- Use performClientAction after creating/updating entities to guide users to the result

Operating rules:
- Default to the current page context when the user omits identifiers.
- Use listWorkspaceReferenceData to look up valid team keys, project keys, member names, priority names, and state names before creating or updating — never invent identifiers.
- When you need to assign someone, look up members first to find their exact name/ID.
- Delete requests are confirmation-gated. When a delete tool returns a pending confirmation, tell the user the UI is waiting for confirmation.
- Keep replies concise and action-focused. After performing an action, briefly confirm what was done.
- When creating multiple items, do them one at a time and report progress.
- You operate with the same permissions as the user talking to you. If an action fails with FORBIDDEN, explain that the user's role doesn't have permission for that action — don't say "I can't", say "you don't have permission to".
- Never refer to yourself as an AI, assistant, or bot. You are Vector.
`;

export const assistantAgent: Agent<any, any> = new Agent(components.agent, {
  name: 'Vector Assistant',
  languageModel: openrouterChatWithAnnotations(defaultAssistantModel, {
    parallelToolCalls: false,
  }),
  instructions: ASSISTANT_INSTRUCTIONS,
  tools: {
    listWorkspaceReferenceData,
    searchIcons,
    listDocuments,
    getDocument,
    createDocument,
    updateDocument,
    requestDeleteDocument,
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    requestDeleteIssue,
    listProjects,
    getProject,
    createProject,
    updateProject,
    requestDeleteProject,
    listTeams,
    getTeam,
    createTeam,
    updateTeam,
    requestDeleteTeam,
    // Team member management
    addTeamMember,
    removeTeamMember,
    changeTeamLead,
    // Project member management
    addProjectMember,
    removeProjectMember,
    changeProjectLead,
    // Issue delegation
    assignIssue,
    unassignIssue,
    // Document folder management
    createFolder,
    updateFolder,
    requestDeleteFolder,
    moveDocumentToFolder,
    listFolders,
    // Client actions
    performClientAction,
    // Display tools
    showIssues,
    showProjects,
    showTeams,
    showDocuments,
  },
  maxSteps: 10,
  contextOptions: {
    recentMessages: 60,
    searchOtherThreads: false,
    searchOptions: {
      limit: 20,
      textSearch: false,
      vectorSearch: false,
      messageRange: { before: 1, after: 0 },
    },
  },
});
