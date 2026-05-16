import { ArrowLeft, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "../domain/note";
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
const EDGE_COLOR = "rgba(20, 122, 85, 0.22)";
const NODE_COLOR = "rgba(20, 122, 85, 0.78)";
const ACTIVE_COLOR = "var(--xz-green-deep)";
const DIMMED_COLOR = "rgba(20, 122, 85, 0.22)";

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
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<ReturnType<typeof createForceSimulation> | null>(null);
  const animRef = useRef(0);

  const maxNodes = 200;

  const visibleGraph = useMemo(() => {
    const filteredNodes = graph.nodes
      .filter((node) => {
        if (activeTags.size === 0) return true;
        return true;
      })
      .slice(0, maxNodes);

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = graph.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graph, activeTags]);

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
    const result: { id: string; title: string; path: string; x: number; y: number; r: number; dimmed: boolean }[] = [];
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
          : false;
      return { ...edge, idx, dimmed };
    });
  }, [visibleGraph.edges, hoveredNode, highlightedNodes]);

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
          {graph.nodes.length} 篇笔记 · {graph.edges.length} 条链接
          {graph.brokenLinks.length ? ` · ${graph.brokenLinks.length} 条断链` : ""}
        </div>
      </div>
      <div className="graph-canvas" ref={containerRef}>
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          width={width}
          height={height}
          role="img"
          aria-label="笔记图谱"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
        >
          {displayEdges.map((edge) => {
            const source = displayNodes.find((n) => n.id === edge.source);
            const target = displayNodes.find((n) => n.id === edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={`${edge.source}-${edge.target}-${edge.idx}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={edge.dimmed ? "rgba(20, 122, 85, 0.06)" : EDGE_COLOR}
                strokeWidth={1.2}
              />
            );
          })}
          {displayNodes.map((node) => (
            <g
              key={node.id}
              className={node.id === activeNoteId ? "is-active" : ""}
              style={{ cursor: "pointer", opacity: node.dimmed ? 0.18 : 1 }}
              onClick={() => onOpenNote(node.id)}
              onPointerEnter={() => setHoveredNode(node.id)}
              onPointerLeave={() => setHoveredNode(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.id === activeNoteId ? ACTIVE_COLOR : node.dimmed ? DIMMED_COLOR : NODE_COLOR}
                stroke="white"
                strokeWidth={node.id === activeNoteId ? 3 : 2}
              />
              <title>{node.title}</title>
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
      </div>
    </section>
  );
}
