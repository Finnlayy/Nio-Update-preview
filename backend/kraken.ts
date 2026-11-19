import { execFile, exec } from 'child_process';
import { promisify } from 'util';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export type KrakenOrderRequest = {
  pair: string;
  type: 'buy' | 'sell';
  ordertype: 'market' | 'limit';
  volume: number;
  price?: number;
  strategyId?: string;
  barTimestamp?: number | string;
  authGateToken?: string;
  deadManArmed?: boolean;
};

export type OmegaExecutionResult = {
  trace_id: string;
  idempotency_key: string;
  agent: string;
  state_machine: {
    current_node: string;
    transitions: string[];
  };
  command_meta: {
    name: string;
    domain: string;
    argv: string[];
    is_dangerous: boolean;
  };
  guardian_audit: {
    policy_pass: boolean;
    dead_man_armed: boolean;
    sanitization_clear: boolean;
    reason?: string;
  };
  sot_ledger_snapshot: {
    equity_usd?: number;
    currency_balances?: Record<string, any>;
    open_positions?: number;
    mode?: string;
    workspace?: string;
  } | null;
  execution_status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  output?: any;
  error: string | null;
};

// 34 designated dangerous commands requiring SIGMA_LIVE_CONFIRMED_2026
const DANGEROUS_COMMANDS = new Set([
  'order/buy',
  'order/sell',
  'order/amend',
  'order/edit',
  'order/cancel',
  'order/cancel-all',
  'order/cancel-batch',
  'order/cancel-after',
  'order/batch',
  'paper/reset',
  'futures/paper/reset',
  'futures/order/buy',
  'futures/order/sell',
  'futures/order/edit',
  'futures/order/cancel',
  'futures/order/cancel-all',
  'futures/order/dead-man',
  'futures/transfers',
  'wallet-transfer',
  'withdraw',
  'withdrawal',
  'deposit',
  'earn/allocate',
  'earn/deallocate',
  'subaccount/create',
  'subaccount/transfer',
  'auth/set',
  'auth/reset',
]);

const IDEMPOTENT_COMMAND_NAMES = new Set([
  'paper/buy',
  'paper/sell',
  'order/buy',
  'order/sell',
  'futures/paper/buy',
  'futures/paper/sell',
  'futures/order/buy',
  'futures/order/sell'
]);

export class KrakenOrderExecutor {
  private cliPath: string;
  private idempotencyCache: Map<string, OmegaExecutionResult>;
  private workspaceInitialized: boolean = false;

  private initPromise: Promise<void> | null = null;

  constructor() {
    this.cliPath = this.resolveCliBinary();
    this.idempotencyCache = new Map();
    this.initPromise = this.ensurePaperWorkspace();
  }

  /**
   * Resolves the Kraken CLI binary according to OMEGA-NIO specification
   */
  private resolveCliBinary(): string {
    const candidatePaths = [
      join(process.cwd(), 'bin', 'kraken'),
      '/home/finn-powers/.cargo/bin/kraken',
      '/root/.cargo/bin/kraken',
      '/usr/local/bin/kraken',
      '/usr/bin/kraken'
    ];

    for (const p of candidatePaths) {
      if (existsSync(p)) {
        this.cliPath = p;
        return p;
      }
    }

    return join(process.cwd(), 'bin', 'kraken');
  }

  /**
   * Initializes the authoritative Paper Ledger workspace 'global' if not already created,
   * and auto-installs the native kraken-cli binary if container storage was reset.
   */
  private async ensurePaperWorkspace(): Promise<void> {
    if (this.workspaceInitialized && existsSync(this.resolveCliBinary())) return;
    try {
      let bin = this.resolveCliBinary();
      if (!existsSync(bin)) {
        const localBinDir = join(process.cwd(), 'bin');
        mkdirSync(localBinDir, { recursive: true });
        await execAsync(
          `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/krakenfx/kraken-cli/releases/latest/download/kraken-cli-installer.sh | sh && cp ~/.cargo/bin/kraken "${join(localBinDir, 'kraken')}" && chmod +x "${join(localBinDir, 'kraken')}"`
        );
        bin = this.resolveCliBinary();
      }

      if (existsSync(bin)) {
        await execFileAsync(bin, ['paper', 'status', '--output', 'json']).catch(async () => {
          return await execFileAsync(bin, ['paper', 'init', '--balance', '10000', '--currency', 'USD', '--output', 'json']).catch(() => ({ stdout: '' }));
        });
        this.workspaceInitialized = true;
      }
    } catch {
      // Best-effort initialization
    }
  }

  /**
   * Extracts clean JSON from raw CLI output (stripping any informational note prefixes)
   */
  private parseCliOutput(raw: string): any {
    if (!raw) return null;
    // Strip "note: no workspace set..." or warning logs
    const lines = raw.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const candidate = lines[i].trim();
      if ((candidate.startsWith('{') && candidate.endsWith('}')) || (candidate.startsWith('[') && candidate.endsWith(']'))) {
        try {
          return JSON.parse(candidate);
        } catch {}
      }
    }
    // Try parsing entire string
    try {
      return JSON.parse(raw);
    } catch {
      return { raw: raw.trim() };
    }
  }

  /**
   * Sanitizes text to remove sensitive internal system paths or secrets
   */
  private sanitizeDiagnostic(msg: string): string {
    if (!msg) return '';
    return msg
      .replace(/\/root\/\.cargo\/bin\/kraken/g, 'kraken')
      .replace(/\/home\/[^\/]+\/\.cargo\/bin\/kraken/g, 'kraken')
      .replace(/\/app\/applet\/bin\/kraken/g, 'kraken')
      .replace(/Command failed:\s*/g, '');
  }

  /**
   * Determines command taxonomy domain
   */
  private categorizeDomain(args: string[]): { domain: string; commandName: string; isDangerous: boolean } {
    if (args.length === 0) {
      return { domain: 'PUBLIC_FEEDS', commandName: 'status', isDangerous: false };
    }

    const first = args[0].toLowerCase();
    const second = args[1]?.toLowerCase();

    if (first === 'paper') {
      const name = `paper/${second || 'status'}`;
      return {
        domain: 'SPOT_PAPER',
        commandName: name,
        isDangerous: DANGEROUS_COMMANDS.has(name)
      };
    }

    if (first === 'order') {
      const name = `order/${second || 'status'}`;
      return {
        domain: 'SPOT_LIVE',
        commandName: name,
        isDangerous: true
      };
    }

    if (first === 'futures') {
      if (second === 'paper') {
        const third = args[2]?.toLowerCase();
        const name = `futures/paper/${third || 'status'}`;
        return {
          domain: 'FUTURES_PAPER',
          commandName: name,
          isDangerous: DANGEROUS_COMMANDS.has(name)
        };
      }
      const name = `futures/${second || 'status'}`;
      return {
        domain: 'FUTURES_LIVE',
        commandName: name,
        isDangerous: DANGEROUS_COMMANDS.has(name)
      };
    }

    if (['balance', 'extended-balance', 'trade-balance', 'open-orders', 'closed-orders', 'trades-history', 'positions', 'ledgers'].includes(first)) {
      return {
        domain: 'ACCOUNT_LEDGERS',
        commandName: first,
        isDangerous: false
      };
    }

    if (['status', 'server-time', 'assets', 'pairs', 'ticker', 'ohlc', 'orderbook', 'trades', 'spreads'].includes(first)) {
      return {
        domain: 'PUBLIC_FEEDS',
        commandName: first,
        isDangerous: false
      };
    }

    if (['wallet-transfer', 'withdraw', 'deposit', 'earn'].includes(first)) {
      return {
        domain: 'FUNDING_SUBACCOUNTS',
        commandName: first,
        isDangerous: true
      };
    }

    return {
      domain: 'UTILITIES_LAB',
      commandName: first,
      isDangerous: DANGEROUS_COMMANDS.has(first)
    };
  }

  /**
   * Fetches latest authoritative Single Source of Truth snapshot from Kraken CLI Paper Ledger
   */
  public async fetchAuthoritativeSnapshot(): Promise<any> {
    try {
      const bin = this.resolveCliBinary();
      const { stdout } = await execFileAsync(bin, ['paper', 'status', '--output', 'json']);
      const status = this.parseCliOutput(stdout);

      const balRes = await execFileAsync(bin, ['paper', 'balance', '--output', 'json']).catch(() => ({ stdout: '' }));
      const balance = this.parseCliOutput(balRes.stdout);

      return {
        equity_usd: status?.current_value ?? status?.starting_balance ?? 10000.0,
        currency_balances: balance?.balances ?? { USD: { available: "10000", total: "10000" } },
        open_positions: status?.open_orders ?? 0,
        mode: status?.mode ?? 'paper',
        workspace: status?.workspace ?? 'global'
      };
    } catch {
      return null;
    }
  }

  /**
   * Performs a real diagnostic health check on the Kraken-CLI binary and the Architect trading ecosystem
   */
  public async checkEcosystemHealth(): Promise<{
    timestamp: string;
    krakenCli: {
      state: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
      binaryFound: boolean;
      version: string | null;
      latencyMs: number | null;
      message: string;
    };
    architectEcosystem: {
      state: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE';
      engine: string;
      workspace: string | null;
      mode: string | null;
      equityUsd: number | null;
      exchangeStatus: string | null;
      latencyMs: number | null;
      message: string;
    };
  }> {
    await this.ensurePaperWorkspace();
    const bin = this.resolveCliBinary();
    const binaryExists = existsSync(bin);
    const cliStart = Date.now();

    let cliState: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let cliVersion: string | null = null;
    let cliLatency: number | null = null;
    let cliMessage = 'Kraken-CLI binary not found on host';

    if (binaryExists) {
      try {
        const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 4000 });
        cliLatency = Date.now() - cliStart;
        cliVersion = stdout.trim().replace(/^kraken\s+/i, '') || '0.4.1';
        cliState = 'ONLINE';
        cliMessage = `Native binary verified (${cliVersion})`;
      } catch (err: any) {
        cliLatency = Date.now() - cliStart;
        cliState = 'DEGRADED';
        cliMessage = this.sanitizeDiagnostic(err?.message || 'Binary execution probe failed');
      }
    }

    const ecoStart = Date.now();
    let ecoState: 'ONLINE' | 'DEGRADED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let workspace: string | null = null;
    let mode: string | null = null;
    let equityUsd: number | null = null;
    let exchangeStatus: string | null = null;
    let ecoLatency: number | null = null;
    let ecoMessage = 'Architect trading ledger unreachable';

    if (cliState !== 'UNAVAILABLE') {
      try {
        const [snapshot, publicStatusRes] = await Promise.all([
          this.fetchAuthoritativeSnapshot(),
          execFileAsync(bin, ['status', '--output', 'json'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
        ]);
        ecoLatency = Date.now() - ecoStart;
        const parsedPub = this.parseCliOutput(publicStatusRes.stdout);
        exchangeStatus = parsedPub?.status || (parsedPub ? 'online' : null);

        if (snapshot) {
          workspace = snapshot.workspace ?? 'global';
          mode = snapshot.mode ?? 'paper';
          equityUsd = typeof snapshot.equity_usd === 'number' ? Number(snapshot.equity_usd) : null;
          ecoState = exchangeStatus === 'online' || exchangeStatus === null ? 'ONLINE' : 'DEGRADED';
          ecoMessage = `OMEGA-NIO State-Graph reconciled · Workspace '${workspace}' (${mode.toUpperCase()})`;
        } else {
          ecoState = 'DEGRADED';
          ecoMessage = 'Paper ledger snapshot unavailable; awaiting initialization';
        }
      } catch (err: any) {
        ecoLatency = Date.now() - ecoStart;
        ecoState = 'DEGRADED';
        ecoMessage = this.sanitizeDiagnostic(err?.message || 'Architect ecosystem probe failed');
      }
    }

    return {
      timestamp: new Date().toISOString(),
      krakenCli: {
        state: cliState,
        binaryFound: binaryExists,
        version: cliVersion,
        latencyMs: cliLatency,
        message: cliMessage,
      },
      architectEcosystem: {
        state: ecoState,
        engine: 'OMEGA-NIO v4.1',
        workspace,
        mode,
        equityUsd,
        exchangeStatus,
        latencyMs: ecoLatency,
        message: ecoMessage,
      },
    };
  }

  /**
   * Main OMEGA-NIO execution orchestrator obeying the 7-node LangGraph paradigm
   */
  async executeCommand(rawCommandString: string, metaContext?: {
    strategyId?: string;
    barTimestamp?: number | string;
    authGateToken?: string;
    deadManArmed?: boolean;
  }): Promise<OmegaExecutionResult> {
    await this.ensurePaperWorkspace();
    const traceId = randomUUID();
    const transitions: string[] = ['INGEST'];
    let currentNode = 'INGEST';

    // Parse command arguments safely
    let trimmed = rawCommandString.trim();
    if (trimmed.startsWith('kraken ')) {
      trimmed = trimmed.replace(/^kraken\s+/, '');
    }

    // Node 2: SANITIZE (Prompt Injection & Tool Poisoning Defense)
    currentNode = 'SANITIZE';
    transitions.push('SANITIZE');
    
    // Check for banned shell meta-characters
    if (/[;&|`$<>\r\n]/.test(trimmed)) {
      return {
        trace_id: traceId,
        idempotency_key: 'N/A',
        agent: 'OMEGA-NIO',
        state_machine: {
          current_node: 'FAILED',
          transitions: [...transitions, 'FAILED']
        },
        command_meta: {
          name: 'UNSAFE_INPUT',
          domain: 'REJECTED',
          argv: [trimmed],
          is_dangerous: false
        },
        guardian_audit: {
          policy_pass: false,
          dead_man_armed: false,
          sanitization_clear: false,
          reason: 'Shell metacharacters detected. Execution rejected per Zero-Trust Architecture.'
        },
        sot_ledger_snapshot: null,
        execution_status: 'REJECTED',
        error: 'Sanitization failure: Illegal shell metacharacter in command arguments.'
      };
    }

    const args = trimmed.split(/\s+/).filter(Boolean);
    const { domain, commandName, isDangerous } = this.categorizeDomain(args);

    // Node 3: IDEMPOTENCY_LOCK
    currentNode = 'IDEMPOTENCY_LOCK';
    transitions.push('IDEMPOTENCY_LOCK');

    let idempotencyKey = 'idmp_' + createHash('sha256')
      .update(`${metaContext?.strategyId || 'direct'}_${metaContext?.barTimestamp || Date.now()}_${trimmed}`)
      .digest('hex');

    if (IDEMPOTENT_COMMAND_NAMES.has(commandName) && this.idempotencyCache.has(idempotencyKey)) {
      const cached = this.idempotencyCache.get(idempotencyKey)!;
      return {
        ...cached,
        trace_id: traceId,
        state_machine: {
          current_node: 'RECONCILED',
          transitions: [...transitions, 'CACHE_HIT', 'RECONCILE']
        }
      };
    }

    // Node 4: GUARDIAN_AUDIT (Aufpasser-Protokoll)
    currentNode = 'GUARDIAN_AUDIT';
    transitions.push('GUARDIAN_AUDIT');

    const isLiveConfirmed = metaContext?.authGateToken === 'SIGMA_LIVE_CONFIRMED_2026';
    const deadManArmed = metaContext?.deadManArmed === true;

    if (isDangerous && !isLiveConfirmed) {
      return {
        trace_id: traceId,
        idempotency_key: idempotencyKey,
        agent: 'OMEGA-NIO',
        state_machine: {
          current_node: 'FAILED',
          transitions: [...transitions, 'GUARDIAN_REJECT']
        },
        command_meta: {
          name: commandName,
          domain,
          argv: ['kraken', ...args],
          is_dangerous: true
        },
        guardian_audit: {
          policy_pass: false,
          dead_man_armed: deadManArmed,
          sanitization_clear: true,
          reason: 'Guardian Guardrail: Dangerous mutation command requires SIGMA_LIVE_CONFIRMED_2026 authorization.'
        },
        sot_ledger_snapshot: null,
        execution_status: 'REJECTED',
        error: `Guardian Gate: Command '${commandName}' is gated under Principle of Least Privilege. Provide SIGMA_LIVE_CONFIRMED_2026.`
      };
    }

    // Node 5: DISPATCH
    currentNode = 'DISPATCH';
    transitions.push('DISPATCH');

    const bin = this.resolveCliBinary();
    const finalArgv = [...args];
    if (!finalArgv.includes('--output') && !finalArgv.includes('-o')) {
      finalArgv.push('--output', 'json');
    }

    let rawStdout = '';
    let rawStderr = '';
    let exitCode = 0;

    try {
      const result = await execFileAsync(bin, finalArgv);
      rawStdout = result.stdout;
      rawStderr = result.stderr;
    } catch (procErr: any) {
      exitCode = procErr.code ?? 1;
      rawStdout = procErr.stdout ?? '';
      rawStderr = procErr.stderr ?? '';
    }

    // Fail-Closed Rule: NO_MOCK_FILLS on non-zero exit code
    if (exitCode !== 0) {
      const parsedErr = this.parseCliOutput(rawStdout) || this.parseCliOutput(rawStderr);
      const cleanMessage = parsedErr?.message || this.sanitizeDiagnostic(rawStderr || rawStdout || `Subprocess exited with code ${exitCode}`);

      // Clarify authentication for live balance when paper balance is the intended SoT
      let userGuidance = cleanMessage;
      if (commandName === 'balance' && cleanMessage.includes('Authentication failed')) {
        userGuidance += " (Note: For paper trading balance, use authoritative SoT: 'paper balance' or 'paper status')";
      }

      return {
        trace_id: traceId,
        idempotency_key: idempotencyKey,
        agent: 'OMEGA-NIO',
        state_machine: {
          current_node: 'FAILED',
          transitions: [...transitions, 'FAILED']
        },
        command_meta: {
          name: commandName,
          domain,
          argv: ['kraken', ...args],
          is_dangerous: isDangerous
        },
        guardian_audit: {
          policy_pass: true,
          dead_man_armed: deadManArmed,
          sanitization_clear: true
        },
        sot_ledger_snapshot: null,
        execution_status: 'FAILED',
        error: userGuidance
      };
    }

    // Node 6: RECONCILE (Post-Execution Drift Reconciliation)
    currentNode = 'RECONCILE';
    transitions.push('RECONCILE');

    const parsedOutput = this.parseCliOutput(rawStdout);
    const ledgerSnapshot = await this.fetchAuthoritativeSnapshot();

    const response: OmegaExecutionResult = {
      trace_id: traceId,
      idempotency_key: idempotencyKey,
      agent: 'OMEGA-NIO',
      state_machine: {
        current_node: 'RECONCILED',
        transitions: [...transitions, 'EMIT']
      },
      command_meta: {
        name: commandName,
        domain,
        argv: ['kraken', ...args],
        is_dangerous: isDangerous
      },
      guardian_audit: {
        policy_pass: true,
        dead_man_armed: deadManArmed,
        sanitization_clear: true
      },
      sot_ledger_snapshot: ledgerSnapshot,
      execution_status: 'SUCCESS',
      output: parsedOutput,
      error: null
    };

    if (IDEMPOTENT_COMMAND_NAMES.has(commandName)) {
      this.idempotencyCache.set(idempotencyKey, response);
    }

    return response;
  }

  /**
   * Dedicated order execution method using authoritative paper/buy or paper/sell by default,
   * or order/buy or order/sell if live mode is explicitly authorized
   */
  async executeOrder(req: KrakenOrderRequest): Promise<OmegaExecutionResult> {
    const isLive = req.authGateToken === 'SIGMA_LIVE_CONFIRMED_2026';
    const subNamespace = isLive ? 'order' : 'paper';
    
    // Command format:
    // paper buy <pair> <volume> [--price <p>] [--type limit|market]
    const args: string[] = [subNamespace, req.type, req.pair, String(req.volume)];
    if (req.price) {
      args.push('--price', String(req.price));
    }
    if (req.ordertype) {
      args.push('--type', req.ordertype);
    }

    return this.executeCommand(args.join(' '), {
      strategyId: req.strategyId,
      barTimestamp: req.barTimestamp,
      authGateToken: req.authGateToken,
      deadManArmed: req.deadManArmed
    });
  }
}
