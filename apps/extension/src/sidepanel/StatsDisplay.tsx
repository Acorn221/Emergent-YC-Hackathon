import React, { useEffect, useState } from "react";

import type { Stats } from "../utils/secshield-sdk";
import { createSDKFromStorage } from "../utils/secshield-sdk";

interface StatsDisplayProps {
  onRefresh?: () => void;
}

export default function StatsDisplay({ onRefresh }: StatsDisplayProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setIsRefreshing(true);
      const sdk = await createSDKFromStorage();

      if (!sdk) {
        setError("No API key configured");
        setStats(null);
        return;
      }

      const data = await sdk.getStats();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error("[StatsDisplay] Failed to fetch stats:", err);
      setError(err instanceof Error ? err.message : "Failed to load stats");
      setStats(null);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    fetchStats();
    onRefresh?.();
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-400 border-red-500";
      case "high":
        return "text-orange-400 border-orange-500";
      case "medium":
        return "text-yellow-400 border-yellow-500";
      case "low":
        return "text-blue-400 border-blue-500";
      default:
        return "text-green-400 border-green-500";
    }
  };

  if (loading) {
    return (
      <div className="rounded border border-green-800 bg-green-950/20 p-2">
        <div className="flex items-center gap-2 text-xs text-green-600">
          <span className="animate-pulse">●</span>
          <span>LOADING STATS...</span>
        </div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="rounded border border-red-800 bg-red-950/20 p-2">
        <div className="flex items-center gap-2 text-xs text-red-400">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-2 rounded border border-green-700 bg-green-950/20 p-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-green-800 pb-2">
        <div className="text-xs font-bold tracking-wider text-green-400">
          [SECURITY.STATS]
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-[10px] text-green-600 hover:text-green-400 disabled:text-green-800"
        >
          {isRefreshing ? "↻ SYNCING..." : "↻ REFRESH"}
        </button>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-green-800 bg-black/40 p-2 text-center">
          <div className="text-lg font-bold text-green-400">
            {stats.total_scans}
          </div>
          <div className="text-[9px] text-green-700">SCANS</div>
        </div>
        <div className="rounded border border-green-800 bg-black/40 p-2 text-center">
          <div className="text-lg font-bold text-green-400">
            {stats.total_vulnerabilities}
          </div>
          <div className="text-[9px] text-green-700">VULNS</div>
        </div>
        <div className="rounded border border-green-800 bg-black/40 p-2 text-center">
          <div className="text-lg font-bold text-green-400">
            {stats.credits_remaining}
          </div>
          <div className="text-[9px] text-green-700">CREDITS</div>
        </div>
      </div>

      {/* Severity Breakdown */}
      {stats.total_vulnerabilities > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-green-600">
            SEVERITY BREAKDOWN
          </div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(stats.severity_breakdown).map(
              ([severity, count]) => (
                <div
                  key={severity}
                  className={`flex items-center justify-between rounded border bg-black/40 px-2 py-1 text-[10px] ${getSeverityColor(severity)}`}
                >
                  <span className="uppercase">{severity}</span>
                  <span className="font-bold">{count}</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Top Vulnerability Types */}
      {Object.keys(stats.type_breakdown).length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-green-600">
            TOP VULNERABILITY TYPES
          </div>
          <div className="space-y-1">
            {Object.entries(stats.type_breakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 3)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded bg-black/40 px-2 py-1 text-[9px] text-green-400"
                >
                  <span className="truncate">{type}</span>
                  <span className="ml-2 font-bold text-green-300">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
