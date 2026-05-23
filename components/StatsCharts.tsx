"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import type {
  TopChat,
  MediaBreakdown,
  EmojiCount,
  HeatmapCell,
  DailyCount,
} from "@/lib/db";

const COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4",
  "#a855f7", "#eab308",
];

export function TopChatsBar({ data }: { data: TopChat[] }) {
  const chart = data.map((d) => ({ ...d, shortName: (d.name.length > 22 ? d.name.slice(0, 20) + "…" : d.name) }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chart.length * 28)}>
      <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 20, top: 8, bottom: 8 }}>
        <XAxis type="number" stroke="#71717a" fontSize={11} />
        <YAxis type="category" dataKey="shortName" stroke="#a1a1aa" fontSize={11} width={170} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
          labelStyle={{ color: "#e4e4e7" }}
          cursor={{ fill: "#27272a" }}
        />
        <Bar dataKey="msgs" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MediaPie({ data }: { data: MediaBreakdown[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="type" innerRadius={50} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#09090b" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
          labelStyle={{ color: "#e4e4e7" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function EmojiPie({ data }: { data: EmojiCount[] }) {
  if (data.length === 0) {
    return <div className="text-sm text-zinc-500 py-8 text-center">No reactions captured yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="emoji" innerRadius={50} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#09090b" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
          labelStyle={{ color: "#e4e4e7" }}
        />
        <Legend wrapperStyle={{ fontSize: 14, color: "#a1a1aa" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DailyVolumeLine({ data }: { data: DailyCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickFormatter={(d) => d.slice(5)} />
        <YAxis stroke="#71717a" fontSize={11} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
          labelStyle={{ color: "#e4e4e7" }}
        />
        <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ActivityHeatmap({ data }: { data: HeatmapCell[] }) {
  // Build a 7×24 grid + find max for normalization
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let max = 0;
  for (const cell of data) {
    grid[cell.dow][cell.hour] = cell.count;
    if (cell.count > max) max = cell.count;
  }
  return (
    <div>
      <div className="grid grid-cols-[40px_1fr] gap-1 text-[10px] text-zinc-500">
        <div />
        <div className="grid grid-cols-24 gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-center">{h % 6 === 0 ? h : ""}</div>
          ))}
        </div>
        {grid.map((row, dow) => (
          <DowRow key={dow} dow={dow} row={row} max={max} />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map((t) => (
          <div key={t} className="w-4 h-3 rounded-sm" style={{ background: `rgba(16, 185, 129, ${t})` }} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

function DowRow({ dow, row, max }: { dow: number; row: number[]; max: number }) {
  return (
    <>
      <div className="text-zinc-400 leading-4">{DOW_LABELS[dow]}</div>
      <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
        {row.map((c, h) => {
          const intensity = max > 0 ? c / max : 0;
          const bg = c > 0 ? `rgba(16, 185, 129, ${0.1 + intensity * 0.9})` : "#27272a";
          return (
            <div
              key={h}
              title={`${DOW_LABELS[dow]} ${h}:00 — ${c} msgs`}
              className="aspect-square rounded-sm"
              style={{ background: bg }}
            />
          );
        })}
      </div>
    </>
  );
}
