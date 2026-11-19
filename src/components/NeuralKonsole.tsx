import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Send, Command, Loader2, ChevronRight, RotateCcw } from 'lucide-react';

export type KonsoleDirective = {
  id: string;
  taskDescription: string;
  domainHint?: string;
  algorithmTag?: string;
  politenessTier?: string;
};

type Message = {
  id: string;
  role: 'user' | 'system';
  content: string;
  metadata?: any;
};

interface NeuralKonsoleProps {
  externalDirective?: KonsoleDirective | null;
  onLogEvent?: (message: string, level: 'info' | 'success' | 'warn' | 'error', node?: string) => void;
  onLedgerUpdated?: () => void;
}

const QUICK_DIRECTIVES = [
  {
    label: 'Audit Paper Ledger & BTC Price',
    prompt: 'Check our authoritative paper balance and fetch the live XXBTZUSD ticker price using Kraken CLI.',
    domainHint: 'trading',
    algorithmTag: 'ledger_audit',
  },
  {
    label: 'Buy 0.02 BTC Market (Paper)',
    prompt: 'Execute a paper buy order for 0.02 BTC/USD at market using execute_kraken_command ("paper buy BTC/USD 0.02 --type market") and report the updated paper balance.',
    domainHint: 'trading',
    algorithmTag: 'paper_order_execution',
  },
  {
    label: 'Solve 0/1 Knapsack Recurrence',
    prompt: 'Solve the 0/1 knapsack problem with dynamic programming, derive the recurrence relation, and prove time/space complexity.',
    domainHint: 'dev_dp',
    algorithmTag: 'knapsack_01',
  },
  {
    label: 'XGBoost vs Transformer Benchmark',
    prompt: 'Compare XGBoost vs Transformer architecture for high-frequency tabular orderbook sequence modeling.',
    domainHint: 'ml_30core',
    algorithmTag: 'transformer_selection',
  },
];

export default function NeuralKonsole({
  externalDirective,
  onLogEvent,
  onLedgerUpdated,
}: NeuralKonsoleProps) {
  const [interactionId, setInteractionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'OMEGA-NIO Interactive Neural Konsole online. Connected to Gemini 3.8 Flash Interactions API with native Kraken-CLI v0.5.1 tool calling. Select a quick directive below, click any node in the Topology Map to dispatch its preset workflow, or enter a custom command.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastExternalIdRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const dispatchDirective = useCallback(
    async (
      promptText: string,
      opts?: { domainHint?: string; algorithmTag?: string; politenessTier?: string }
    ) => {
      if (!promptText.trim() || isLoading) return;

      const userMsg: Message = {
        id: Math.random().toString(36).substring(2),
        role: 'user',
        content: promptText.trim(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      onLogEvent?.(
        `Konsole directive dispatched [${opts?.algorithmTag || 'operator_override'}]: "${promptText.slice(0, 68)}..."`,
        'info',
        'NEURAL-KONSOLE'
      );

      try {
        const res = await fetch('/api/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskDescription: promptText.trim(),
            isComplexWorkflow: true,
            domainHint: opts?.domainHint,
            algorithmTag: opts?.algorithmTag || 'operator_override',
            politenessTier: opts?.politenessTier || 'neutral',
            previousInteractionId: interactionId,
          }),
        });

        const data = await res.json();

        if (data.metadata?.interactionId) {
          setInteractionId(data.metadata.interactionId);
        }

        const isErr = data.metadata?.error || Boolean(data.error);
        const outputText = data.output || data.error || JSON.stringify(data);

        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2),
            role: 'system',
            content: outputText,
            metadata: {
              latency: data.latencyMs,
              nodeId: data.coreNodeId,
              interactionId: data.metadata?.interactionId,
              domain: data.classification?.domain,
            },
          },
        ]);

        onLogEvent?.(
          isErr
            ? `Konsole execution error: ${outputText.slice(0, 90)}`
            : `Konsole synthesis completed in ${data.latencyMs || 0}ms via ${data.coreNodeId || 'omega-nio'}`,
          isErr ? 'error' : 'success',
          'NEURAL-CORE'
        );
        onLedgerUpdated?.();
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2),
            role: 'system',
            content: `Error connecting to core: ${err.message}`,
          },
        ]);
        onLogEvent?.(`Konsole transport failure: ${err.message}`, 'error', 'NEURAL-KONSOLE');
      } finally {
        setIsLoading(false);
      }
    },
    [interactionId, isLoading, onLogEvent, onLedgerUpdated]
  );

  useEffect(() => {
    if (externalDirective && externalDirective.id !== lastExternalIdRef.current) {
      lastExternalIdRef.current = externalDirective.id;
      dispatchDirective(externalDirective.taskDescription, {
        domainHint: externalDirective.domainHint,
        algorithmTag: externalDirective.algorithmTag,
        politenessTier: externalDirective.politenessTier,
      });
    }
  }, [externalDirective, dispatchDirective]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    await dispatchDirective(text);
  };

  const handleResetSession = () => {
    setInteractionId(undefined);
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'system',
        content: 'Session chain reset. Ready for new operator directives.',
      },
    ]);
    onLogEvent?.('Neural Konsole interaction chain reset.', 'info', 'NEURAL-KONSOLE');
  };

  return (
    <div className="bg-[#0a0c10] border border-slate-800 rounded-xl flex flex-col overflow-hidden h-[460px] font-mono mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-slate-800 bg-[#121620]">
        <div className="flex items-center gap-2">
          <Command className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-300 tracking-wider uppercase">
            Neural Konsole · Interactive Orchestrator
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {interactionId && (
            <span className="tabular-nums text-slate-400">
              Chain: {interactionId.substring(0, 10)}...
            </span>
          )}
          <button
            type="button"
            onClick={handleResetSession}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset Chain
          </button>
        </div>
      </div>

      {/* Quick Operator Directives */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-800/80 bg-[#0d1017]">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-1">
          Quick Directives:
        </span>
        {QUICK_DIRECTIVES.map((qd) => (
          <button
            key={qd.label}
            type="button"
            disabled={isLoading}
            onClick={() =>
              dispatchDirective(qd.prompt, {
                domainHint: qd.domainHint,
                algorithmTag: qd.algorithmTag,
              })
            }
            className="px-2.5 py-1 rounded bg-slate-800/90 hover:bg-blue-600/30 hover:border-blue-500/50 text-slate-200 border border-slate-700/80 text-[11px] transition-colors disabled:opacity-50"
          >
            {qd.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-y-auto text-xs leading-relaxed flex flex-col gap-4 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
                  : 'bg-[#121620] border border-slate-700 text-slate-300'
              }`}
            >
              {msg.role === 'system' && (
                <div className="flex items-center gap-2 mb-1.5 opacity-80">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  <span className="font-semibold text-[10px] tracking-wider text-emerald-400">
                    OMEGA-NIO CORE RESPONSE
                  </span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.metadata && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-3 text-[10px] text-slate-400 tabular-nums">
                  {msg.metadata.latency != null && <span>Latency: {msg.metadata.latency}ms</span>}
                  {msg.metadata.nodeId && <span>Node: {msg.metadata.nodeId}</span>}
                  {msg.metadata.domain && <span>Domain: {msg.metadata.domain}</span>}
                  {msg.metadata.interactionId && (
                    <span>Chain: {msg.metadata.interactionId.substring(0, 8)}...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="bg-[#121620] border border-slate-700 rounded-lg p-3 flex items-center gap-2 text-slate-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              <span>Synthesizing & executing Kraken CLI tools...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-slate-800 bg-[#121620] flex gap-2"
      >
        <div className="relative flex-1">
          <ChevronRight className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Ask the orchestrator to check balances, place paper orders, analyze markets, or solve DP/ML problems..."
            className="w-full bg-[#0a0c10] border border-slate-700 text-slate-200 rounded pl-8 pr-4 py-2 outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[110px]"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
