import type { WorkspacePurpose, AIbuddyTaskMeta } from "@aibuddy/shared";

export type AIbuddyTaskListKind = "pinned" | "archived" | "timeline" | "active";
export type AIbuddyTaskListSortBy = "created" | "updated";

export interface AIbuddyTaskListWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: WorkspacePurpose;
}

export interface AIbuddyTaskListQuery {
  kind: AIbuddyTaskListKind;
  workspaceScopes: AIbuddyTaskListWorkspaceScope[];
  sortBy: AIbuddyTaskListSortBy;
  search?: string;
  limit?: number;
}

export type AIbuddyTaskListItem = AIbuddyTaskMeta & {
  searchSnippet?: string;
  searchSnippets?: string[];
};

export interface AIbuddyTaskListResult {
  items: AIbuddyTaskListItem[];
  total: number;
  hasMore: boolean;
}

export type AIbuddyTaskGroupColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface AIbuddyTaskGroup {
  id: string;
  title: string;
  color: AIbuddyTaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

export interface AIbuddyGroupedTaskRef {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export type AIbuddyGroupedTaskViewTopLevelNodeRef =
  | { type: "group"; groupId: string }
  | { type: "task"; task: AIbuddyGroupedTaskRef };

export type AIbuddyGroupedTaskViewNode =
  | {
      type: "group";
      group: AIbuddyTaskGroup;
      tasks: AIbuddyTaskListItem[];
      sortOrder?: number;
    }
  | {
      type: "task";
      task: AIbuddyTaskListItem;
      sortOrder?: number;
    };

export interface AIbuddyGroupedTaskView {
  nodes: AIbuddyGroupedTaskViewNode[];
}

export interface AIbuddyGroupedTaskViewQuery {
  workspaceScopes: AIbuddyTaskListWorkspaceScope[];
  includeAllWorkspaces?: boolean;
}

// ── grouped 原始结构（不 join tasks 表）──
// grouped 视图的任务数据源迁到 sessions-index 后，服务端只提供分组结构
// （task_groups / task_group_members / task_group_view_node_orders），
// 由客户端与 sessions-index 会话做 join。

/** 组成员引用（不含任务 meta；task 内容由 sessions-index 提供）。 */
export interface AIbuddyGroupedTaskViewStructureMember {
  groupId: string;
  /** 服务端口径 workspaceKey（resolveWorkspaceKey：identity ?? path），join 匹配键。 */
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  /** null = 尚未落 sort_order（新加入组）；客户端按 addedAt 降序补内存序。 */
  sortOrder: number | null;
  addedAt: number;
}

/** 顶层节点排序（task_group_view_node_orders，node_key 已解析为结构化引用）。 */
export type AIbuddyGroupedTaskViewStructureTopOrder =
  | { type: "group"; groupId: string; sortOrder: number }
  | { type: "task"; workspaceKey: string; taskId: string; sortOrder: number };

export interface AIbuddyGroupedTaskViewStructure {
  /** 已按 workspaceScopes 可见性过滤的 group（bootstrap workspace group 只在其 workspace 可见）。 */
  groups: AIbuddyTaskGroup[];
  /** 全量组成员（含不可见 group 的成员——顶层排除规则需要全量判断）。 */
  members: AIbuddyGroupedTaskViewStructureMember[];
  topLevelOrders: AIbuddyGroupedTaskViewStructureTopOrder[];
}

export interface AIbuddyGroupedTaskViewOrderInput {
  workspaceScopes: AIbuddyTaskListWorkspaceScope[];
  topLevelNodes: AIbuddyGroupedTaskViewTopLevelNodeRef[];
  groups: Array<{
    groupId: string;
    taskRefs: AIbuddyGroupedTaskRef[];
  }>;
}

export interface AIbuddyWorkspaceEventSubscriptionParams {
  workspacePath: string;
  workspaceIdentity?: string;
}
