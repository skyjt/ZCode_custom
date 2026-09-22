import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@aibuddy/provider";
import { NodeAIbuddyBuiltinProviderConfigSource } from "./aibuddy-builtin-provider-config-source.js";
import {
  EndpointScopedAIbuddyBuiltinSource,
  type EndpointScopedAIbuddyBuiltinSourceOptions,
} from "./endpoint-scoped-aibuddy-builtin-source.js";
import {
  AIbuddyBuiltinRemoteSynchronizer,
  type AIbuddyBuiltinRemoteSynchronizerOptions,
  type AIbuddyBuiltinRefreshResult,
} from "./aibuddy-builtin-remote-synchronizer.js";
import {
  NodePersonalProviderConfigRepository,
  type PersonalProviderConfigRecoveryEvent,
} from "./personal-provider-config-repository.js";

export interface NodeProviderConfigRuntimeOptions {
  readonly aibuddyBuiltinFilePath: string;
  readonly aibuddyBuiltinActiveFilePath?: string;
  readonly aibuddyBuiltinRemote?: Omit<AIbuddyBuiltinRemoteSynchronizerOptions, "source">;
  readonly aibuddyBuiltinEnvironment?: Omit<
    EndpointScopedAIbuddyBuiltinSourceOptions,
    "bundledFilePath"
  >;
  readonly onAIbuddyBuiltinRefreshError?: (error: unknown) => void;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: (
    aibuddyBuiltin: ProviderConfigLayerSnapshot,
  ) => Promise<ProviderConfigLayerUpdate | null>;
  readonly watch?: boolean;
}

/** 组装一个 Node.js 进程内共享的 AIbuddy Built-in/Personal Config 运行边界。 */
export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;
  readonly #aibuddyBuiltinSource:
    | NodeAIbuddyBuiltinProviderConfigSource
    | EndpointScopedAIbuddyBuiltinSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  readonly #remoteSynchronizer?: AIbuddyBuiltinRemoteSynchronizer;
  readonly #onRemoteRefreshError?: (error: unknown) => void;
  #startPromise: Promise<void> | null = null;
  #disposed = false;
  readonly #checkListeners = new Set<() => Promise<void>>();
  #checkTimer: ReturnType<typeof setInterval> | null = null;
  #checkInFlight: Promise<void> | null = null;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#aibuddyBuiltinSource = options.aibuddyBuiltinEnvironment
      ? new EndpointScopedAIbuddyBuiltinSource({
          bundledFilePath: options.aibuddyBuiltinFilePath,
          ...options.aibuddyBuiltinEnvironment,
        })
      : new NodeAIbuddyBuiltinProviderConfigSource({
          bundledFilePath: options.aibuddyBuiltinFilePath,
          activeFilePath: options.aibuddyBuiltinActiveFilePath,
          watch: options.watch,
        });
    this.#remoteSynchronizer =
      options.aibuddyBuiltinRemote &&
      this.#aibuddyBuiltinSource instanceof NodeAIbuddyBuiltinProviderConfigSource
        ? new AIbuddyBuiltinRemoteSynchronizer({
            source: this.#aibuddyBuiltinSource,
            ...options.aibuddyBuiltinRemote,
          })
        : undefined;
    this.#onRemoteRefreshError = options.onAIbuddyBuiltinRefreshError;
    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () => options.importLegacy!(await this.#aibuddyBuiltinSource.read()),
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      aibuddyBuiltinSource: this.#aibuddyBuiltinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveAIbuddyBuiltinActiveFilePath(): Promise<string> {
    return this.#aibuddyBuiltinSource instanceof NodeAIbuddyBuiltinProviderConfigSource
      ? Promise.resolve(this.#aibuddyBuiltinSource.activeFilePath)
      : this.#aibuddyBuiltinSource.resolveActiveFilePath();
  }

  get personalRepository(): import("@aibuddy/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  /** Environment 同一周期检查中恢复未对齐依赖，不被下载 TTL 或失败挡住。 */
  onDidCheckAIbuddyBuiltin(listener: () => Promise<void>): () => void {
    this.#checkListeners.add(listener);
    return () => this.#checkListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("NodeProviderConfigRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const startPromise = this.configService.read().then(() => {
      if (this.#disposed) return;
      void this.#checkBackground();
      // Managed Worker 无下载配置也无恢复 owner，不建立周期任务。
      if (
        this.#remoteSynchronizer ||
        this.#aibuddyBuiltinSource instanceof EndpointScopedAIbuddyBuiltinSource ||
        this.#checkListeners.size > 0
      ) {
        this.#checkTimer = setInterval(() => {
          void this.#checkBackground();
        }, 60_000);
        this.#checkTimer.unref?.();
      }
    });
    this.#startPromise = startPromise;
    void startPromise.catch(() => {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    });
    return startPromise;
  }

  refreshAIbuddyBuiltin(options?: { readonly force?: boolean }): Promise<AIbuddyBuiltinRefreshResult> {
    if (this.#disposed) return Promise.resolve("disposed");
    if (this.#aibuddyBuiltinSource instanceof EndpointScopedAIbuddyBuiltinSource) {
      return this.#aibuddyBuiltinSource.refresh(options);
    }
    return this.#remoteSynchronizer?.refresh(options) ?? Promise.resolve("skipped");
  }

  #checkBackground(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#checkInFlight) return this.#checkInFlight;
    const check = Promise.allSettled([
      this.refreshAIbuddyBuiltin(),
      ...[...this.#checkListeners].map((listener) => Promise.resolve().then(listener)),
    ])
      .then((results) => {
        if (this.#disposed) return;
        for (const result of results)
          if (result.status === "rejected") this.#onRemoteRefreshError?.(result.reason);
      })
      .finally(() => {
        if (this.#checkInFlight === check) this.#checkInFlight = null;
      });
    this.#checkInFlight = check;
    return check;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#checkTimer) clearInterval(this.#checkTimer);
    this.#checkTimer = null;
    this.#checkListeners.clear();
    this.#remoteSynchronizer?.dispose();
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#aibuddyBuiltinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
