import { NextRequest, NextResponse } from 'next/server';

interface FilesystemEntry {
  mountpoint: string;
  device: string;
  fstype: string;
  sizeBytes: number;
  freeBytes: number;
  freeInodes: number;
}

interface HostSnapshot {
  load1: number;
  load5: number;
  load15: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryAvailableBytes: number;
  swapTotalBytes: number;
  swapFreeBytes: number;
  bootTimeSeconds: number;
  os: {
    sysname: string;
    release: string;
    version: string;
    machine: string;
  } | null;
  diskIo: {
    readIops: number;
    writeIops: number;
  };
  network: {
    receiveBytesPerSecond: number;
    transmitBytesPerSecond: number;
    history: Array<{
      timestamp: string;
      receiveBytesPerSecond: number;
      transmitBytesPerSecond: number;
    }>;
  };
  uptimeSeconds: number;
}

type CounterSnapshot = {
  capturedAt: number;
  diskReadsCompleted: number;
  diskWritesCompleted: number;
  networkReceiveBytes: number;
  networkTransmitBytes: number;
};

type CacheEntry = {
  expiresAt: number;
  data: { filesystems: FilesystemEntry[]; host: HostSnapshot; error: string | null };
  counters: CounterSnapshot | null;
};

const cache = new Map<string, CacheEntry>();

function parseLabels(labelString: string) {
  const labels: Record<string, string> = {};
  for (const match of labelString.matchAll(/(\w+)="([^"]*)"/g)) {
    labels[match[1]] = match[2];
  }
  return labels;
}

function parseFilesystemMetrics(metricText: string): FilesystemEntry[] {
  const entries = new Map<string, FilesystemEntry>();

  for (const rawLine of metricText.split("\n")) {
    if (!rawLine || rawLine.startsWith("#")) continue;
    const line = rawLine.trim();
    const match = line.match(/^(\w+)\{([^}]*)\}\s+([0-9.eE+-]+)$/);
    if (!match) continue;

    const metric = match[1];
    const labels = parseLabels(match[2]);
    const value = Number(match[3]);
    if (Number.isNaN(value)) continue;
    if (!labels.device || !labels.mountpoint) continue;

    const key = `${labels.device}|${labels.mountpoint}`;
    const existing = entries.get(key) ?? {
      mountpoint: labels.mountpoint,
      device: labels.device,
      fstype: labels.fstype ?? "",
      sizeBytes: 0,
      freeBytes: 0,
      freeInodes: 0,
    };

    if (metric === "node_filesystem_size_bytes") {
      existing.sizeBytes = value;
    } else if (metric === "node_filesystem_free_bytes") {
      existing.freeBytes = value;
    } else if (metric === "node_filesystem_files_free") {
      existing.freeInodes = value;
    }

    entries.set(key, existing);
  }

  return [...entries.values()].sort((a, b) => a.mountpoint.localeCompare(b.mountpoint));
}

function getMetricValue(metricText: string, metricName: string) {
  const escapedName = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = metricText.match(new RegExp(`^${escapedName}\\s+([0-9.eE+-]+)$`, "m"));
  return match ? Number(match[1]) : 0;
}

function getMetricLabels(metricText: string, metricName: string) {
  const escapedName = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = metricText.match(new RegExp(`^${escapedName}\\{([^}]*)\\}\\s+([0-9.eE+-]+)$`, "m"));
  return match ? parseLabels(match[1]) : null;
}

function sumMetric(metricText: string, metricName: string, labelFilter?: (labels: Record<string, string>) => boolean) {
  const escapedName = metricName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedName}\\{([^}]*)\\}\\s+([0-9.eE+-]+)$`, "gm");
  let total = 0;
  for (const match of metricText.matchAll(regex)) {
    const labels = parseLabels(match[1]);
    if (labelFilter && !labelFilter(labels)) continue;
    total += Number(match[2]);
  }
  return total;
}

function calculateRate(current: number, previous: number, elapsedSeconds: number) {
  if (elapsedSeconds <= 0 || current < previous) return 0;
  return (current - previous) / elapsedSeconds;
}

function buildHostSnapshot(metricText: string, now: number, previousCounters: CounterSnapshot | null): {
  host: HostSnapshot;
  counters: CounterSnapshot;
} {
  const diskReadsCompleted = sumMetric(
    metricText,
    "node_disk_reads_completed_total",
    (labels) => !!labels.device && !labels.device.startsWith("loop"),
  );
  const diskWritesCompleted = sumMetric(
    metricText,
    "node_disk_writes_completed_total",
    (labels) => !!labels.device && !labels.device.startsWith("loop"),
  );
  const networkReceiveBytes = sumMetric(
    metricText,
    "node_network_receive_bytes_total",
    (labels) => !!labels.device && labels.device !== "lo",
  );
  const networkTransmitBytes = sumMetric(
    metricText,
    "node_network_transmit_bytes_total",
    (labels) => !!labels.device && labels.device !== "lo",
  );

  const elapsedSeconds = previousCounters ? (now - previousCounters.capturedAt) / 1000 : 0;
  const receiveBytesPerSecond = previousCounters
    ? calculateRate(networkReceiveBytes, previousCounters.networkReceiveBytes, elapsedSeconds)
    : 0;
  const transmitBytesPerSecond = previousCounters
    ? calculateRate(networkTransmitBytes, previousCounters.networkTransmitBytes, elapsedSeconds)
    : 0;
  const readIops = previousCounters
    ? calculateRate(diskReadsCompleted, previousCounters.diskReadsCompleted, elapsedSeconds)
    : 0;
  const writeIops = previousCounters
    ? calculateRate(diskWritesCompleted, previousCounters.diskWritesCompleted, elapsedSeconds)
    : 0;

  const bootTimeSeconds = getMetricValue(metricText, "node_boot_time_seconds");
  const unameLabels = getMetricLabels(metricText, "node_uname_info");

  const host: HostSnapshot = {
    load1: getMetricValue(metricText, "node_load1"),
    load5: getMetricValue(metricText, "node_load5"),
    load15: getMetricValue(metricText, "node_load15"),
    memoryTotalBytes: getMetricValue(metricText, "node_memory_MemTotal_bytes"),
    memoryFreeBytes: getMetricValue(metricText, "node_memory_MemFree_bytes"),
    memoryAvailableBytes: getMetricValue(metricText, "node_memory_MemAvailable_bytes"),
    swapTotalBytes: getMetricValue(metricText, "node_memory_SwapTotal_bytes"),
    swapFreeBytes: getMetricValue(metricText, "node_memory_SwapFree_bytes"),
    bootTimeSeconds,
    os: unameLabels
      ? {
          sysname: unameLabels.sysname ?? "",
          release: unameLabels.release ?? "",
          version: unameLabels.version ?? "",
          machine: unameLabels.machine ?? "",
        }
      : null,
    diskIo: {
      readIops,
      writeIops,
    },
    network: {
      receiveBytesPerSecond,
      transmitBytesPerSecond,
      history: [],
    },
    uptimeSeconds: bootTimeSeconds > 0 ? Math.max(0, Math.floor(now / 1000 - bootTimeSeconds)) : 0,
  };

  const counters: CounterSnapshot = {
    capturedAt: now,
    diskReadsCompleted,
    diskWritesCompleted,
    networkReceiveBytes,
    networkTransmitBytes,
  };

  return { host, counters };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip")?.trim();
  if (!ip) {
    return NextResponse.json({ filesystems: [], host: null, error: "ip is required" }, { status: 400 });
  }

  if (!/^[0-9.]+$/.test(ip)) {
    return NextResponse.json({ filesystems: [], host: null, error: "Invalid IP address" }, { status: 400 });
  }

  const cacheKey = ip;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data);
  }

  const targetUrl = `http://${ip}:9100/metrics`;
  try {
    const res = await fetch(targetUrl, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { filesystems: [], host: null, error: `Failed to load node_exporter metrics from ${ip}:9100` },
        { status: 502 },
      );
    }

    const text = await res.text();
    const filesystems = parseFilesystemMetrics(text);
    const { host, counters } = buildHostSnapshot(text, now, cached?.counters ?? null);
    const history = cached?.data.host.network.history ?? [];
    host.network.history = [
      ...history,
      {
        timestamp: new Date(now).toISOString(),
        receiveBytesPerSecond: host.network.receiveBytesPerSecond,
        transmitBytesPerSecond: host.network.transmitBytesPerSecond,
      },
    ].slice(-24);

    const data = { filesystems, host, error: null as string | null };
    cache.set(cacheKey, { expiresAt: now + 5_000, data, counters });
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        filesystems: [],
        host: null,
        error: error instanceof Error ? error.message : "Failed to fetch node_exporter metrics.",
      },
      { status: 502 },
    );
  }
}
