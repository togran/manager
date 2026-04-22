"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, FieldGrid } from "./Field";
import { StateBadge } from "./StateBadge";
import { MetricsCharts } from "./MetricsCharts";
import type { Ec2Instance } from "@/types/ec2";

type InstanceStatusEvent = {
  Code: string;
  Description: string;
  NotBefore: string;
};

type InstanceStatusData = {
  status: {
    AvailabilityZone: string;
    InstanceState?: string;
    SystemStatus?: string;
    InstanceStatus?: string;
    Events: InstanceStatusEvent[];
  };
  error: string | null;
};

type SgQueryData = {
  groups: Array<{
    GroupId: string;
    Rules: SgRuleRow[];
  }>;
  error: string | null;
};

type VolumesQueryData = {
  volumes: Array<{
    VolumeId: string;
    Size?: number;
    VolumeType?: string;
    Iops?: number;
    Throughput?: number;
    Encrypted?: boolean;
    State?: string;
  }>;
  error: string | null;
};

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function InstanceDetail({
  instance,
  region,
  role = "user",
}: {
  instance: Ec2Instance;
  region: string | null;
  role?: "admin" | "user";
}) {
  const [actionLoading, setActionLoading] = useState<"start" | "stop" | "reboot" | "terminate" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function runInstanceAction(action: "start" | "stop" | "reboot" | "terminate") {
    if (action === "terminate") {
      const ok = window.confirm(
        `Terminate instance ${instance.InstanceId}? This may permanently delete the instance.`,
      );
      if (!ok) return;
    }
    setActionLoading(action);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/ec2/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          instanceId: instance.InstanceId,
          region,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run action");
      setActionSuccess(`Instance ${action} request submitted.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to run action");
    } finally {
      setActionLoading(null);
    }
  }

  const statusQuery = useQuery<InstanceStatusData>({
    queryKey: ["ec2-status", instance.InstanceId, region],
    queryFn: () => fetch(`/api/ec2/status?instanceId=${instance.InstanceId}&region=${region}`).then(res => res.json()),
  });

  // const describeVolumesFn = useServerFn(describeVolumes);
  const volumeIds = instance.BlockDeviceMappings.map((b) => b.VolumeId).filter(
    (v): v is string => !!v,
  );
  const volumesQuery = useQuery<VolumesQueryData>({
    queryKey: ["ec2-volumes", instance.InstanceId, region, volumeIds.join(",")],
    queryFn: () => Promise.resolve({ volumes: [], error: null }), // TODO: implement API
    enabled: false, // volumeIds.length > 0,
  });

  // const describeSgFn = useServerFn(describeSecurityGroups);
  const sgIds = instance.SecurityGroups.map((g) => g.GroupId);
  const sgQuery = useQuery<SgQueryData>({
    queryKey: ["ec2-sgs", instance.InstanceId, region, sgIds.join(",")],
    queryFn: () => Promise.resolve({ groups: [], error: null }), // TODO: implement API
    enabled: false, // sgIds.length > 0,
  });

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      {/* Enhanced Header */}
      <div className="border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-white px-6 py-5 shadow-sm dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Instance Icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-aws-orange/10 to-orange-100 dark:from-aws-orange/20 dark:to-orange-900/20">
              <svg className="h-6 w-6 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>

            {/* Instance Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {instance.Name || "Unnamed Instance"}
                </h1>
                <StateBadge state={instance.State} />
              </div>

              <div className="mt-2 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {instance.InstanceId}
                  </code>
                </div>

                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {instance.InstanceType}
                </div>

                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {instance.AvailabilityZone}
                </div>
              </div>

              {instance.StateReason && (
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  State: {instance.StateReason}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col items-end gap-2">
            {role === "admin" && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runInstanceAction("start")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "start" ? "Starting..." : "Start"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runInstanceAction("stop")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "stop" ? "Stopping..." : "Stop"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runInstanceAction("reboot")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "reboot" ? "Rebooting..." : "Reboot"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => runInstanceAction("terminate")}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "terminate" ? "Terminating..." : "Terminate"}
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" className="gap-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Connect
            </Button>
            {actionError && (
              <p className="text-xs text-destructive">{actionError}</p>
            )}
            {actionSuccess && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{actionSuccess}</p>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="details" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-panel px-4">
          <TabsList className="h-auto rounded-none bg-transparent p-0">
            {[
              ["details", "Details"],
              ["status", "Status and alarms"],
              ["monitoring", "Monitoring"],
              ["security", "Security"],
              ["networking", "Networking"],
              ["storage", "Storage"],
              ["tags", "Tags"],
            ].map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-none border-b-2 border-transparent bg-transparent px-4 py-3 text-sm font-medium text-muted-foreground data-[state=active]:border-aws-orange data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto bg-background p-6">
          <TabsContent value="details" className="mt-0">
            <Section title="Instance Details">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {/* Instance Name */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Instance Name</span>
                  <span className="text-base font-semibold text-foreground">{instance.Name || (instance.Tags?.find(t => t.Key === "Name")?.Value ?? "-")}</span>
                </div>
                {/* Instance ID */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Instance ID</span>
                  <span className="font-mono text-base text-foreground">{instance.InstanceId}</span>
                </div>
                {/* Instance Type */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Instance Type</span>
                  <span className="text-base text-foreground">{instance.InstanceType}</span>
                </div>
                {/* Public IP */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Public IP</span>
                  <span className="text-base text-foreground">{instance.PublicIpAddress || "-"}</span>
                </div>
                {/* Private IP */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Private IP</span>
                  <span className="text-base text-foreground">{instance.PrivateIpAddress || "-"}</span>
                </div>
                {/* Region */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Region</span>
                  <span className="text-base text-foreground">{region || "-"}</span>
                </div>
                {/* Launch Time */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Launch Time</span>
                  <span className="text-base text-foreground">{formatDateTime(instance.LaunchTime)}</span>
                </div>
                {/* Key Pair */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Key Pair</span>
                  <span className="text-base text-foreground">{instance.KeyName || "-"}</span>
                </div>
                {/* Monitoring */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Monitoring</span>
                  <span className="text-base text-foreground">
                    {instance.Monitoring === "enabled" ? "Detailed enabled" : "Basic"}
                  </span>
                </div>
                {/* VPC ID */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">VPC ID</span>
                  <span className="font-mono text-base text-foreground">{instance.VpcId || "-"}</span>
                </div>
                {/* Subnet ID */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Subnet ID</span>
                  <span className="font-mono text-base text-foreground">{instance.SubnetId || "-"}</span>
                </div>
                {/* Public DNS */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Public DNS</span>
                  <span className="text-base text-foreground break-all">{instance.PublicDnsName || "-"}</span>
                </div>
                {/* Private DNS */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Private DNS</span>
                  <span className="text-base text-foreground break-all">{instance.PrivateDnsName || "-"}</span>
                </div>
                {/* IAM Instance Profile */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">IAM Role / Profile</span>
                  <span className="text-base text-foreground break-all">{instance.IamInstanceProfile || "-"}</span>
                </div>
                {/* Resource counts */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Attached Resources</span>
                  <span className="text-base text-foreground">
                    {instance.NetworkInterfaces.length} NICs · {instance.BlockDeviceMappings.length} volumes ·{" "}
                    {instance.SecurityGroups.length} security groups
                  </span>
                </div>
                {/* Availability Zone */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Availability Zone</span>
                  <span className="text-base text-foreground">{instance.AvailabilityZone || "-"}</span>
                </div>
                {/* Security Groups */}
                <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-4 shadow-sm flex flex-col gap-2 col-span-1 md:col-span-2 xl:col-span-3 transition-all hover:shadow-md hover:border-aws-orange/60">
                  <span className="text-xs font-medium text-muted-foreground">Security Groups</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {instance.SecurityGroups?.length ? instance.SecurityGroups.map((sg) => (
                      <span key={sg.GroupId} className="inline-block rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-mono text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">{sg.GroupName} <span className="text-slate-400">({sg.GroupId})</span></span>
                    )) : <span className="text-muted-foreground">-</span>}
                  </div>
                </div>
              </div>
            </Section>
            <Section title="Host and placement group">
              <FieldGrid>
                <Field label="Availability Zone" value={instance.AvailabilityZone} />
                <Field label="Tenancy" value="default" />
                <Field label="Virtualization type" value={instance.VirtualizationType} />
                <Field label="Hypervisor" value={instance.Hypervisor} />
              </FieldGrid>
            </Section>
            <Section title="Host and capacity reservations">
              <FieldGrid>
                <Field label="Architecture" value={instance.Architecture} />
                <Field label="Platform" value={instance.Platform ?? "Linux/UNIX"} />
                <Field label="Platform details" value={instance.PlatformDetails} />
                <Field label="AMI ID" value={<span className="font-mono">{instance.ImageId}</span>} />
                <Field label="Root device name" value={instance.RootDeviceName} />
                <Field label="Root device type" value={instance.RootDeviceType} />
                <Field label="EBS-optimized" value={String(instance.EbsOptimized ?? false)} />
                <Field label="CPU cores" value={instance.CpuCoreCount} />
                <Field label="Threads per core" value={instance.CpuThreadsPerCore} />
              </FieldGrid>
            </Section>
          </TabsContent>

          <TabsContent value="status" className="mt-0">
            <Section title="Status checks">
              {statusQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading status…</p>
              ) : statusQuery.data?.error ? (
                <p className="text-sm text-destructive">{statusQuery.data.error}</p>
              ) : statusQuery.data?.status ? (
                <FieldGrid>
                  <Field label="System status" value={statusQuery.data.status.SystemStatus} />
                  <Field label="Instance status" value={statusQuery.data.status.InstanceStatus} />
                  <Field label="Instance state" value={statusQuery.data.status.InstanceState} />
                  <Field label="Availability Zone" value={statusQuery.data.status.AvailabilityZone} />
                </FieldGrid>
              ) : (
                <p className="text-sm text-muted-foreground">No status information.</p>
              )}
            </Section>
            <Section title="Scheduled events">
              {statusQuery.data?.status?.Events?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Not before</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusQuery.data.status.Events.map((e: any, i: number) => (
                      <TableRow key={`${e.Code}-${e.NotBefore}-${i}`}>
                        <TableCell>{e.Code}</TableCell>
                        <TableCell>{e.Description}</TableCell>
                        <TableCell>{e.NotBefore}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No scheduled events.</p>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="monitoring" className="mt-0">
            <Section title="CloudWatch monitoring">
              <FieldGrid>
                <Field label="Monitoring state" value={instance.Monitoring} />
                <Field label="Detailed monitoring" value={instance.Monitoring === "enabled" ? "Enabled" : "Disabled"} />
              </FieldGrid>
              <p className="mt-2 text-xs text-muted-foreground">
                Last 3 hours · 5 minute period · auto-refresh every 60s
              </p>
            </Section>
            <Section title="Metrics">
              <MetricsCharts instanceId={instance.InstanceId} region={region} />
            </Section>
          </TabsContent>

          <TabsContent value="security" className="mt-0">
            <Section title="Security details">
              <FieldGrid>
                <Field label="IAM Role" value={instance.IamInstanceProfile} />
                <Field label="Owner" value={null} />
                <Field label="Launch time" value={instance.LaunchTime} />
              </FieldGrid>
            </Section>
            <Section title="Security groups">
              {instance.SecurityGroups.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group ID</TableHead>
                      <TableHead>Group name</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instance.SecurityGroups.map((g) => (
                      <TableRow key={g.GroupId}>
                        <TableCell className="font-mono">{g.GroupId}</TableCell>
                        <TableCell>{g.GroupName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No security groups.</p>
              )}
            </Section>
            <Section title="Inbound rules">
              <SgRulesTable
                rules={(sgQuery.data?.groups ?? []).flatMap((g) =>
                  g.Rules.filter((r) => !r.IsEgress).map((r) => ({ ...r, GroupId: g.GroupId })),
                )}
                loading={sgQuery.isLoading}
                error={sgQuery.data?.error}
              />
            </Section>
            <Section title="Outbound rules">
              <SgRulesTable
                rules={(sgQuery.data?.groups ?? []).flatMap((g) =>
                  g.Rules.filter((r) => r.IsEgress).map((r) => ({ ...r, GroupId: g.GroupId })),
                )}
                loading={sgQuery.isLoading}
                error={sgQuery.data?.error}
              />
            </Section>
          </TabsContent>


          <TabsContent value="networking" className="mt-0">
            <Section title="Networking details">
              <FieldGrid>
                <Field label="Public IPv4 address" value={instance.PublicIpAddress} />
                <Field label="Private IPv4 addresses" value={instance.PrivateIpAddress} />
                <Field label="Public IPv4 DNS" value={instance.PublicDnsName} />
                <Field label="Private IP DNS name" value={instance.PrivateDnsName} />
                <Field label="VPC ID" value={instance.VpcId} />
                <Field label="Subnet ID" value={instance.SubnetId} />
                <Field label="Availability Zone" value={instance.AvailabilityZone} />
              </FieldGrid>
            </Section>
            <Section title="Network interfaces">
              {instance.NetworkInterfaces.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface ID</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Private IPv4</TableHead>
                      <TableHead>Public IPv4</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>Device idx</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instance.NetworkInterfaces.map((n) => (
                      <TableRow key={n.NetworkInterfaceId}>
                        <TableCell className="font-mono">{n.NetworkInterfaceId}</TableCell>
                        <TableCell>{n.Description ?? "–"}</TableCell>
                        <TableCell>{n.PrivateIpAddress ?? "–"}</TableCell>
                        <TableCell>{n.PublicIp ?? "–"}</TableCell>
                        <TableCell>{n.MacAddress ?? "–"}</TableCell>
                        <TableCell>{n.DeviceIndex ?? "–"}</TableCell>
                        <TableCell>{n.Status ?? "–"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No network interfaces.</p>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="storage" className="mt-0">
            <Section title="Root device">
              <FieldGrid>
                <Field label="Root device name" value={instance.RootDeviceName} />
                <Field label="Root device type" value={instance.RootDeviceType} />
                <Field label="EBS-optimized" value={String(instance.EbsOptimized ?? false)} />
              </FieldGrid>
            </Section>
            <Section title="Block devices">
              {instance.BlockDeviceMappings.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device name</TableHead>
                      <TableHead>Volume ID</TableHead>
                      <TableHead>Size (GiB)</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>IOPS</TableHead>
                      <TableHead>Throughput</TableHead>
                      <TableHead>Encrypted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Delete on term.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instance.BlockDeviceMappings.map((b, idx) => {
                      const v = volumesQuery.data?.volumes.find((x) => x.VolumeId === b.VolumeId);
                      return (
                        <TableRow key={b.VolumeId || `device-${idx}`}>
                          <TableCell className="font-mono">{b.DeviceName}</TableCell>
                          <TableCell className="font-mono">{b.VolumeId ?? "–"}</TableCell>
                          <TableCell>{v?.Size ?? "–"}</TableCell>
                          <TableCell>{v?.VolumeType ?? "–"}</TableCell>
                          <TableCell>{v?.Iops ?? "–"}</TableCell>
                          <TableCell>{v?.Throughput ?? "–"}</TableCell>
                          <TableCell>{v?.Encrypted ? "Yes" : "No"}</TableCell>
                          <TableCell>{b.Status ?? v?.State ?? "–"}</TableCell>
                          <TableCell>{String(b.DeleteOnTermination ?? false)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No block devices.</p>
              )}
              {volumesQuery.data?.error && (
                <p className="mt-2 text-xs text-destructive">{volumesQuery.data.error}</p>
              )}
            </Section>
          </TabsContent>

          <TabsContent value="tags" className="mt-0">
            <Section title={`Tags (${instance.Tags?.length ?? 0})`}>
              {instance.Tags?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Key</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instance.Tags.map((t) => (
                      <TableRow key={t.Key}>
                        <TableCell className="font-medium">{t.Key}</TableCell>
                        <TableCell>{t.Value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No tags.</p>
              )}
            </Section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-lg border border-border bg-panel p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

type SgRuleRow = {
  GroupId: string;
  IpProtocol: string;
  FromPort?: number;
  ToPort?: number;
  CidrIpv4?: string;
  CidrIpv6?: string;
  ReferencedGroupId?: string;
  PrefixListId?: string;
  Description?: string;
  IsEgress?: boolean;
};

function SgRulesTable({
  rules,
  loading,
  error,
}: {
  rules: SgRuleRow[];
  loading: boolean;
  error?: string | null;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading rules…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rules.length) return <p className="text-sm text-muted-foreground">No rules.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Security group</TableHead>
          <TableHead>Protocol</TableHead>
          <TableHead>Port range</TableHead>
          <TableHead>Source / Destination</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((r, i) => {
          const port =
            r.FromPort === undefined && r.ToPort === undefined
              ? "All"
              : r.FromPort === r.ToPort
                ? String(r.FromPort)
                : `${r.FromPort ?? 0} – ${r.ToPort ?? 0}`;
          const target =
            r.CidrIpv4 ?? r.CidrIpv6 ?? r.ReferencedGroupId ?? r.PrefixListId ?? "–";
          const ruleKey = `${r.GroupId}-${r.IpProtocol}-${r.FromPort}-${r.ToPort}-${target}-${i}`;
          return (
            <TableRow key={ruleKey}>
              <TableCell className="font-mono text-xs">{r.GroupId}</TableCell>
              <TableCell>{r.IpProtocol}</TableCell>
              <TableCell>{port}</TableCell>
              <TableCell className="font-mono text-xs">{target}</TableCell>
              <TableCell>{r.Description ?? "–"}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
