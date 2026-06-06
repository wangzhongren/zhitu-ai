export interface MindNode {
  id: string
  parent_id: string | null
  label: string
  layer_depth: number
  status: 'stable' | 'warning' | 'fog'
  x: number
  y: number
  cognitive_dimension: string
  description: string
}

export interface MindEdge {
  id: string
  source_id: string
  target_id: string
  type: 'normal' | 'conflict'
  description: string
}

export interface Metrics {
  depth: number
  consistency: number
  blind_zones: number
}

export interface GraphUpdate {
  nodes: MindNode[]
  edges: MindEdge[]
  metrics: Metrics
}

export type GraphOp =
  | { action: 'add_node'; id: string; parent_id: string | null; label: string; layer_depth: number; cognitive_dimension: string; description: string }
  | { action: 'update_node'; id: string; changes: Partial<Pick<MindNode, 'label' | 'status' | 'description' | 'parent_id' | 'layer_depth' | 'cognitive_dimension'>> }
  | { action: 'delete_node'; id: string }
  | { action: 'add_edge'; id: string; source_id: string; target_id: string; type: 'normal' | 'conflict'; description: string }
  | { action: 'delete_edge'; id: string }

export interface GraphOpsData {
  operations: GraphOp[]
  metrics: Metrics
}

export interface ChatMessage {
  role: 'user' | 'ai'
  content: string
}

export interface SessionInfo {
  id: string
  title: string
  topic: string
  created_at: string
  updated_at: string
}
