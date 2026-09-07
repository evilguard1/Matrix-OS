# Local Matrix bridge recovery kit

Companion source for the running local bridge (gateway 1.1.0). Not part of the Netscript installation manifest. Never copy the private .matrix-cloud.env into Git.

Apply gateway.mjs and job-protocol.mjs at the external-editor project root, tools/loopback.mjs in its tools directory, and the agent at servers/home/cloud/agent.js. Preserve the existing token, config and dependencies. Import './tools/loopback.mjs' BEFORE dynamically importing esbuild-bitburner-plugin; import setRemoteApi/startGateway from gateway.mjs, await startGateway(), and call setRemoteApi(remoteApi) in afterConnect. The guarded loopback patch supports the installed esbuild-bitburner-plugin 1.6.3 shape and refuses unfamiliar source.

Restart the existing Node config process; do not create a second listener. In Bitburner connect localhost:12525 with a five-second reconnect delay. Publish the agent through the native Remote API, verify RAM, then run /cloud/agent.js once. The kernel starts the existing agent from 32 GB while reserving RAM for early progression. A 16-to-32 GB upgrade returns through the kernel to activate it. Below 32 GB it is deferred. The full supervisor maintains it afterwards. An absent agent file is not downloaded automatically.

HTTP gateway: 127.0.0.1:31337. Both listeners bind IPv4 loopback. Native port 12525 is WebSocket, not an HTTP REST API. Authenticated requests accept Bearer or X-Matrix-Token. OpenAPI at /openapi.json documents status, files, servers, RAM, agent heartbeat, briefing and job receipts.

Commands expire after 60 seconds and bind to the current reset. Use one stable idempotencyKey per logical command. The agent retains up to 4096 receipts per reset and refuses further jobs at capacity. A receipt marked started only confirms a PID; inspect the task's output/postcondition. An interrupted pending command is marked unknown-after-interruption and is not retried automatically. Legacy queues are ignored. Conflicting key payloads are rejected while retained in the transport queue; clients must never reuse a key for different work even after queue expiration. Same-key commands remain non-reexecuting through the agent journal.

The briefing route rejects expired evidence. This kit does not create a public tunnel, configure a GPT Action or provide the RP campaign engine.

Run the standalone mocked regression suite from the repository root:

    node tools/bridge-recovery/tests/recovery.mjs

It uses a temporary in-memory test token, never the production token, and binds its HTTP test to an ephemeral local port.
