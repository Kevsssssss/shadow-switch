# ShadowSwitch — Project Context for Gemini CLI

> **Version:** 1.0 | **Author:** Kevin Buangjog | **Date:** May 28, 2026
> **Status:** Approved Blueprint | **Target OS:** Windows (x64) | **Deployment:** Vercel + Firebase

---

## Project Overview

ShadowSwitch is a lightweight, high-performance hybrid remote-management utility that provides explicit execution controls over target Windows machines. It operates across two network modes:

- **Cloud Mode** — wide-area network control via Firebase Realtime Database
- **LAN Mode** — direct local network control with zero infrastructure overhead

---

## Architecture

The system uses a split-broker model. The native client initiates persistent outbound listeners, avoiding NAT/firewall traversal issues.

```
[ Cloud Web Dashboard ]  ---> (Write Event) ---> [ Firebase Realtime DB ]
     (Vercel Hosting)                                       |
                                                    (Secure Stream)
                                                            v
[ Local Phone/Laptop ]   ---> (Direct HTTP) --->  [ Go Client (receiver.exe) ]
    (Same LAN Wi-Fi)                                   Port 8080
```

The Go executable uses non-blocking goroutines to parallel-process:
1. Firebase Realtime Database stream mutations (Cloud)
2. Inbound TCP socket connections on port 8080 (LAN)

---

## Stack

| Layer | Technology |
|---|---|
| Client Agent | Go (compiled to `receiver.exe`, single binary, no dependencies) |
| Cloud Database | Firebase Realtime Database (Spark free tier) |
| Web Dashboard | Static site hosted on Vercel |
| LAN Dashboard | Embedded HTML served directly by `receiver.exe` |

---

## Functional Requirements

### Go Receiver Runtime (`receiver.exe`)

- **Dual-Engine Listener:** Simultaneously handles Firebase stream connection and an embedded `net/http` server.
- **Silent OS Execution:** All commands invoke Windows subshell handles without any visible console window flash.
- **Supported Commands:**
  - Shutdown: `shutdown /s /t 0 /f`
  - Restart: `shutdown /r /t 0 /f`
  - Log Out: `shutdown /l`
  - Lock: `rundll32.exe user32.dll LockWorkStation`
- **Atomic State Reset:** After reading a command from Firebase, immediately write `null` back to that node to prevent re-execution on reboot.

### Cloud Controller Dashboard

- **Heartbeat Telemetry:** Online/offline status indicator via a 30-second heartbeat sync.
- **Confirmation Modal:** Shutdown and Restart actions require a confirmation dialog before execution (prevents accidental triggers).
- **Responsive UI:** Optimized for both desktop and mobile viewports.

### Embedded LAN Interface

- **Zero-Asset Server:** The entire LAN dashboard is compiled as a minified string literal inside the Go binary — no external files needed.
- **Direct API:** Local commands POST to `/api/action` on `localhost:8080`, bypassing all external gateways.

---

## UI Design Tokens

| Element | Hex | Role |
|---|---|---|
| Primary Background | `#111112` | Ultra-dark canvas, minimizes eye fatigue |
| Card Surfaces | `#1a1a1c` | Elevates action controls from background |
| Accent / Action Red | `#dd2c00` | Critical states, primary action markers |
| Primary Text | `#ffffff` | High-contrast headers and telemetry readouts |

Visual reference: MEGA.nz-inspired dark utility aesthetic — high contrast, low fatigue.

---

## Security

### Cloud
- Firebase Security Rules enforce token-based authorization on all database writes.

### LAN
- Embedded HTTP server requires an `X-ShadowSwitch-Token` header matching a user-defined secret on every request.

---

## Edge Case Handling

| Scenario | Behavior |
|---|---|
| Target loses internet | Exponential backoff retry loop (5s → 10s → 30s max) — no panics, no service halt |
| Command sent while machine is off | Firebase preserves the command node; executed and cleared on next boot |
| Router reassigns local IP | `receiver.exe` prints the current local subnet address to its terminal log on startup |
| Accidental double-trigger | UI button locks to disabled state on first click — duplicate API calls are impossible |

---

## Key Implementation Notes

- The Go binary must compile to a **single self-contained executable** with no external runtime dependencies.
- All Windows API calls must suppress console window creation (use `CREATE_NO_WINDOW` or equivalent syscall flags).
- The atomic Firebase null-write after command consumption is **critical** — omitting it causes commands to re-fire on every reboot.
- LAN mode must remain functional with **zero internet connectivity** — test this path explicitly.
- The UI double-submit lock must be enforced at the component level, not just the API level.
