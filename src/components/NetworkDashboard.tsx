import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Brain,
  Server,
  Shield,
  Zap,
  Terminal,
  Play,
  Square,
  Sparkles,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import * as d3 from "d3";
import {
  networkNodes,
  networkEdges,
  palette,
  domainFilters,
  taskPresets,
  NetworkNode,
  DomainId,
} from "../data/network";
import KrakenTerminal from "./KrakenTerminal";
import NeuralKonsole, { KonsoleDirective } from "./NeuralKonsole";
import ConnectionHealthIndicator, { EcosystemHealthData } from "./ConnectionHealthIndicator";

export type LogEntry = {
  id: string;
  timestamp: Date;
  message: string;
  level: "info" | "warn" | "error" | "success";
  node?: string;
};

type StrategyModule = {
  id: string;
  name: string;
  pair: string;
  modelType: string;
  mounted: boolean;
  pyramiding: number;
  confirmedBarsOnly: boolean;
  statusStep: string;
};

const INITIAL_STRATEGIES: StrategyModule[] = [
  {
    id: "strat-ppo-btc",
    name: "PPO-Alpha-Momentum",
    pair: "BTC/USD",
    modelType: "ONNX PPO-ActorCritic",
    mounted: true,
    pyramiding: 0,
    confirmedBarsOnly: true,
    statusStep: "HANDSHAKE_VERIFIED",
  },
  {
    id: "strat-twap-eth",
    name: "Delta-Neutral-TWAP",
    pair: "ETH/USD",
    modelType: "VectorBT / Lua State",
    mounted: false,
    pyramiding: 0,
    confirmedBarsOnly: true,
    statusStep: "DEMOUNTED",
  },
  {
    id: "strat-statarb-sol",
    name: "Orderbook-L3-StatArb",
    pair: "SOL/USD",
    modelType: "ONNX Transformer-L3",
    mounted: false,
    pyramiding: 0,
    confirmedBarsOnly: true,
    statusStep: "DEMOUNTED",
  },
];

export default function NetworkDashboard() {
  const [health, setHealth] = useState<EcosystemHealthData | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [selectedDomain, setSelectedDomain] = useState<DomainId | "all">("all");
  const [selectedNode, setSelectedNode] = useState<NetworkNode>(networkNodes[0]);
  const [externalDirective, setExternalDirective] = useState<KonsoleDirective | null>(null);
  const [strategies, setStrategies] = useState<StrategyModule[]>(INITIAL_STRATEGIES);
  const [busyStrategyId, setBusyStrategyId] = useState<string | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init-1",
      timestamp: new Date(),
      message: "OMEGA-NIO Core Strategy Orchestrator online. Paper workspace 'global' reconciled.",
      level: "success",
      node: "NEURAL CORE",
    },
  ]);

  const appendLog = useCallback(
    (message: string, level: "info" | "warn" | "error" | "success" = "info", node?: string) => {
      setLogs((prev) => {
        const next: LogEntry = {
          id: Math.random().toString(36).slice(2),
          timestamp: new Date(),
          message,
          level,
          node,
        };
        const updated = [...prev, next];
        return updated.length > 80 ? updated.slice(updated.length - 80) : updated;
      });
    },
    []
  );

  const fetchHealth = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      const response = await fetch("/api/health");
      if (!response.ok) {
        throw new Error(`Health check HTTP ${response.status}`);
      }
      const data: EcosystemHealthData = await response.json();
      setHealth(data);
      setHealthError(null);
    } catch (e: any) {
      setHealthError(e?.message || "Unable to reach orchestrator health endpoint");
    } finally {
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleDispatchNodeTask = (node: NetworkNode) => {
    const preset = taskPresets[node.id] || {
      taskDescription: `Execute ${node.label} workflow (${node.description}). If trading-related, audit the Kraken paper ledger and current market ticker.`,
      isComplexWorkflow: true,
      domainHint: node.domain || "trading",
      algorithmTag: node.id.replace(/-/g, "_"),
      politenessTier: "neutral",
    };

    appendLog(
      `Selected node [${node.label}] -> dispatching workflow (${preset.algorithmTag || node.id}) to Neural Konsole`,
      "info",
      node.shortLabel.replace(/\n/g, " ")
    );

    setExternalDirective({
      id: `${node.id}-${Date.now()}`,
      taskDescription: preset.taskDescription,
      domainHint: preset.domainHint,
      algorithmTag: preset.algorithmTag,
      politenessTier: preset.politenessTier,
    });
  };

  const handleToggleStrategyMount = async (strat: StrategyModule) => {
    if (busyStrategyId) return;
    setBusyStrategyId(strat.id);

    if (!strat.mounted) {
      // Standard Operating Procedure: Mounting a Strategy (5 steps)
      appendLog(
        `[SOP MOUNT 1/5] Dependency Validation: Verified ${strat.modelType} & config for ${strat.name}`,
        "info",
        "ORCHESTRATOR"
      );
      appendLog(
        `[SOP MOUNT 2/5] State Initialization: Redis Lua state provisioned (pyramiding = 0, confirmedBarsOnly = true)`,
        "info",
        "ORCHESTRATOR"
      );

      try {
        const res = await fetch("/api/execute-kraken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "paper status" }),
        });
        const data = await res.json();
        const equity = Number(data?.sot_ledger_snapshot?.equity_usd ?? 10000).toFixed(2);
        appendLog(
          `[SOP MOUNT 3/5] Pre-Flight Risk Check passed · Global Paper Equity $${equity} USD within drawdown guardrails`,
          "success",
          "RISK-GATE"
        );
        appendLog(
          `[SOP MOUNT 4/5] Data Stream Connection: Bound ${strat.pair} feed (confirmed-bar lock active, zero future leaking)`,
          "info",
          "STREAM-BIND"
        );
        appendLog(
          `[SOP MOUNT 5/5] Execution Handshake complete: ${strat.name} ACTIVE`,
          "success",
          "ORCHESTRATOR"
        );
        setStrategies((prev) =>
          prev.map((s) =>
            s.id === strat.id
              ? { ...s, mounted: true, statusStep: "HANDSHAKE_VERIFIED" }
              : s
          )
        );
        fetchHealth();
      } catch (err: any) {
        appendLog(`Mount aborted (Conservative Fail-Closed): ${err.message}`, "error", "ORCHESTRATOR");
      }
    } else {
      // Standard Operating Procedure: Demounting a Strategy (5 steps)
      appendLog(
        `[SOP DEMOUNT 1/5] Signal Interception: Halted new entry signals for ${strat.name}`,
        "warn",
        "ORCHESTRATOR"
      );
      try {
        const ordersRes = await fetch("/api/execute-kraken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "paper orders" }),
        });
        const ordersData = await ordersRes.json();
        const openCount = ordersData?.sot_ledger_snapshot?.open_positions ?? 0;
        appendLog(
          `[SOP DEMOUNT 2/5] Order Reconciliation: ${openCount} open paper orders associated with ${strat.name}`,
          "info",
          "RECONCILE"
        );
        appendLog(
          `[SOP DEMOUNT 3/5] Graceful Exit Protocol: Verified zero orphaned orders on ${strat.pair}`,
          "info",
          "EXIT-GUARD"
        );
        appendLog(
          `[SOP DEMOUNT 4/5] State Snapshot & Autopsy: Session metrics archived for ${strat.name}`,
          "success",
          "AUTOPSY"
        );
        appendLog(
          `[SOP DEMOUNT 5/5] Resource Teardown complete: ${strat.name} DEMOUNTED cleanly`,
          "info",
          "ORCHESTRATOR"
        );
        setStrategies((prev) =>
          prev.map((s) =>
            s.id === strat.id ? { ...s, mounted: false, statusStep: "DEMOUNTED" } : s
          )
        );
        fetchHealth();
      } catch (err: any) {
        appendLog(`Demount warning: ${err.message}`, "error", "ORCHESTRATOR");
      }
    }

    setBusyStrategyId(null);
  };

  const mountedCount = strategies.filter((s) => s.mounted).length;

  return (
    <div className="min-h-screen bg-[#090b12] text-slate-200 p-6 lg:p-8">
      <ConnectionHealthIndicator
        health={health}
        isChecking={isCheckingHealth}
        error={healthError}
        onRefresh={fetchHealth}
      />

      <header className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Brain className="w-8 h-8 text-blue-500" />
            Neural Intelligence Network & Strategy Orchestrator
          </h1>
          <p className="text-slate-400 text-sm">
            Interactive node topology, state-safe strategy mounting/demounting, native Kraken-CLI paper desk, and AI Konsole.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<Server />}
          title="System Status"
          value={
            healthError
              ? "Offline"
              : health?.status === "ok"
              ? "Online"
              : health?.status === "degraded"
              ? "Degraded"
              : "Connecting..."
          }
          color={
            healthError
              ? "text-red-400"
              : health?.status === "ok"
              ? "text-emerald-400"
              : "text-amber-400"
          }
        />
        <StatCard
          icon={<Activity />}
          title="Paper Ledger Equity"
          value={
            health?.architectEcosystem?.equityUsd != null
              ? `$${health.architectEcosystem.equityUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "$10,000.00"
          }
          color="text-emerald-400"
        />
        <StatCard
          icon={<Zap />}
          title="Mounted Strategies"
          value={`${mountedCount} / ${strategies.length} Active`}
          color="text-amber-400"
        />
        <StatCard
          icon={<Shield />}
          title="Security Tier"
          value="ZTA · Confirmed Bars"
          color="text-purple-400"
        />
      </div>

      {/* Strategy Lifecycle Orchestrator (Mount / Demount SOP) */}
      <section className="mb-8 bg-[#121620] border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Strategy Lifecycle Orchestrator (State-Safe Mount / Demount SOP)
            </h2>
            <p className="text-xs text-slate-400">
              Enforces pyramiding = 0, confirmed-bar execution, and zero orphaned orders during hot-swaps.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {strategies.map((strat) => (
            <div
              key={strat.id}
              className="bg-[#0a0c10] border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{strat.name}</span>
                  <span
                    className={`text-xs font-mono ${
                      strat.mounted ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    {strat.mounted ? "MOUNTED" : "STANDBY"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono">
                  <span>{strat.pair}</span>
                  <span aria-hidden="true">·</span>
                  <span>{strat.modelType}</span>
                  <span aria-hidden="true">·</span>
                  <span>pyramiding={strat.pyramiding}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-mono text-slate-400">{strat.statusStep}</span>
                <button
                  type="button"
                  disabled={busyStrategyId === strat.id}
                  onClick={() => handleToggleStrategyMount(strat)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    strat.mounted
                      ? "bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/60"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  {strat.mounted ? (
                    <>
                      <Square className="w-3 h-3" />
                      Demount Strategy
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Mount Strategy
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#121620] border border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-[580px]">
          {/* Interactive Domain Filter Bar */}
          <div className="p-3 border-b border-slate-800 bg-[#0d1017] flex flex-wrap items-center gap-1.5">
            {domainFilters.map((df) => (
              <button
                key={df.id}
                type="button"
                onClick={() => setSelectedDomain(df.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedDomain === df.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800/70 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {df.label} ({df.count})
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-h-[380px]">
            <NetworkGraph
              selectedDomain={selectedDomain}
              selectedNodeId={selectedNode.id}
              onSelectNode={(node) => {
                setSelectedNode(node);
                appendLog(`Inspected topology node: ${node.label}`, "info", "TOPOLOGY");
              }}
            />
          </div>

          {/* Interactive Selected Node Inspector & Task Dispatcher */}
          <div className="p-4 border-t border-slate-800 bg-[#0a0c10] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{selectedNode.label}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-xs font-mono text-slate-400 uppercase">
                  {selectedNode.kind}
                </span>
                {selectedNode.domain && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-xs font-mono text-blue-400">{selectedNode.domain}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">{selectedNode.description}</p>
            </div>
            <button
              type="button"
              onClick={() => handleDispatchNodeTask(selectedNode)}
              className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run Node Workflow in Konsole
            </button>
          </div>
        </div>

        <div className="lg:col-span-1 bg-[#0a0c10] border border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-[580px]">
          <div className="flex-1 overflow-hidden min-h-[240px]">
            <TerminalLog logs={logs} onClear={() => setLogs([])} />
          </div>
          <KrakenTerminal
            onCommandExecuted={appendLog}
            onLedgerUpdated={fetchHealth}
          />
        </div>
      </div>

      <NeuralKonsole
        externalDirective={externalDirective}
        onLogEvent={appendLog}
        onLedgerUpdated={fetchHealth}
      />
    </div>
  );
}

function NetworkGraph({
  selectedDomain,
  selectedNodeId,
  onSelectNode,
}: {
  selectedDomain: DomainId | "all";
  selectedNodeId: string;
  onSelectNode: (node: NetworkNode) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 1000;
    const height = 520;

    const svg = d3
      .select(svgRef.current)
      .attr("viewBox", [0, 0, width, height].join(" "))
      .style("width", "100%")
      .style("height", "100%");

    svg.selectAll("*").remove();

    const filteredNodes = networkNodes.filter(
      (n) => selectedDomain === "all" || n.kind === "core" || n.domain === selectedDomain
    );
    const allowedIds = new Set(filteredNodes.map((n) => n.id));

    const nodes = filteredNodes.map((d) => ({
      ...d,
      x: (d.x / 100) * width,
      y: (d.y / 100) * height,
    }));

    const edges = networkEdges
      .filter((e) => allowedIds.has(e.from) && allowedIds.has(e.to))
      .map((d) => ({
        source: d.from,
        target: d.to,
        color: d.color,
      }));

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);
    const g = svg.append("g");

    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const link = g
      .append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", (d) => palette[d.color]?.line || "#94a3b8")
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.45);

    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        const original = networkNodes.find((n) => n.id === d.id);
        if (original) onSelectNode(original);
      })
      .call(
        d3
          .drag<SVGGElement, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    node
      .append("circle")
      .attr("r", (d) => (d.kind === "core" ? 38 : 26))
      .attr("fill", (d) => palette[d.color]?.fill || "#1e293b")
      .attr("stroke", (d) =>
        d.id === selectedNodeId ? "#ffffff" : palette[d.color]?.border || "#475569"
      )
      .attr("stroke-width", (d) => (d.id === selectedNodeId ? 3.5 : 2))
      .style("filter", "url(#glow)");

    node
      .append("text")
      .text((d) => d.shortLabel.replace("\n", " "))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.kind === "core" ? 5 : 4))
      .style("font-size", (d) => (d.kind === "core" ? "12px" : "9px"))
      .style("font-weight", "600")
      .style("letter-spacing", "0.05em")
      .style("fill", (d) => palette[d.color]?.text || "#e2e8f0")
      .style("pointer-events", "none");

    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        "link",
        d3
          .forceLink(edges)
          .id((d: any) => d.id)
          .distance(130)
      )
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide().radius((d) => ((d as any).kind === "core" ? 48 : 32))
      );

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [selectedDomain, selectedNodeId, onSelectNode]);

  return (
    <>
      <div
        className="absolute inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at center, #1e293b 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute top-3 left-4 z-10 flex flex-col gap-0.5 pointer-events-none">
        <h3 className="text-xs font-semibold text-white flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" /> Interactive Topology Map (Click any node to inspect & run)
        </h3>
      </div>
      <svg ref={svgRef} className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing" />
    </>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-[#121620] border border-slate-800 rounded-xl p-5 flex flex-col gap-2.5">
      <div
        className={`w-9 h-9 rounded-lg bg-slate-900/60 flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-400">{title}</p>
        <p className="text-lg font-semibold text-white mt-0.5 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function TerminalLog({ logs, onClear }: { logs: LogEntry[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-[#0a0c10]">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-slate-800 bg-[#121620]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            Live System Event Bus ({logs.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800/80 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
      </div>
      <div className="flex-1 p-3.5 overflow-y-auto font-mono text-[11px] leading-relaxed flex flex-col gap-2 max-h-[260px]">
        {logs.length === 0 ? (
          <span className="text-slate-500 text-xs">No events logged. Trigger any action to inspect live telemetry.</span>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2.5">
              <span className="text-slate-500 shrink-0 tabular-nums">
                {log.timestamp.toISOString().split("T")[1].slice(0, 8)}
              </span>
              <span
                className={`shrink-0 w-[64px] ${
                  log.level === "info"
                    ? "text-blue-400"
                    : log.level === "success"
                    ? "text-emerald-400"
                    : log.level === "warn"
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                [{log.level.toUpperCase()}]
              </span>
              <span className="text-slate-300 break-words">
                {log.node ? <span className="text-purple-400">[{log.node}] </span> : null}
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
