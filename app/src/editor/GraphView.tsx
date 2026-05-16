import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { GraphData, GraphEdge, LinkKind } from "../domain/note";
import { createForceSimulation } from "./graphForce";
import type { SimEdge, SimNode } from "./graphForce";

interface GraphViewProps {
  graph: GraphData;
  activeNoteId: string | null;
  allTags: string[];
  onOpenNote: (noteId: string) => void;
  onBack: () => void;
}

const NODE_RADIUS = 10;
const ACTIVE_RADIUS = 14;
const NODE_COLOR = "rgba(20, 122, 85, 0.78)";
const ACTIVE_COLOR = "var(--xz-green-deep)";
const DIMMED_COLOR = "rgba(20, 122, 85, 0.22)";
const CONCEPT_COLOR = "rgba(91, 103, 219, 0.76)";
const LINK_KIND_META: Record<LinkKind, { label: string; color: string; dim: string; dash?: string }> = {
  note: { label: "文件", color: "rgba(20, 122, 85, 0.38)", dim: "rgba(20, 122, 85, 0.07)" },
  heading: { label: "标题", color: "rgba(31, 111, 235, 0.38)", dim: "rgba(31, 111, 235, 0.08)" },
  block: { label: "块", color: "rgba(191, 125, 0, 0.42)", dim: "rgba(191, 125, 0, 0.08)", dash: "5 4" },
  concept: { label: "概念", color: "rgba(91, 103, 219, 0.38)", dim: "rgba(91, 103, 219, 0.08)", dash: "2 4" },
};
const LINK_KINDS: LinkKind[] = ["note", "heading", "block", "concept"];

export function GraphView({
  graph,
  activeNoteId,
  allTags,
  onOpenNote,
  onBack,
}: GraphViewProps) {
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 800, h: 600 });
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [activeKinds, setActiveKinds] = useState<Set<LinkKind>>(new Set(LINK_KINDS));
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<(GraphEdge & { idx: number }) | null>(null);
  const [focusNeighborhood, setFocusNeighborhood] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<ReturnType<typeof createForceSimulation> | null>(null);
  const animRef = useRef(0);

  const maxNodes = 200;

  const visibleGraph = useMemo(() => {
    const candidateNodes = graph.nodes
      .filter((node) => {
        if (activeTags.size === 0) return true;
        return true;
      })
      .slice(0, maxNodes);

    const candidateNodeIds = new Set(candidateNodes.map((n) => n.id));
    const kindFilteredEdges = graph.edges.filter(
      (e) =>
        candidateNodeIds.has(e.source) &&
        candidateNodeIds.has(e.target) &&
        activeKinds.has((e.kind ?? "note") as LinkKind),
    );
    const neighborhoodIds = new Set<string>();
    if (focusNeighborhood && activeNoteId) {
      neighborhoodIds.add(activeNoteId);
      for (const edge of kindFilteredEdges) {
        if (edge.source === activeNoteId) neighborhoodIds.add(edge.target);
        if (edge.target === activeNoteId) neighborhoodIds.add(edge.source);
      }
    }
    const filteredEdges = focusNeighborhood && activeNoteId
      ? kindFilteredEdges.filter((edge) => neighborhoodIds.has(edge.source) && neighborhoodIds.has(edge.target))
      : kindFilteredEdges;
    const connectedConcepts = new Set(
      filteredEdges.flatMap((edge) => [edge.source, edge.target]),
    );
    const filteredNodes = candidateNodes.filter(
      (node) =>
        (!focusNeighborhood || !activeNoteId || neighborhoodIds.has(node.id)) &&
        (node.kind !== "concept" || connectedConcepts.has(node.id)),
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graph, activeTags, activeKinds, activeNoteId, focusNeighborhood]);

  const simEdges: SimEdge[] = useMemo(
    () => visibleGraph.edges.map((e) => ({ source: e.source, target: e.target })),
    [visibleGraph.edges],
  );

  const highlightedNodes = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return new Set(
      graph.nodes
        .filter((n) => n.title.toLowerCase().includes(q))
        .map((n) => n.id),
    );
  }, [graph.nodes, query]);

  const connectionCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of visibleGraph.edges) {
      count.set(e.source, (count.get(e.source) ?? 0) + 1);
      count.set(e.target, (count.get(e.target) ?? 0) + 1);
    }
    return count;
  }, [visibleGraph.edges]);

  const toggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const toggleKind = useCallback((kind: LinkKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind) && next.size > 1) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const kindCounts = useMemo(() => {
    const counts = new Map<LinkKind, number>();
    for (const edge of graph.edges) {
      const kind = (edge.kind ?? "note") as LinkKind;
      counts.set(kind, (counts.get(kind) ?? 0) + (edge.count ?? 1));
    }
    return counts;
  }, [graph.edges]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      setWidth(Math.max(400, rect.width));
      setHeight(Math.max(300, rect.height));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sim = createForceSimulation(visibleGraph.nodes, simEdges, { width, height, alpha: 0.25 });
    simRef.current = sim;

    let running = true;
    let ticks = 0;

    const loop = () => {
      if (!running) return;
      if (ticks < 400) {
        sim.tick();
        ticks++;
        simulateLayout();
        animRef.current = requestAnimationFrame(loop);
      }
    };

    loop();

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [visibleGraph.nodes, simEdges, width, height]);

  const [layoutVersion, setLayoutVersion] = useState(0);
  const simulateLayout = useCallback(() => {
    setLayoutVersion((v) => v + 1);
  }, []);

  const simNodes = simRef.current?.simNodes;

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const scale = event.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((prev) => {
      const newW = prev.w * scale;
      const newH = prev.h * scale;
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      return {
        x: cx - newW / 2,
        y: cy - newH / 2,
        w: newW,
        h: newH,
      };
    });
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    const svg = event.currentTarget as SVGElement;
    svg.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const startVX = viewBox.x;
    const startVY = viewBox.y;

    const onMove = (e: PointerEvent) => {
      const scale = viewBox.w / width;
      setViewBox((prev) => ({
        ...prev,
        x: startVX - (e.clientX - startX) * scale,
        y: startVY - (e.clientY - startY) * scale,
      }));
    };

    const onUp = () => {
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
    };

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
  }, [viewBox, width]);

  const displayNodes = useMemo(() => {
    const result: { id: string; title: string; path: string; kind?: "note" | "concept"; x: number; y: number; r: number; dimmed: boolean }[] = [];
    if (!simNodes) return result;

    for (const node of visibleGraph.nodes) {
      const pos = simNodes.get(node.id);
      if (!pos) continue;

      const r = node.id === activeNoteId ? ACTIVE_RADIUS : NODE_RADIUS;

      let dimmed = false;
      if (highlightedNodes && !highlightedNodes.has(node.id)) {
        dimmed = true;
      }
      if (hoveredNode && hoveredNode !== node.id) {
        dimmed = true;
      }

      result.push({
        id: node.id,
        title: node.title,
        path: node.path,
        kind: node.kind,
        x: pos.x,
        y: pos.y,
        r,
        dimmed,
      });
    }

    return result;
  }, [visibleGraph.nodes, simNodes, activeNoteId, highlightedNodes, hoveredNode, layoutVersion]);

  const displayEdges = useMemo(() => {
    return visibleGraph.edges.map((edge, idx) => {
      const dimmed = hoveredNode
        ? edge.source !== hoveredNode && edge.target !== hoveredNode
        : highlightedNodes
          ? !highlightedNodes.has(edge.source) && !highlightedNodes.has(edge.target)
          : selectedEdge
            ? selectedEdge.idx !== idx
            : false;
      return { ...edge, idx, dimmed, selected: selectedEdge?.idx === idx };
    });
  }, [visibleGraph.edges, hoveredNode, highlightedNodes, selectedEdge]);

  if (!graph.nodes.length) {
    return (
      <section className="graph-full-view">
        <div className="graph-toolbar">
          <button type="button" onClick={onBack} data-tooltip="返回" aria-label="返回">
            <ArrowLeft size={18} />
          </button>
        </div>
        <p className="empty-state">还没有可显示的图谱。创建一些笔记并添加链接后图谱就会出现。</p>
      </section>
    );
  }

  return (
    <section className="graph-full-view">
      <div className="graph-toolbar">
        <button type="button" onClick={onBack} data-tooltip="返回" aria-label="返回">
          <ArrowLeft size={18} />
        </button>
        <label className="graph-search-box">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记..."
          />
        </label>
        {allTags.length ? (
          <div className="graph-tag-filters">
            {allTags.slice(0, 12).map((tag) => (
              <button
                key={tag}
                type="button"
                className={activeTags.has(tag) ? "is-active" : ""}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        ) : null}
        <div className="graph-summary">
          {visibleGraph.nodes.filter((node) => node.kind !== "concept").length} / {graph.nodes.filter((node) => node.kind !== "concept").length} 篇笔记 · {visibleGraph.edges.length} / {graph.edges.length} 条关系
          {graph.brokenLinks.length ? ` · ${graph.brokenLinks.length} 条断链` : ""}
        </div>
        <button
          type="button"
          className={focusNeighborhood ? "graph-neighborhood-toggle is-active" : "graph-neighborhood-toggle"}
          disabled={!activeNoteId}
          onClick={() => setFocusNeighborhood((value) => !value)}
        >
          当前邻域
        </button>
        <div className="graph-kind-filters" aria-label="关系类型">
          {LINK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={activeKinds.has(kind) ? "is-active" : ""}
              onClick={() => toggleKind(kind)}
              style={{ "--kind-color": LINK_KIND_META[kind].color } as CSSProperties}
            >
              {LINK_KIND_META[kind].label}
              <span>{kindCounts.get(kind) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        <div className="graph-legend" aria-hidden="true">
          {LINK_KINDS.map((kind) => (
            <span key={kind}>
              <i style={{ background: LINK_KIND_META[kind].color }} />
              {LINK_KIND_META[kind].label}
            </span>
          ))}
        </div>
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          width={width}
          height={height}
          role="img"
          aria-label="笔记图谱"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onClick={() => setSelectedEdge(null)}
        >
          {displayEdges.map((edge) => {
            const source = displayNodes.find((n) => n.id === edge.source);
            const target = displayNodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            const kind = (edge.kind ?? "note") as LinkKind;
            const meta = LINK_KIND_META[kind] ?? LINK_KIND_META.note;
            return (
              <line
                key={`${edge.source}-${edge.target}-${edge.idx}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.dimmed ? meta.dim : meta.color}
                strokeWidth={edge.selected ? 3 : kind === "block" ? 1.5 : 1.25}
                strokeDasharray={meta.dash}
                style={{ cursor: "pointer" }}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedEdge(edge);
                }}
              >
                <title>{`${LINK_KIND_META[kind].label}关系：${edge.label || ""}`}</title>
              </line>
            );
          })}
          {displayNodes.map((node) => (
            <g
              key={node.id}
              className={node.id === activeNoteId ? "is-active" : ""}
              style={{ cursor: "pointer", opacity: node.dimmed ? 0.18 : 1 }}
              onClick={() => {
                if (node.kind !== "concept") onOpenNote(node.id);
                else setQuery(node.title.replace(/^#/, ""));
              }}
              onPointerEnter={() => setHoveredNode(node.id)}
              onPointerLeave={() => setHoveredNode(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.id === activeNoteId ? ACTIVE_COLOR : node.dimmed ? DIMMED_COLOR : node.kind === "concept" ? CONCEPT_COLOR : NODE_COLOR}
                stroke="white"
                strokeWidth={node.id === activeNoteId ? 3 : 2}
              />
              <title>{node.kind === "concept" ? `概念：${node.title}` : node.title}</title>
              <text
                x={node.x}
                y={node.y + node.r + 12}
                textAnchor="middle"
                fill={node.id === activeNoteId ? ACTIVE_COLOR : "var(--xz-text-secondary)"}
                fontSize={10}
                style={{ pointerEvents: "none" }}
              >
                {node.title.length > 14 ? node.title.slice(0, 13) + "…" : node.title}
              </text>
            </g>
          ))}
        </svg>
        {selectedEdge ? (
          <div className="graph-edge-detail" role="status">
            <span className={`relation-kind is-${selectedEdge.kind ?? "note"}`}>
              {LINK_KIND_META[(selectedEdge.kind ?? "note") as LinkKind].label}
            </span>
            <strong>{selectedEdge.label || "未命名关系"}</strong>
            <p>{edgeNodeTitle(graph, selectedEdge.source)} {"->"} {edgeNodeTitle(graph, selectedEdge.target)}</p>
            {selectedEdge.targetHeading ? <small>标题：{selectedEdge.targetHeading}</small> : null}
            {selectedEdge.targetBlockId ? <small>块：#{selectedEdge.targetBlockId}</small> : null}
            {selectedEdge.concept ? <small>概念：#{selectedEdge.concept}</small> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const edgeNodeTitle = (graph: GraphData, nodeId: string) =>
  graph.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
