// ============================================================================
// WarmPool — Pre-warmed container pool for low-latency REPL execution
// ============================================================================
// Design decision: Why warm pools?
//   Docker container creation takes 500ms–2s. For REPL (interactive) use,
//   this latency destroys the experience. By pre-creating containers at
//   startup and keeping them warm (idle, running `sleep infinity`), we can
//   acquire a ready container in <10ms.
//
// Strategy:
//   - At startup, create `poolSize` containers per language
//   - When a REPL request comes in, pop a container from the pool
//   - After use, destroy the used container (never reuse — security)
//   - Asynchronously create a new container to refill the pool
//   - If pool is empty, fall back to cold-start (create on demand)
//
// Trade-offs:
//   - Memory cost: ~10–30MB per idle container × poolSize × numLanguages
//   - With poolSize=2, 2 languages: ~40–120MB idle overhead
//   - Acceptable for local/small deployments; configurable for production
// ============================================================================

import Docker from 'dockerode';
import { Language } from '../types';
import { createSandboxContainer, destroyContainer } from './container.manager';
import { getSupportedLanguages } from './language-runner';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('warm-pool');

interface WarmContainer {
  container: Docker.Container;
  language: Language;
  createdAt: Date;
}

class WarmPool {
  private pools: Map<Language, WarmContainer[]> = new Map();
  private poolSize: number;
  private isInitialized = false;
  private replenishing: Set<string> = new Set(); // Track in-flight replenishments

  constructor(poolSize: number = config.warmPool.size) {
    this.poolSize = poolSize;
    for (const lang of getSupportedLanguages()) {
      this.pools.set(lang, []);
    }
  }

  /**
   * Initialize the warm pool by pre-creating containers for all languages.
   * Call this once at server startup.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.info({ poolSize: this.poolSize }, 'Initializing warm container pool');
    const languages = getSupportedLanguages();

    const tasks: Promise<void>[] = [];
    for (const lang of languages) {
      for (let i = 0; i < this.poolSize; i++) {
        tasks.push(this.addContainer(lang));
      }
    }

    // Create all containers in parallel for fast startup
    const results = await Promise.allSettled(tasks);
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      log.warn({ failedCount: failed.length }, 'Some warm containers failed to create');
    }

    this.isInitialized = true;
    this.logPoolStatus();
  }

  /**
   * Acquire a warm container for the given language.
   * Returns a ready-to-use container, or creates one on-demand if pool is empty.
   */
  async acquire(language: Language): Promise<Docker.Container> {
    const pool = this.pools.get(language);

    if (pool && pool.length > 0) {
      const warm = pool.shift()!;
      log.info({ language, remainingInPool: pool.length }, 'Acquired warm container');

      // Asynchronously replenish the pool (fire and forget)
      this.replenish(language);

      return warm.container;
    }

    // Pool empty — cold start fallback
    log.warn({ language }, 'Warm pool empty, cold-starting container');
    const container = await createSandboxContainer(language);
    await container.start();
    return container;
  }

  /**
   * Destroy a container after use. Never reuse containers — fresh isolation per execution.
   */
  async release(container: Docker.Container): Promise<void> {
    await destroyContainer(container);
  }

  /**
   * Replenish the pool for a given language (called after acquiring a container).
   * This runs asynchronously and does not block the caller.
   */
  private async replenish(language: Language): Promise<void> {
    const key = `replenish-${language}`;
    if (this.replenishing.has(key)) return; // Already replenishing
    this.replenishing.add(key);

    try {
      const pool = this.pools.get(language)!;
      const needed = this.poolSize - pool.length;

      if (needed <= 0) return;

      log.debug({ language, needed }, 'Replenishing warm pool');

      for (let i = 0; i < needed; i++) {
        try {
          await this.addContainer(language);
        } catch (err: any) {
          log.error({ language, err: err.message }, 'Failed to replenish warm container');
        }
      }

      this.logPoolStatus();
    } finally {
      this.replenishing.delete(key);
    }
  }

  /**
   * Create and start a single warm container, adding it to the pool.
   */
  private async addContainer(language: Language): Promise<void> {
    const container = await createSandboxContainer(language);
    await container.start();

    const pool = this.pools.get(language)!;
    pool.push({
      container,
      language,
      createdAt: new Date(),
    });

    log.debug({ language, containerId: container.id }, 'Warm container added to pool');
  }

  /**
   * Get current pool sizes for monitoring/observability.
   */
  getStatus(): Record<Language, number> {
    const status: Record<string, number> = {};
    for (const [lang, pool] of this.pools.entries()) {
      status[lang] = pool.length;
    }
    return status as Record<Language, number>;
  }

  /**
   * Drain all containers — call on shutdown.
   */
  async drain(): Promise<void> {
    log.info('Draining warm pool');
    const tasks: Promise<void>[] = [];

    for (const [lang, pool] of this.pools.entries()) {
      for (const warm of pool) {
        tasks.push(destroyContainer(warm.container));
      }
      pool.length = 0;
    }

    await Promise.allSettled(tasks);
    log.info('Warm pool drained');
  }

  private logPoolStatus(): void {
    const status = this.getStatus();
    log.info({ pools: status }, 'Warm pool status');
  }
}

// Singleton instance
export const warmPool = new WarmPool();
