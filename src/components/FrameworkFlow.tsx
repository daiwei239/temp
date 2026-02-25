import { memo, useEffect, useMemo } from "react";
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Background,
  BaseEdge,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";

type FrameworkNodeInput = {
  id?: string;
  label?: string;
  kind?: string;
};

type FrameworkLinkInput = {
  from?: string;
  to?: string;
  label?: string;
};

type FrameworkFlowProps = {
  nodes: FrameworkNodeInput[];
  links: FrameworkLinkInput[];
};

type DiagramNodeData = {
  title: string;
  kind: string;
  emoji: string;
};

const elk = new ELK();
const NODE_WIDTH = 280;
const NODE_HEIGHT = 88;

const pickNodeEmoji = (kind?: string, label?: string) => {
  const text = `${kind ?? ""} ${label ?? ""}`.toLowerCase();
  if (text.includes("problem") || text.includes("问题")) return "🎯";
  if (text.includes("method") || text.includes("方法")) return "🧩";
  if (text.includes("evidence") || text.includes("实验") || text.includes("证据")) return "📊";
  if (text.includes("data") || text.includes("数据")) return "🗂️";
  return "🔹";
};

const FrameworkNode = memo(({ data }: NodeProps<Node<DiagramNodeData>>) => {
  return (
    <div className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-50 px-4 py-3 text-slate-700 shadow-[0_6px_18px_rgba(148,163,184,0.12)]">
      <p className="mb-1 text-xs text-slate-500">
        {data.emoji} {data.kind || "node"}
      </p>
      <p className="text-[16px] leading-7 text-slate-700">{data.title || "节点"}</p>
    </div>
  );
});
FrameworkNode.displayName = "FrameworkNode";

const FrameworkEdge = memo((props: EdgeProps<Edge>) => {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, data } = props;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Bottom,
    targetX,
    targetY,
    targetPosition: Position.Top,
    curvature: 0.22,
  });

  const label = String(data?.label || "").trim();

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: "#94a3b8", strokeWidth: 1.6 }} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-300 bg-slate-50/95 px-3 py-1 text-[12px] leading-4 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              maxWidth: "170px",
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              textAlign: "center",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
FrameworkEdge.displayName = "FrameworkEdge";

const nodeTypes = { frameworkNode: FrameworkNode };
const edgeTypes = { frameworkEdge: FrameworkEdge };

async function layoutWithElk(nodes: Node<DiagramNodeData>[], edges: Edge[]) {
  const graph = {
    id: "framework-root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.nodeNode": "24",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "SPLINES",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layout = await elk.layout(graph);
  const nextNodes = nodes.map((node) => {
    const hit = layout.children?.find((child) => child.id === node.id);
    return {
      ...node,
      position: {
        x: hit?.x ?? 0,
        y: hit?.y ?? 0,
      },
    };
  });
  return nextNodes;
}

const FrameworkFlowInner = ({ nodes, links }: FrameworkFlowProps) => {
  const initialNodes = useMemo<Node<DiagramNodeData>[]>(() => {
    return nodes.map((node, index) => {
      const id = (node.id || `node-${index}`).trim() || `node-${index}`;
      const title = (node.label || "").trim() || "节点";
      const kind = (node.kind || "").trim() || "node";
      return {
        id,
        type: "frameworkNode",
        position: { x: 0, y: index * (NODE_HEIGHT + 60) },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          title,
          kind,
          emoji: pickNodeEmoji(kind, title),
        },
      };
    });
  }, [nodes]);

  const initialEdges = useMemo<Edge[]>(() => {
    const validNodeIds = new Set(initialNodes.map((n) => n.id));
    return links
      .map((link, index) => {
        const source = (link.from || "").trim();
        const target = (link.to || "").trim();
        if (!source || !target || !validNodeIds.has(source) || !validNodeIds.has(target)) return null;
        return {
          id: `edge-${source}-${target}-${index}`,
          source,
          target,
          type: "frameworkEdge",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#94a3b8",
            width: 18,
            height: 18,
          },
          data: {
            label: (link.label || "").trim(),
          },
        } as Edge;
      })
      .filter(Boolean) as Edge[];
  }, [initialNodes, links]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(initialNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    let mounted = true;
    setRfEdges(initialEdges);
    layoutWithElk(initialNodes, initialEdges).then((next) => {
      if (!mounted) return;
      setRfNodes(next);
    });
    return () => {
      mounted = false;
    };
  }, [initialEdges, initialNodes, setRfEdges, setRfNodes]);

  if (rfNodes.length === 0) return null;

  return (
    <div className="h-[420px] w-full rounded-xl border border-slate-200 bg-gradient-to-b from-white via-slate-50/70 to-blue-50/35">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.45, maxZoom: 1.2 }}
        minZoom={0.35}
        maxZoom={1.4}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#e5e7eb" />
      </ReactFlow>
    </div>
  );
};

const FrameworkFlow = ({ nodes, links }: FrameworkFlowProps) => {
  return (
    <ReactFlowProvider>
      <FrameworkFlowInner nodes={nodes} links={links} />
    </ReactFlowProvider>
  );
};

export default FrameworkFlow;
