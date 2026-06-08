# Remote access and HTTPS

How to reach Odysseus from beyond localhost — phone on your LAN, Tailscale, or behind a reverse proxy — without compromising the security posture it ships with.

## The principle

Odysseus serves plain HTTP on its app port and binds everything to `127.0.0.1` by default. It is an admin console with shell access, email, and API tokens — never expose it directly to the public internet. The blessed patterns, in order of preference:

1. **Private network layer** — Tailscale, WireGuard, or another VPN. Simplest and safest.
2. **Authenticated reverse proxy / access gateway** — Caddy, nginx, Traefik, Cloudflare Access. HTTPS terminates at the proxy; Odysseus stays on loopback.

None of these tools are required by Odysseus; any of them fits.

## Reverse proxy / private gateway pattern

1. Keep Odysseus on localhost, e.g. `127.0.0.1:7000`.
2. Terminate HTTPS at the trusted proxy or gateway.
3. Put the authenticated Odysseus web/API entrypoint behind that layer (proxy to `http://127.0.0.1:7000`).
4. Keep raw service and model ports internal-only.

With HTTPS in front, set in `.env`:

```bash
AUTH_ENABLED=true        # default — keep it
LOCALHOST_BYPASS=false   # default — keep it
SECURE_COOKIES=true      # cookies only over HTTPS
```

> **Warning:** `SECURE_COOKIES=true` without HTTPS in front causes immediate login loops — cookies marked Secure aren't sent over plain HTTP.

## Direct LAN / Tailscale with HTTPS (mkcert)

To expose Odysseus on a local network or tailnet with locally-trusted HTTPS:

1. Change the bind address in `.env` (`APP_BIND=0.0.0.0`, or `ODYSSEUS_HOST=0.0.0.0` for the macOS launcher).
2. Generate a locally-trusted cert for your LAN/Tailscale IPs with [mkcert](https://github.com/FiloSottile/mkcert):

   ```bash
   mkcert -install
   mkcert -cert-file cert.pem -key-file key.pem 192.168.1.100 tailscale-ip
   ```

3. Run uvicorn with the certs:

   ```bash
   python -m uvicorn app:app --host 0.0.0.0 --port 7000 --ssl-certfile=cert.pem --ssl-keyfile=key.pem
   ```

4. Install the mkcert CA on every device that will connect (for iOS: email yourself `rootCA.pem`, install the profile, then trust it under Certificate Trust Settings).

On macOS, `start-macos.sh` reads `.env`, so `APP_BIND=0.0.0.0` and `APP_PORT` are picked up automatically:

```bash
ODYSSEUS_HOST=0.0.0.0 ./start-macos.sh
# then open http://<tailscale-ip>:7860
```

Keep `AUTH_ENABLED=true` (the default) before binding outside loopback.

## Keep the internals internal

Expose only the authenticated Odysseus entrypoint. ChromaDB, SearXNG, ntfy, Ollama, vLLM, llama.cpp, databases, and raw model/provider APIs stay loopback-only. Common internal ports from the default setup:

| Port | Service |
|---|---|
| `7000` | Odysseus raw app port (`7860` on the macOS launcher) |
| `8080` | SearXNG |
| `8091` | ntfy |
| `8100` | ChromaDB host port |
| `11434` | Ollama |
| `8000–8020` | Common local model/provider APIs |

Exception by design: ntfy can be exposed on a tailnet IP for phone notifications (`NTFY_BIND` + `NTFY_BASE_URL` — see [env-vars](../reference/env-vars.md)).

## Run as a service (Linux systemd)

Edit `odysseus-ui.service` (set `User`, `WorkingDirectory`, and the `ExecStart` path to your venv), then:

```bash
sudo cp odysseus-ui.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable odysseus-ui
sudo systemctl start odysseus-ui
```

Or run `./install-service.sh`, which does the same. The unit loads `.env` if present and restarts on failure.

## Phones: the easy path

Before reaching for proxies, note the two built-in mobile options: the web UI is an installable PWA (open it in the phone browser over your tailnet, "Add to Home Screen"), and [companion pairing](../concepts/integrations.md) connects token-based clients with a QR scan.

## Checklist before exposing anything

- `AUTH_ENABLED=true`, `LOCALHOST_BYPASS=false`, `SECURE_COOKIES=true` (HTTPS only)
- Open signup disabled; only your account is admin; per-user privileges reviewed
- Internal service ports not exposed
- `.env`, `data/`, `logs/`, backups out of Git and shared storage

Full policy: [SECURITY.md](../../SECURITY.md) and [THREAT_MODEL.md](../../THREAT_MODEL.md).
