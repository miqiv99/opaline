export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
}

export interface SimEdge {
  source: string;
  target: string;
}

export function createForceSimulation(
  nodes: { id: string; title: string }[],
  edges: SimEdge[],
  options?: { width?: number; height?: number; alpha?: number },
) {
  const width = options?.width ?? 800;
  const height = options?.height ?? 600;
  const alpha = options?.alpha ?? 0.3;

  const simNodes = new Map<string, SimNode>();
  for (const n of nodes) {
    simNodes.set(n.id, {
      id: n.id,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
    });
  }

  function tick() {
    for (const [idA, a] of simNodes) {
      for (const [idB, b] of simNodes) {
        if (idA >= idB) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 500 / (dist * dist);
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        if (a.fx === undefined) { a.vx -= fx; a.vy -= fy; }
        if (b.fx === undefined) { b.vx += fx; b.vy += fy; }
      }
    }

    for (const edge of edges) {
      const source = simNodes.get(edge.source);
      const target = simNodes.get(edge.target);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 80) * alpha * 0.02;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (source.fx === undefined) { source.vx += fx; source.vy += fy; }
      if (target.fx === undefined) { target.vx -= fx; target.vy -= fy; }
    }

    for (const n of simNodes.values()) {
      if (n.fx !== undefined) continue;
      n.vx += (width / 2 - n.x) * alpha * 0.002;
      n.vy += (height / 2 - n.y) * alpha * 0.002;
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.85;
      n.vy *= 0.85;
    }
  }

  return { simNodes, tick };
}
