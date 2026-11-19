import React from 'react';
import { Terminal, Layers, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export type SubsystemState = 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE' | 'CHECKING';

export interface EcosystemHealthData {
  status?: 'ok' | 'degraded' | 'error';
  service?: string;
  timestamp?: string;
  krakenCli?: {
    state: SubsystemState;
    binaryFound: boolean;
    version: string | null;
    latencyMs: number | null;
    message: string;
  };
  architectEcosystem?: {
    state: SubsystemState;
    engine: string;
    workspace: string | null;
    mode: string | null;
    equityUsd: number | null;
    exchangeStatus: string | null;
    latencyMs: number | null;
    message: string;
  };
}

interface ConnectionHealthIndicatorProps {
  health: EcosystemHealthData | null;
  isChecking: boolean;
  error: string | null;
  onRefresh: () => void;
}

function getPulseStyles(state: SubsystemState) {
  switch (state) {
    case 'ONLINE':
      return {
        dot: 'bg-emerald-400',
        ring: 'bg-emerald-400/50',
        text: 'text-emerald-400',
        label: 'Connected',
      };
    case 'DEGRADED':
      return {
        dot: 'bg-amber-400',
        ring: 'bg-amber-400/50',
        text: 'text-amber-400',
        label: 'Degraded',
      };
    case 'UNAVAILABLE':
      return {
        dot: 'bg-red-500',
        ring: 'bg-red-500/50',
        text: 'text-red-400',
        label: 'Unavailable',
      };
    case 'CHECKING':
    default:
      return {
        dot: 'bg-blue-400',
        ring: 'bg-blue-400/50',
        text: 'text-blue-400',
        label: 'Probing...',
      };
  }
}

function PulseBeacon({ state }: { state: SubsystemState }) {
  const styles = getPulseStyles(state);

  return (
    <span className="relative flex h-3 w-3 items-center justify-center shrink-0" aria-hidden="true">
      <motion.span
        className={`absolute inline-flex h-full w-full rounded-full ${styles.ring}`}
        animate={{
          scale: [1, 2.1, 1],
          opacity: [0.75, 0, 0.75],
        }}
        transition={{
          duration: state === 'CHECKING' ? 1.1 : 2.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${styles.dot}`} />
    </span>
  );
}

export default function ConnectionHealthIndicator({
  health,
  isChecking,
  error,
  onRefresh,
}: ConnectionHealthIndicatorProps) {
  const cliState: SubsystemState = error
    ? 'UNAVAILABLE'
    : health?.krakenCli?.state ?? (isChecking ? 'CHECKING' : 'UNAVAILABLE');

  const architectState: SubsystemState = error
    ? 'UNAVAILABLE'
    : health?.architectEcosystem?.state ?? (isChecking ? 'CHECKING' : 'UNAVAILABLE');

  const cliStyles = getPulseStyles(cliState);
  const architectStyles = getPulseStyles(architectState);

  const lastChecked = health?.timestamp
    ? new Date(health.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <section
      aria-label="Connection Health Status"
      className="mb-8 rounded-xl border border-slate-800/90 bg-[#121620] px-6 py-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
          {/* Kraken-CLI Binary Connection Health */}
          <div className="flex items-start gap-3.5">
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900/90 text-slate-300 border border-slate-800">
              <Terminal className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <PulseBeacon state={cliState} />
                <span className="text-sm font-semibold text-white tracking-tight">
                  Kraken-CLI Binary
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className={`text-xs font-medium ${cliStyles.text}`}>
                  {cliStyles.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                <span>
                  {health?.krakenCli?.version
                    ? `v${health.krakenCli.version}`
                    : error
                    ? 'Probe failed'
                    : 'Awaiting version'}
                </span>
                {health?.krakenCli?.latencyMs != null && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>{health.krakenCli.latencyMs}ms</span>
                  </>
                )}
                {health?.krakenCli?.message && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-400 font-sans truncate max-w-[280px]">
                      {health.krakenCli.message}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Architect Trading Ecosystem Health */}
          <div className="flex items-start gap-3.5 md:border-l md:border-slate-800/80 md:pl-6">
            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900/90 text-slate-300 border border-slate-800">
              <Layers className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <PulseBeacon state={architectState} />
                <span className="text-sm font-semibold text-white tracking-tight">
                  Architect Trading Ecosystem
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className={`text-xs font-medium ${architectStyles.text}`}>
                  {architectStyles.label}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                <span>{health?.architectEcosystem?.engine ?? 'OMEGA-NIO'}</span>
                {health?.architectEcosystem?.workspace && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>
                      Workspace: {health.architectEcosystem.workspace} ({health.architectEcosystem.mode ?? 'paper'})
                    </span>
                  </>
                )}
                {health?.architectEcosystem?.equityUsd != null && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-emerald-400">
                      ${health.architectEcosystem.equityUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </>
                )}
                {health?.architectEcosystem?.latencyMs != null && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span>{health.architectEcosystem.latencyMs}ms</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Manual Probe & Timestamp */}
        <div className="flex items-center justify-between lg:justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800/80 shrink-0">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : lastChecked ? (
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Synced {lastChecked}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isChecking}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
            <span>Check Health</span>
          </button>
        </div>
      </div>
    </section>
  );
}
