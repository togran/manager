"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateBadge } from "@/components/ec2/StateBadge";
import { InstanceDetail } from "@/components/ec2/InstanceDetail";
import { cn } from "@/lib/utils";
import type { AwsRegion, Ec2Instance } from "@/types/ec2";

// Force dynamic rendering since this page fetches data client-side
export const dynamic = 'force-dynamic';

function Index() {
  const router = useRouter();
  type InstanceAction = "start" | "stop" | "reboot" | "terminate";
  const adminOnlyMessage = "Only admin can use this feature.";

  async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.status === 401) {
      router.replace("/login");
      throw new Error("Unauthorized");
    }
    if (res.status === 403) {
      throw new Error("You do not have permission to perform this action.");
    }
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || fallbackMessage);
    }
    return data;
  }

  const meQuery = useQuery<{ user: { id: number; username: string; role: "admin" | "user" } | null }>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      return parseJsonOrThrow(res, "Failed to load session.");
    },
    retry: false,
  });

  const regionsQuery = useQuery<{ regions: AwsRegion[], default: string | null }>({
    queryKey: ["aws-regions"],
    queryFn: async () => {
      const res = await fetch("/api/ec2/regions", { cache: "no-store" });
      return parseJsonOrThrow(res, "Failed to load AWS regions.");
    },
    staleTime: Infinity,
  });

  const [region, setRegion] = useState<string>("");
  useEffect(() => {
    if (!region && regionsQuery.data?.default) setRegion(regionsQuery.data.default);
  }, [region, regionsQuery.data?.default]);

  const { data, isLoading, isFetching, refetch } = useQuery<{ instances: Ec2Instance[], error: string | null, region: string | null }>({
    queryKey: ["ec2-instances", region],
    queryFn: async () => {
      const res = await fetch(`/api/ec2/instances?region=${region}`, { cache: "no-store" });
      return parseJsonOrThrow(res, "Failed to load EC2 instances.");
    },
    enabled: !!region && region !== "",
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState<InstanceAction | null>(null);
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  const [bulkActionError, setBulkActionError] = useState<string | null>(null);

  const instances = data?.instances ?? [];
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const bySearch = q
      ? instances.filter(
          (i) =>
            i.InstanceId.toLowerCase().includes(q) ||
            i.Name.toLowerCase().includes(q) ||
            i.InstanceType.toLowerCase().includes(q),
        )
      : instances;

    const byState =
      stateFilter === "all" ? bySearch : bySearch.filter((i) => i.State.toLowerCase() === stateFilter);

    const sorted = [...byState].sort((a, b) => {
      if (sortBy === "launch-desc" || sortBy === "launch-asc") {
        const aTime = new Date(a.LaunchTime).getTime();
        const bTime = new Date(b.LaunchTime).getTime();
        return sortBy === "launch-desc" ? bTime - aTime : aTime - bTime;
      }
      if (sortBy === "state") {
        return a.State.localeCompare(b.State);
      }
      return (a.Name || a.InstanceId).localeCompare(b.Name || b.InstanceId);
    });

    return sorted;
  }, [instances, search, stateFilter, sortBy]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => instances.some((instance) => instance.InstanceId === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [instances]);

  const selected =
    instances.find((i) => i.InstanceId === selectedId) ?? filtered[0] ?? null;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((instance) => selectedIds.includes(instance.InstanceId));

  const someFilteredSelected =
    filtered.some((instance) => selectedIds.includes(instance.InstanceId)) && !allFilteredSelected;

  function toggleInstanceSelection(instanceId: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? (prev.includes(instanceId) ? prev : [...prev, instanceId]) : prev.filter((id) => id !== instanceId),
    );
  }

  function toggleSelectAllFiltered(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => {
        const merged = new Set([...prev, ...filtered.map((instance) => instance.InstanceId)]);
        return Array.from(merged);
      });
      return;
    }
    const filteredIds = new Set(filtered.map((instance) => instance.InstanceId));
    setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
  }

  async function runBulkAction(action: InstanceAction) {
    if (selectedIds.length === 0) return;
    if (action === "terminate") {
      const ok = window.confirm(
        `Terminate ${selectedIds.length} instance${selectedIds.length !== 1 ? "s" : ""}? This action can be destructive.`,
      );
      if (!ok) return;
    }
    setBulkActionLoading(action);
    setBulkActionMessage(null);
    setBulkActionError(null);
    try {
      const res = await fetch("/api/ec2/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          instanceIds: selectedIds,
          region,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; count?: number };
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        throw new Error("You do not have permission to run EC2 actions.");
      }
      if (!res.ok) {
        throw new Error(payload.error || "Failed to run action.");
      }
      const count = payload.count ?? selectedIds.length;
      setBulkActionMessage(`${action} request submitted for ${count} instance${count !== 1 ? "s" : ""}.`);
      await refetch();
      setSelectedIds([]);
    } catch (error) {
      setBulkActionError(error instanceof Error ? error.message : "Failed to run bulk action.");
    } finally {
      setBulkActionLoading(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function downloadExport(format: "csv" | "json") {
    if (meQuery.data?.user?.role !== "admin") {
      window.alert(adminOnlyMessage);
      return;
    }
    if (!region) return;
    const params = new URLSearchParams({
      format,
      region,
      state: stateFilter,
      search,
    });
    window.open(`/api/ec2/export?${params.toString()}`, "_blank");
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <header className="relative overflow-hidden border-b border-slate-200/50 bg-gradient-to-r from-aws-navy via-aws-navy to-slate-800 shadow-lg dark:border-slate-700/50">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
        </div>

        <div className="relative flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Enhanced AWS Logo */}
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-aws-orange to-orange-500 shadow-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-aws-navy">
                  <span className="text-sm font-bold text-aws-orange">EC2</span>
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-green-400 shadow-sm"></div>
            </div>

            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-white">
                EC2 Instances Console
              </h1>
              <p className="text-xs text-slate-300">
                AWS Infrastructure Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {meQuery.data?.user && (
              <div className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white sm:flex">
                <span>{meQuery.data.user.username}</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 uppercase">{meQuery.data.user.role}</span>
              </div>
            )}
            {meQuery.data?.user?.role === "admin" && (
              <Link
                href="/admin/users"
                className="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                Admin Panel
              </Link>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="h-9 border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              Logout
            </Button>
            {/* Status indicator */}
            <div className="hidden items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 backdrop-blur-sm sm:flex">
              <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-xs font-medium text-white">Connected</span>
            </div>

            {/* Region selector */}
            <Select value={region} onValueChange={(v) => { setRegion(v); setSelectedId(null); }}>
              <SelectTrigger className="h-9 w-48 sm:w-64 border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 focus:ring-aws-orange">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent className="border-slate-200">
                {Object.entries(
                  (regionsQuery.data?.regions ?? []).reduce<Record<string, { code: string; name: string }[]>>(
                    (acc, r) => {
                      (acc[r.group] ??= []).push({ code: r.code, name: r.name });
                      return acc;
                    },
                    {},
                  ),
                ).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {group}
                    </div>
                    {items.map((r) => (
                      <SelectItem key={r.code} value={r.code} className="text-sm">
                        <span className="flex w-full items-center justify-between gap-4">
                          <span>{r.name}</span>
                          <span className="font-mono text-slate-500">{r.code}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        <div className="flex w-80 flex-col border-r border-slate-200/60 bg-white/80 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/80">
          {/* Search and controls */}
          <div className="flex items-center gap-3 border-b border-slate-200/60 bg-slate-50/50 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/50">
            <div className="relative flex-1">
              <Input
                placeholder="Search instances..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 border-slate-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-9 px-3 border-slate-200 bg-white shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              {isFetching ? (
                <svg className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-slate-200/60 bg-slate-50/30 px-4 py-2 dark:border-slate-700/60 dark:bg-slate-800/30">
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="stopped">Stopped</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="stopping">Stopping</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="state">Sort: State</SelectItem>
                <SelectItem value="launch-desc">Launch: Newest</SelectItem>
                <SelectItem value="launch-asc">Launch: Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 bg-slate-50/30 px-4 py-2 dark:border-slate-700/60 dark:bg-slate-800/30">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Export & Reports
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!region}
                onClick={() => downloadExport("csv")}
                title={meQuery.data?.user?.role === "admin" ? "Export CSV report" : adminOnlyMessage}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!region}
                onClick={() => downloadExport("json")}
                title={meQuery.data?.user?.role === "admin" ? "Export JSON report" : adminOnlyMessage}
              >
                Export JSON
              </Button>
            </div>
          </div>
          {meQuery.data?.user?.role === "admin" && selectedIds.length > 0 && (
            <div className="border-b border-slate-200/60 bg-aws-orange/10 px-4 py-3 text-xs dark:border-slate-700/60 dark:bg-aws-orange/5">
              <div className="mb-2 font-medium text-slate-700 dark:text-slate-200">
                {selectedIds.length} selected
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkActionLoading !== null} onClick={() => runBulkAction("start")}>
                  {bulkActionLoading === "start" ? "Starting..." : "Start"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkActionLoading !== null} onClick={() => runBulkAction("stop")}>
                  {bulkActionLoading === "stop" ? "Stopping..." : "Stop"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkActionLoading !== null} onClick={() => runBulkAction("reboot")}>
                  {bulkActionLoading === "reboot" ? "Rebooting..." : "Reboot"}
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={bulkActionLoading !== null} onClick={() => runBulkAction("terminate")}>
                  {bulkActionLoading === "terminate" ? "Terminating..." : "Terminate"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </div>
              {bulkActionMessage && <p className="mt-2 text-emerald-700 dark:text-emerald-400">{bulkActionMessage}</p>}
              {bulkActionError && <p className="mt-2 text-red-700 dark:text-red-400">{bulkActionError}</p>}
            </div>
          )}

          {/* Instance count */}
          <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50/30 px-4 py-2 text-xs text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/30 dark:text-slate-400">
            <span className="flex items-center gap-2">
              {meQuery.data?.user?.role === "admin" && (
                <Checkbox
                  checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => toggleSelectAllFiltered(checked === true)}
                  aria-label="Select all filtered instances"
                />
              )}
              Instances
            </span>
            <span className="font-medium">{filtered.length} of {instances.length}</span>
          </div>

          {/* Instance list */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-aws-orange border-t-transparent"></div>
                  <div className="text-sm text-slate-500">Loading instances...</div>
                </div>
              </div>
            ) : data?.error ? (
              <div className="p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                    <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div className="text-sm font-medium text-red-900 dark:text-red-200">Failed to load instances</div>
                  <div className="text-xs text-red-700 dark:text-red-300">{data.error}</div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
                {filtered.map((instance) => (
                  <button
                    key={instance.InstanceId}
                    onClick={() => setSelectedId(instance.InstanceId)}
                    className={cn(
                      "w-full p-4 text-left transition-all duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/50",
                      selected?.InstanceId === instance.InstanceId && "bg-aws-orange/10 border-r-2 border-r-aws-orange dark:bg-aws-orange/5",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {meQuery.data?.user?.role === "admin" && (
                        <div
                          className="pt-0.5"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          <Checkbox
                            checked={selectedIds.includes(instance.InstanceId)}
                            onCheckedChange={(checked) => toggleInstanceSelection(instance.InstanceId, checked === true)}
                            aria-label={`Select ${instance.InstanceId}`}
                          />
                        </div>
                      )}
                      <div className="relative mt-0.5">
                        <StateBadge state={instance.State} />
                        {selected?.InstanceId === instance.InstanceId && (
                          <div className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-aws-orange"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {instance.Name || instance.InstanceId}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {instance.InstanceType}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {instance.AvailabilityZone}
                          </div>
                          <div className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600"></div>
                          <div className="font-mono">{instance.InstanceId.split('-').pop()}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                      <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">No instances found</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {search ? "Try adjusting your search terms" : "No instances in this region"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1">
          {selected ? (
            <InstanceDetail
              instance={selected}
              region={data?.region ?? null}
              role={meQuery.data?.user?.role ?? "user"}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-50/50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-900/50">
              <div className="max-w-md text-center">
                <div className="relative">
                  {/* Animated background circles */}
                  <div className="absolute inset-0 -m-8">
                    <div className="absolute left-1/2 top-4 h-16 w-16 -translate-x-1/2 animate-ping rounded-full bg-aws-orange/20"></div>
                    <div className="absolute left-1/2 top-2 h-12 w-12 -translate-x-1/2 animate-pulse rounded-full bg-aws-orange/30"></div>
                  </div>

                  {/* Main illustration */}
                  <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-aws-orange/10 to-orange-100 dark:from-aws-orange/20 dark:to-orange-900/20">
                    <svg className="h-16 w-16 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>

                <div className="mt-8">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Select an EC2 Instance
                  </h2>
                  <p className="mt-2 text-slate-600 dark:text-slate-400">
                    Choose an instance from the sidebar to view its details, monitor performance, and manage configuration.
                  </p>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-white/60 p-4 shadow-sm dark:bg-slate-800/60">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                      <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">Monitor</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Performance</div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-lg bg-white/60 p-4 shadow-sm dark:bg-slate-800/60">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">Configure</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Settings</div>
                  </div>

                  <div className="flex flex-col items-center gap-2 rounded-lg bg-white/60 p-4 shadow-sm dark:bg-slate-800/60">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div className="text-xs font-medium text-slate-900 dark:text-slate-100">Alerts</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">& Events</div>
                  </div>
                </div>

                <div className="mt-8 text-xs text-slate-500 dark:text-slate-400">
                  {instances.length === 0 ? (
                    <>No instances available in the selected region</>
                  ) : (
                    <>Select from {instances.length} available instance{instances.length !== 1 ? 's' : ''}</>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Index;