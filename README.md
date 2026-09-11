# CodeSphere — High Performance Multi-Language Code Execution Platform

CodeSphere is a scalable, sandboxed code execution and REPL engine. It allows untrusted user-submitted code in Python and JavaScript to execute safely and efficiently using a dual execution architecture (REPL vs. Batch).

---

## 🚀 Key Architecture & Dual Execution Mode

```
                          ┌──────────────────────────┐
                          │   React + Monaco Client  │
                          └─────────────┬────────────┘
                                        │
                                   HTTP / WS
                                        │
                          ┌─────────────▼────────────┐
                          │   Express API Gateway    │
                          └──────┬────────────┬──────┘
                                 │            │
              [REPL: Synchronous]│            │[Batch: Asynchronous]
                                 │            │
                    ┌────────────▼──┐      ┌──▼───────────┐
                    │ Warm Pool Mgr │      │  Redis Queue │
                    └──────┬────────┘      └──┬───────────┘
                           │                  │
               ┌───────────▼──────┐    ┌──────▼───────────┐
               │ Sandboxed Docker │    │   Worker Pool    │
               │ Ephemeral Exec   │    └──────┬───────────┘
               └──────────────────┘           │
                                       ┌──────▼───────────┐
                                       │ Sandboxed Docker │
                                       └──────────────────┘
```

### 1. REPL Mode (Synchronous, Low-Latency)
- **Target:** Interactive code snippets expecting <1s execution turnaround.
- **Warm Pool Strategy:** A `WarmPool` manager maintains a pool of pre-warmed, idle Docker containers (`sleep infinity`). Acquiring a container takes `<10ms` instead of standard Docker startup latency (`500ms–2s`).
- **Post-Execution Disposal:** After execution, the container is destroyed (never reused to guarantee security isolation). A new container is created asynchronously to replenish the pool.

### 2. Batch Mode (Asynchronous, Queued)
- **Target:** Longer-running scripts or batch jobs.
- **Queueing:** Submissions are pushed to a Redis FIFO queue via `LPUSH`. The API responds immediately with `202 Accepted` and a `jobId`.
- **At-Least-Once Delivery:** Workers retrieve jobs using `BRPOPLPUSH` into a processing list while setting a visibility timeout lock in Redis. If a worker process crashes mid-execution, the lock expires, and a background recovery sweep re-queues the orphaned job.
- **Idempotent Completion:** Before writing results to PostgreSQL, workers check `jobHasResult(jobId)` to prevent duplicate execution side-effects.
- **Live Push Updates:** Upon job completion, workers publish events via Redis Pub/Sub, which are broadcast to connected clients via WebSockets.

---

## 🔒 Sandboxing & Security Layer

Every execution runs inside an isolated Docker container with the following cgroup & security flags:

- **No Network Access (`--network none`)**: Prevents outbound requests, data exfiltration, or port scanning.
- **Memory Limit (`--memory 128m`)**: Prevents memory exhaustion attacks. OOM kills are captured and surfaced as "Memory limit exceeded".
- **CPU Quota (`--cpus 0.5`)**: Prevents CPU starvation and crypto-mining abuse.
- **PID Limit (`--pids-limit 50`)**: Prevents fork bombs (`:(){ :|:& };:`).
- **Capability Dropping (`--cap-drop ALL`)**: Drops all Linux kernel capabilities.
- **No Privilege Escalation (`--security-opt no-new-privileges`)**: Prevents setuid binary abuse.
- **Non-Root Execution (`User sandbox`)**: Containers run under an unprivileged `sandbox` user (UID 999).
- **Read-Only Root Filesystem**: Root FS is read-only; only `/tmp/code` (tmpfs) is mounted for write.

> **Honest Security Disclaimer / Known Limitation:**
> Docker containers share the host Linux kernel via namespaces and cgroups. While hardened with capability dropping and resource limits, this is **not** hardware-level virtualization. Container escapes via zero-day kernel vulnerabilities remain possible. In production systems like Judge0 or AWS Lambda, microVM technologies (e.g., Firecracker or gVisor) are used to provide virtualized boundary isolation.

---

## 📦 Extensibility (Language Strategy Pattern)

Adding support for a new language (e.g., Go, C++) requires only two steps:
1. Adding a Dockerfile in `sandbox-images/<lang>`
2. Adding a `LanguageConfig` entry in `backend/src/execution/language-runner.ts`

No modification of execution pipeline logic is required.

---

## 🛠️ Local Setup & Running via Docker Compose

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (optional, for running without Docker)

### Step 1: Clone & Configure
```bash
cp .env.example .env
```

### Step 2: Build Sandbox Base Images
```bash
docker build -t codesphere-sandbox-python ./sandbox-images/python
docker build -t codesphere-sandbox-javascript ./sandbox-images/javascript
```

### Step 3: Start Stack
```bash
docker-compose up --build
```

Access the UI at: `http://localhost:3000`  
Access the Backend API at: `http://localhost:3001`

---

## 📋 Interview Defense Checklist

1. **Why single execution endpoint with mode flag vs two endpoints?**
   - Single clean REST interface (`/api/execute` with `{ mode: "repl" | "batch" }`). The payload payload contract is identical, maintaining a cohesive domain model.
2. **Why destroy containers after REPL execution instead of reusing?**
   - Security. A previous snippet could write malicious hidden state or pollute memory. Ephemeral containers ensure strict isolation guarantees.
3. **How does BRPOPLPUSH prevent job loss?**
   - Standard `BRPOP` removes the job immediately. If worker dies, job is lost. `BRPOPLPUSH` atomically pushes job to a `processing` queue, keeping state in Redis until explicit worker ACK.
