import React, { useState } from 'react';
import { Terminal, RefreshCw, AlertCircle, CheckCircle, ShieldCheck, Database, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface KrakenTerminalProps {
  onCommandExecuted?: (summary: string, level: 'info' | 'success' | 'warn' | 'error', node?: string) => void;
  onLedgerUpdated?: () => void;
}

export default function KrakenTerminal({ onCommandExecuted, onLedgerUpdated }: KrakenTerminalProps) {
  const [command, setCommand] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Quick Order Ticket state wired to /api/execute-order
  const [pair, setPair] = useState('BTC/USD');
  const [volume, setVolume] = useState('0.01');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');

  const handleExecute = async (cmdToRun?: string) => {
    const targetCommand = (cmdToRun || command).trim();
    if (!targetCommand) return;

    setIsExecuting(true);
    setResult(null);
    onCommandExecuted?.(`Dispatching CLI: kraken ${targetCommand}`, 'info', 'KRAKEN-CLI');

    try {
      const res = await fetch('/api/execute-kraken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: targetCommand }),
      });
      const data = await res.json();
      setResult(data);
      if (!cmdToRun) {
        setCommand('');
      }
      const ok = data.execution_status === 'SUCCESS';
      onCommandExecuted?.(
        ok
          ? `CLI [${data.command_meta?.name || targetCommand}] reconciled (${data.state_machine?.current_node || 'OK'})`
          : `CLI [${targetCommand}] failed: ${data.error || 'Rejected'}`,
        ok ? 'success' : 'error',
        'OMEGA-NIO'
      );
      onLedgerUpdated?.();
    } catch (err: any) {
      setResult({ execution_status: 'FAILED', error: err.message });
      onCommandExecuted?.(`CLI transport error: ${err.message}`, 'error', 'KRAKEN-CLI');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDirectOrder = async (side: 'buy' | 'sell') => {
    const volNum = parseFloat(volume);
    if (isNaN(volNum) || volNum <= 0) return;

    setIsExecuting(true);
    setResult(null);
    onCommandExecuted?.(
      `Submitting ${side.toUpperCase()} ${volNum} ${pair} (${orderType.toUpperCase()}) to Paper Ledger`,
      'info',
      'ORDER-EXEC'
    );

    try {
      const res = await fetch('/api/execute-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          type: side,
          ordertype: orderType,
          volume: volNum,
          price: orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : undefined,
          strategyId: 'operator-ticket',
        }),
      });
      const data = await res.json();
      setResult(data);
      const ok = data.execution_status === 'SUCCESS';
      onCommandExecuted?.(
        ok
          ? `Order filled: ${side.toUpperCase()} ${volNum} ${pair} · Equity $${Number(data.sot_ledger_snapshot?.equity_usd || 0).toFixed(2)}`
          : `Order rejected: ${data.error || 'Execution failed'}`,
        ok ? 'success' : 'error',
        'ORDER-EXEC'
      );
      onLedgerUpdated?.();
    } catch (err: any) {
      setResult({ execution_status: 'FAILED', error: err.message });
      onCommandExecuted?.(`Order error: ${err.message}`, 'error', 'ORDER-EXEC');
    } finally {
      setIsExecuting(false);
    }
  };

  const isFailed =
    result?.execution_status === 'FAILED' ||
    result?.execution_status === 'REJECTED' ||
    result?.success === false;

  return (
    <div className="bg-[#0a0c10] border-t border-slate-800 p-4 shrink-0 flex flex-col gap-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="uppercase tracking-wider text-[10px]">
            OMEGA-NIO · Kraken CLI & Paper Order Desk
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>ZTA / PoLP</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-400">v0.5.1 Native</span>
        </div>
      </div>

      {/* Direct Paper Order Ticket */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-[#121620] p-2.5 rounded-lg border border-slate-800/90">
        <select
          aria-label="Trading Pair"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          disabled={isExecuting}
          className="bg-[#0a0c10] border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-[11px] outline-none focus:border-blue-500"
        >
          <option value="BTC/USD">BTC/USD</option>
          <option value="ETH/USD">ETH/USD</option>
          <option value="SOL/USD">SOL/USD</option>
        </select>

        <input
          type="number"
          step="0.001"
          min="0.001"
          aria-label="Order Volume"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          disabled={isExecuting}
          placeholder="Vol"
          className="bg-[#0a0c10] border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-[11px] outline-none focus:border-blue-500 tabular-nums"
        />

        <select
          aria-label="Order Type"
          value={orderType}
          onChange={(e) => setOrderType(e.target.value as 'market' | 'limit')}
          disabled={isExecuting}
          className="bg-[#0a0c10] border border-slate-700 text-slate-200 rounded px-2 py-1.5 text-[11px] outline-none focus:border-blue-500"
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>

        <button
          type="button"
          onClick={() => handleDirectOrder('buy')}
          disabled={isExecuting}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          Buy Paper
        </button>

        <button
          type="button"
          onClick={() => handleDirectOrder('sell')}
          disabled={isExecuting}
          className="bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          <ArrowDownRight className="w-3.5 h-3.5" />
          Sell Paper
        </button>
      </div>

      {orderType === 'limit' && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">Limit Price (USD):</span>
          <input
            type="number"
            step="0.1"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder="e.g. 75000"
            className="bg-[#121620] border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-[11px] outline-none focus:border-blue-500 tabular-nums"
          />
        </div>
      )}

      {/* Quick CLI Command Buttons */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {[
          'paper status',
          'paper balance',
          'paper orders',
          'ticker XXBTZUSD',
          'orderbook XXBTZUSD',
          'status',
        ].map((presetCmd) => (
          <button
            key={presetCmd}
            type="button"
            onClick={() => handleExecute(presetCmd)}
            disabled={isExecuting}
            className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            {presetCmd}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleExecute();
        }}
        className="flex gap-2"
      >
        <span className="text-blue-500 py-1.5 font-bold">kraken</span>
        <input
          className="flex-1 bg-[#121620] border border-slate-700 text-slate-200 rounded px-3 py-1.5 outline-none focus:border-blue-500 font-mono"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. paper status, paper balance, ticker XXBTZUSD, server-time"
          disabled={isExecuting}
        />
        <button
          type="submit"
          disabled={isExecuting || !command.trim()}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded px-4 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isExecuting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
          Run CLI
        </button>
      </form>

      {result && (
        <div
          className={`mt-1 p-3 rounded border ${
            isFailed
              ? 'bg-red-500/10 border-red-500/20 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
          } flex flex-col gap-2 max-h-64 overflow-y-auto`}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              {isFailed ? (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="uppercase tracking-wider">
                {result.execution_status || (result.success ? 'SUCCESS' : 'FAILED')}
              </span>
              {result.command_meta?.name && (
                <span className="text-slate-400 font-normal">[{result.command_meta.name}]</span>
              )}
            </div>

            {result.state_machine?.current_node && (
              <div className="flex items-center gap-1 text-[9px] text-slate-400">
                <Layers className="w-3 h-3 text-blue-400" />
                <span>Node: {result.state_machine.current_node}</span>
              </div>
            )}
          </div>

          {result.guardian_audit && (
            <div className="flex items-center gap-3 text-[10px] text-slate-400 bg-black/30 px-2 py-1 rounded">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Sanitization: {result.guardian_audit.sanitization_clear ? 'PASS' : 'FAIL'}
              </span>
              <span>Policy: {result.guardian_audit.policy_pass ? 'APPROVED' : 'GATED'}</span>
            </div>
          )}

          {result.sot_ledger_snapshot && (
            <div className="flex items-center gap-3 text-[10px] text-emerald-400/90 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-900/30 tabular-nums">
              <Database className="w-3 h-3" />
              <span>
                Paper Equity: ${Number(result.sot_ledger_snapshot.equity_usd || 0).toLocaleString()} USD
              </span>
              <span>Mode: {result.sot_ledger_snapshot.mode || 'paper'}</span>
            </div>
          )}

          <div className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed break-all bg-black/40 p-2 rounded">
            {result.error ? (
              <span className="text-red-400">{result.error}</span>
            ) : result.output ? (
              JSON.stringify(result.output, null, 2)
            ) : (
              JSON.stringify(result, null, 2)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
