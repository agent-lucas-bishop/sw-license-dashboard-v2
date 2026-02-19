
import './index.css';
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  FileText, Upload, Users, ShieldAlert, Clock, Activity, Download, 
  Moon, Sun, LayoutDashboard, Database, AlertTriangle, CheckCircle, Search, Filter,
  ChevronRight, Printer, FileDown, Info, Server, Cpu, Menu, X
} from 'lucide-react';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// --- Color Palette (Branded) ---
const COLORS = {
  brandDark: '#1e2943',
  brandMid: '#1871bd',
  brandBlue: '#46b6e3',
  dnBluePrimary: '#3981cc',
  dnBlueMachine: '#7eaae9',
  dnBlue2025: '#222843',
  dnGreyMachine: '#7a7a7a',
  dnGreyLight: '#d8d8d6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  chart: ['#1871bd', '#46b6e3', '#3981cc', '#7eaae9', '#1e2943', '#10b981', '#f59e0b', '#ef4444']
};

// --- Types ---
interface LogEntry {
  time: string;
  date?: string;
  daemon: string;
  type: 'OUT' | 'IN' | 'DENIED' | 'UNSUPPORTED' | 'TIMESTAMP' | 'SLOG' | 'ERROR' | 'INFO' | 'RESERVING' | 'REMOVING' | 'REREAD' | 'VERSION';
  user?: string;
  host?: string;
  feature?: string;
  reason?: string;
  raw: string;
}

interface Session {
  user: string;
  host: string;
  feature: string;
  start: Date;
  end?: Date;
  duration?: number; // in minutes
}

interface DashboardData {
  metadata: {
    serverName: string;
    flexVersion: string;
    port: string;
    vendorPort: string;
    pid: string;
    logPath: string;
    startDate?: string;
    endDate?: string;
  };
  entries: LogEntry[];
  sessions: Session[];
  denials: LogEntry[];
  usageByFeature: Record<string, { checkouts: number, denials: number, totalDuration: number }>;
  userStats: Record<string, { sessions: number, totalDuration: number, denials: number }>;
  featureStats: Record<string, { checkouts: number, denials: number, totalDuration: number }>;
  timeSeriesUsage: { time: string, count: number }[];
  denialsByDay: { time: string, count: number }[];
  errors: LogEntry[];
  // New analytics
  peakHours: { hour: number, count: number }[];
  concurrentUsage: { time: string, concurrent: number }[];
  durationDistribution: { bucket: string, count: number }[];
  hostStats: Record<string, { sessions: number, totalDuration: number, users: Set<string> }>;
  featureCoUsage: { pair: string, count: number }[];
  denialRatioByFeature: { name: string, checkouts: number, denials: number, ratio: number }[];
}

// --- Utils ---
const formatDuration = (mins: number) => {
  if (isNaN(mins) || mins === 0) return '0m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${hrs}h ${m}m`;
};

// Reusable analytics computation — used by both initial parse and filtered views
const computeAnalytics = (sessions: Session[], denials: LogEntry[]) => {
  const userStats: Record<string, { sessions: number, totalDuration: number, denials: number }> = {};
  const featureStats: Record<string, { checkouts: number, denials: number, totalDuration: number }> = {};
  const timeSeries: Record<string, number> = {};
  const denialsByDayMap: Record<string, number> = {};

  sessions.forEach(s => {
    if (!userStats[s.user]) userStats[s.user] = { sessions: 0, totalDuration: 0, denials: 0 };
    userStats[s.user].sessions++;
    userStats[s.user].totalDuration += s.duration || 0;

    if (!featureStats[s.feature]) featureStats[s.feature] = { checkouts: 0, denials: 0, totalDuration: 0 };
    featureStats[s.feature].checkouts++;
    featureStats[s.feature].totalDuration += s.duration || 0;

    const timeKey = s.start.toISOString().split('T')[0];
    timeSeries[timeKey] = (timeSeries[timeKey] || 0) + 1;
  });

  denials.forEach(d => {
    if (d.user && !userStats[d.user]) userStats[d.user] = { sessions: 0, totalDuration: 0, denials: 0 };
    if (d.user) userStats[d.user].denials++;
    if (d.feature && !featureStats[d.feature]) featureStats[d.feature] = { checkouts: 0, denials: 0, totalDuration: 0 };
    if (d.feature) featureStats[d.feature].denials++;
    const dateKey = d.date || 'Unknown';
    denialsByDayMap[dateKey] = (denialsByDayMap[dateKey] || 0) + 1;
  });

  // Peak Hours
  const hourCounts: Record<number, number> = {};
  sessions.forEach(s => { const h = s.start.getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
  const peakHours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourCounts[i] || 0 }));

  // Concurrent Usage
  const concurrentMap: Record<string, number> = {};
  const validSessions = sessions.filter(s => s.end && !isNaN(s.start.getTime()) && !isNaN(s.end.getTime()));
  if (validSessions.length > 0) {
    const events: { time: number, delta: number }[] = [];
    validSessions.forEach(s => {
      events.push({ time: s.start.getTime(), delta: 1 });
      events.push({ time: s.end!.getTime(), delta: -1 });
    });
    events.sort((a, b) => a.time - b.time);
    let concurrent = 0;
    events.forEach(e => {
      concurrent += e.delta;
      const day = new Date(e.time).toISOString().split('T')[0];
      concurrentMap[day] = Math.max(concurrentMap[day] || 0, concurrent);
    });
  }
  const concurrentUsage = Object.entries(concurrentMap).map(([time, concurrent]) => ({ time, concurrent })).sort((a, b) => a.time.localeCompare(b.time));

  // Duration Distribution
  const durationBuckets: Record<string, number> = { '<15m': 0, '15m-1h': 0, '1-2h': 0, '2-4h': 0, '4-8h': 0, '8h+': 0 };
  sessions.forEach(s => {
    const d = s.duration || 0;
    if (d < 15) durationBuckets['<15m']++;
    else if (d < 60) durationBuckets['15m-1h']++;
    else if (d < 120) durationBuckets['1-2h']++;
    else if (d < 240) durationBuckets['2-4h']++;
    else if (d < 480) durationBuckets['4-8h']++;
    else durationBuckets['8h+']++;
  });
  const durationDistribution = Object.entries(durationBuckets).map(([bucket, count]) => ({ bucket, count }));

  // Host Stats
  const hostStats: Record<string, { sessions: number, totalDuration: number, users: Set<string> }> = {};
  sessions.forEach(s => {
    if (!hostStats[s.host]) hostStats[s.host] = { sessions: 0, totalDuration: 0, users: new Set() };
    hostStats[s.host].sessions++;
    hostStats[s.host].totalDuration += s.duration || 0;
    hostStats[s.host].users.add(s.user);
  });

  // Feature Co-usage
  const userFeatures: Record<string, Set<string>> = {};
  sessions.forEach(s => {
    if (!userFeatures[s.user]) userFeatures[s.user] = new Set();
    userFeatures[s.user].add(s.feature);
  });
  const pairCounts: Record<string, number> = {};
  Object.values(userFeatures).forEach(features => {
    const arr = Array.from(features).sort();
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        pairCounts[`${arr[i]} + ${arr[j]}`] = (pairCounts[`${arr[i]} + ${arr[j]}`] || 0) + 1;
  });
  const featureCoUsage = Object.entries(pairCounts).map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  // Denial Ratio
  const denialRatioByFeature = Object.entries(featureStats)
    .filter(([_, s]) => s.checkouts > 0 || s.denials > 0)
    .map(([name, s]) => ({ name, checkouts: s.checkouts, denials: s.denials, ratio: (s.checkouts + s.denials) > 0 ? Math.round((s.denials / (s.checkouts + s.denials)) * 100) : 0 }))
    .sort((a, b) => b.ratio - a.ratio);

  return {
    usageByFeature: featureStats,
    userStats,
    featureStats,
    timeSeriesUsage: Object.entries(timeSeries).map(([time, count]) => ({ time, count })).sort((a, b) => a.time.localeCompare(b.time)),
    denialsByDay: Object.entries(denialsByDayMap).map(([time, count]) => ({ time, count })).sort((a, b) => a.time.localeCompare(b.time)),
    peakHours,
    concurrentUsage,
    durationDistribution,
    hostStats,
    featureCoUsage,
    denialRatioByFeature,
  };
};

const parseLogFile = (content: string): DashboardData => {
  const lines = content.split(/\r?\n/);
  const entries: LogEntry[] = [];
  const sessions: Session[] = [];
  const openSessions: Record<string, Session> = {};
  
  let currentYear = new Date().getFullYear();
  let currentDate = '';
  
  // Metadata extraction
  let serverName = 'Unknown';
  let flexVersion = 'Unknown';
  let port = 'Unknown';
  let vendorPort = 'Unknown';
  let pid = 'Unknown';
  let logPath = 'Unknown';

  lines.forEach(line => {
    // FlexLM logs often have leading spaces. Regex adjusted to be more forgiving.
    const timeMatch = line.match(/^\s*(\d{1,2}:\d{2}:\d{2})\s+\(([\w\s.-]+)\)\s+(.*)$/);
    if (!timeMatch) return;

    const [_, time, daemon, message] = timeMatch;
    let entry: LogEntry = { time, daemon, type: 'INFO', raw: line };

    // Update Date from TIMESTAMP or SLOG lines
    if (message.includes('TIMESTAMP')) {
      const dateMatch = message.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) currentDate = dateMatch[1];
      entry.type = 'TIMESTAMP';
    }

    // Metadata extraction
    if (message.includes('FLEXnet Licensing')) {
      const vMatch = message.match(/v(\d+\.\d+\.\d+\.\d+)/);
      if (vMatch) flexVersion = vMatch[1];
      entry.type = 'VERSION';
    }
    if (daemon.toLowerCase() === 'lmgrd' && message.includes('on port')) {
      const pMatch = message.match(/port (\d+)/);
      if (pMatch) port = pMatch[1];
    }
    if (message.includes('serving licenses on port')) {
      const vpMatch = message.match(/port (\d+)/);
      if (vpMatch) vendorPort = vpMatch[1];
    }
    if (daemon.toLowerCase() === 'lmgrd' && message.includes('Server\'s nodeid')) {
      // Often looks like: "hostname (lmgrd) Server's nodeid is..."
      const hMatch = line.match(/^\s*[\d:]+\s+(\w+)\s+\(lmgrd\)/);
      if (hMatch) serverName = hMatch[1];
    }
    if (message.includes('license file(s)')) {
      const dMatch = message.match(/:(.*)/);
      if (dMatch) logPath = dMatch[1].trim();
    }
    if (message.includes('pid')) {
      const pidMatch = message.match(/pid (\d+)/);
      if (pidMatch) pid = pidMatch[1];
    }

    // Date might be present in some lines as a fallback
    entry.date = currentDate;

    // Event Types
    if (message.includes('OUT:')) {
      entry.type = 'OUT';
      // Match features with or without quotes
      const parts = message.match(/OUT:\s+"?([^"\s]+)"?\s+(\S+)@(\S+)/);
      if (parts) {
        entry.feature = parts[1];
        entry.user = parts[2];
        entry.host = parts[3];
        
        // Track Session
        const key = `${entry.user}@${entry.host}:${entry.feature}`;
        const startTime = new Date(`${currentDate || '1/1/' + currentYear} ${time}`);
        openSessions[key] = { user: entry.user, host: entry.host, feature: entry.feature, start: startTime };
      }
    } else if (message.includes('IN:')) {
      entry.type = 'IN';
      const parts = message.match(/IN:\s+"?([^"\s]+)"?\s+(\S+)@(\S+)/);
      if (parts) {
        entry.feature = parts[1];
        entry.user = parts[2];
        entry.host = parts[3];

        const key = `${entry.user}@${entry.host}:${entry.feature}`;
        if (openSessions[key]) {
          const endTime = new Date(`${currentDate || '1/1/' + currentYear} ${time}`);
          const session = openSessions[key];
          session.end = endTime;
          session.duration = (endTime.getTime() - session.start.getTime()) / 60000;
          if (session.duration >= 0) {
            sessions.push({ ...session });
          }
          delete openSessions[key];
        }
      }
    } else if (message.includes('DENIED:')) {
      entry.type = 'DENIED';
      const parts = message.match(/DENIED:\s+"?([^"\s]+)"?\s+(\S+)@(\S+)\s+\((.*)\)/);
      if (parts) {
        entry.feature = parts[1];
        entry.user = parts[2];
        entry.host = parts[3];
        entry.reason = parts[4];
      }
    } else if (message.includes('UNSUPPORTED')) {
      entry.type = 'UNSUPPORTED';
      const parts = message.match(/UNSUPPORTED:\s+"?([^"\s]+)"?/);
      if (parts) entry.feature = parts[1];
    } else if (message.includes('RESERVING')) {
      entry.type = 'RESERVING';
    } else if (message.toLowerCase().includes('error') || message.includes('EXITING')) {
      entry.type = 'ERROR';
    }

    entries.push(entry);
  });

  const denials = entries.filter(e => e.type === 'DENIED');
  const analytics = computeAnalytics(sessions, denials);

  return {
    metadata: { serverName, flexVersion, port, vendorPort, pid, logPath, startDate: currentDate },
    entries,
    sessions,
    denials,
    errors: entries.filter(e => e.type === 'ERROR' || e.type === 'UNSUPPORTED'),
    ...analytics
  };
};

// --- Components ---

const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="relative bg-[#111827] border-l-2 pl-5 pr-4 py-4" style={{ borderColor: color }}>
    <div className="flex items-center gap-2 mb-1">
      <Icon size={14} style={{ color }} className="opacity-60" />
      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">{title}</span>
    </div>
    <p className="text-2xl font-bold text-white font-mono-brand tabular-nums">{value}</p>
  </div>
);

const ExecutiveSummary = ({ data }: { data: DashboardData }) => {
  const topApp = Object.entries(data.featureStats).sort((a,b) => b[1].checkouts - a[1].checkouts)[0];
  const topDenied = Object.entries(data.featureStats).sort((a,b) => b[1].denials - a[1].denials)[0];
  const totalSessions = data.sessions.length;
  const totalDenials = data.denials.length;
  const totalCheckoutsAttempted = totalSessions + totalDenials;
  const denialRate = totalCheckoutsAttempted > 0 ? ((totalDenials / totalCheckoutsAttempted) * 100).toFixed(1) : '0';

  const healthStatus = Number(denialRate) > 10 || data.errors.filter(e => e.type === 'ERROR').length > 5 ? 'AT RISK' : Number(denialRate) > 5 ? 'WARNING' : 'HEALTHY';
  const healthColor = healthStatus === 'AT RISK' ? 'text-red-400 border-red-400/30 bg-red-400/5' : healthStatus === 'WARNING' ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5' : 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5';

  return (
    <div className="border border-slate-800 bg-[#111827]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#0c1220]">
        <span className="text-[11px] text-slate-500 uppercase tracking-widest font-medium">Executive Summary</span>
        <div className={`px-3 py-1 border text-[10px] font-bold uppercase tracking-widest ${healthColor}`}>
          {healthStatus}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
        {/* Left: narrative */}
        <div className="lg:col-span-2 p-6">
          <p className="text-sm text-slate-400 leading-relaxed">
            Analyzed <span className="text-white font-semibold">{data.metadata.serverName}</span> — 
            <span className="text-white font-semibold"> {totalSessions.toLocaleString()}</span> sessions across 
            <span className="text-white font-semibold"> {Object.keys(data.featureStats).length}</span> features and 
            <span className="text-white font-semibold"> {Object.keys(data.userStats).length}</span> users. 
            {topApp && <> Top feature: <span className="text-[#46b6e3] font-medium">{topApp[0]}</span>.</>}
            {totalDenials > 0 && <> Denial rate: <span className={`font-semibold ${Number(denialRate) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>{denialRate}%</span> ({totalDenials} events).</>}
          </p>

          {/* Alerts */}
          <div className="mt-4 space-y-2">
            {totalDenials > 20 && (
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-red-400 font-bold mt-px">!</span>
                <span><strong className="text-red-400">License Scarcity</strong> — Frequent denials for "{topDenied?.[0]}". Consider additional seats.</span>
              </div>
            )}
            {data.errors.length > 5 && (
              <div className="flex items-start gap-2 text-xs text-slate-400">
                <span className="text-amber-400 font-bold mt-px">!</span>
                <span><strong className="text-amber-400">System Events</strong> — {data.errors.length} errors/warnings detected. Review server health.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: quick stats */}
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Denial Rate</span>
            <span className={`text-lg font-bold font-mono-brand ${Number(denialRate) > 5 ? 'text-red-400' : 'text-emerald-400'}`}>{denialRate}%</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">Active Features</span>
            <span className="text-lg font-bold font-mono-brand text-white">{Object.keys(data.featureStats).length}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">FlexLM</span>
            <span className="text-sm font-mono-brand text-slate-400">v{data.metadata.flexVersion} · Port {data.metadata.port}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- PDF Report Components ---
// PDF is now generated purely via jsPDF drawing API (no html2canvas)
// Old ReportPageHeader/Footer/MasterReport components removed

// PDF is now generated purely via jsPDF drawing API (no html2canvas needed for reports)

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isParsing, setIsParsing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterFeature, setFilterFeature] = useState<string>('');
  const reportRef = useRef<HTMLDivElement>(null);

  // All unique users and features for filter dropdowns
  const allUsers = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.sessions.map(s => s.user))).sort();
  }, [data]);

  const allFeatures = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.sessions.map(s => s.feature))).sort();
  }, [data]);

  // Filtered data — recomputes all analytics when filters change
  const filteredData = useMemo(() => {
    if (!data) return null;
    if (!filterUser && !filterFeature) return data;

    const filteredSessions = data.sessions.filter(s => 
      (!filterUser || s.user === filterUser) && 
      (!filterFeature || s.feature === filterFeature)
    );
    const filteredDenials = data.denials.filter(d => 
      (!filterUser || d.user === filterUser) && 
      (!filterFeature || d.feature === filterFeature)
    );
    const filteredErrors = data.errors.filter(e =>
      (!filterFeature || e.feature === filterFeature)
    );
    const analytics = computeAnalytics(filteredSessions, filteredDenials);

    return {
      ...data,
      sessions: filteredSessions,
      denials: filteredDenials,
      errors: filteredErrors,
      ...analytics,
    };
  }, [data, filterUser, filterFeature]);

  // Use filteredData everywhere (aliased as 'd' for brevity in JSX)
  const d = filteredData;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseLogFile(content);
      setData(parsed);
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  const [pdfGenerating, setPdfGenerating] = useState(false);
  const downloadMasterPDF = async () => {
    if (!data) return;
    setPdfGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const cw = W - margin * 2; // content width
      let y = 0;

      const totalSessions = data.sessions.length;
      const totalDenials = data.denials.length;
      const denialRate = (totalSessions + totalDenials) > 0 ? ((totalDenials / (totalSessions + totalDenials)) * 100).toFixed(1) : '0';
      const avgDuration = totalSessions > 0 ? data.sessions.reduce((a, s) => a + (s.duration || 0), 0) / totalSessions : 0;
      const topFeatures = Object.entries(data.featureStats).sort((a, b) => b[1].checkouts - a[1].checkouts);
      const topUsers = Object.entries(data.userStats).sort((a, b) => b[1].sessions - a[1].sessions);

      const drawHeader = (title: string) => {
        pdf.setFillColor(30, 41, 67); // brand dark
        pdf.rect(0, 0, W, 18, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Ellison Technologies · SNL License Parser', margin, 7);
        pdf.setFont('helvetica', 'bold');
        pdf.text(title, W - margin, 7, { align: 'right' });
        // blue accent line
        pdf.setFillColor(24, 113, 189);
        pdf.rect(0, 18, W, 1, 'F');
        return 26;
      };

      const drawFooter = (pageNum: number, totalPages: number) => {
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, H - 12, W - margin, H - 12);
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Generated ${new Date().toLocaleDateString()} · SNL License Parser · Ellison Technologies`, margin, H - 7);
        pdf.text(`${data.metadata.serverName} · Page ${pageNum} of ${totalPages}`, W - margin, H - 7, { align: 'right' });
      };

      const drawSectionTitle = (title: string, yPos: number) => {
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(30, 41, 67);
        pdf.text(title, margin, yPos);
        pdf.setFillColor(24, 113, 189);
        pdf.rect(margin, yPos + 1.5, 30, 0.8, 'F');
        return yPos + 8;
      };

      const totalPages = totalDenials > 0 ? 4 : 3;

      // === PAGE 1: Cover + Executive Summary ===
      y = drawHeader('Executive Summary');

      // Title block
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 67);
      pdf.text('SNL License Manager Report', W / 2, y + 8, { align: 'center' });
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Server: ${data.metadata.serverName}  ·  FlexLM v${data.metadata.flexVersion}  ·  Port ${data.metadata.port}`, W / 2, y + 15, { align: 'center' });
      pdf.text(`Report generated ${new Date().toLocaleDateString()}`, W / 2, y + 21, { align: 'center' });
      y += 30;

      // KPI boxes
      const kpis = [
        { label: 'Total Sessions', value: totalSessions.toLocaleString() },
        { label: 'Unique Users', value: Object.keys(data.userStats).length.toString() },
        { label: 'Denial Rate', value: `${denialRate}%` },
        { label: 'Avg Duration', value: formatDuration(avgDuration) },
      ];
      const boxW = (cw - 9) / 4;
      kpis.forEach((kpi, i) => {
        const x = margin + i * (boxW + 3);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(x, y, boxW, 20, 2, 2, 'FD');
        pdf.setFontSize(7);
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'bold');
        pdf.text(kpi.label.toUpperCase(), x + boxW / 2, y + 7, { align: 'center' });
        pdf.setFontSize(16);
        pdf.setTextColor(30, 41, 67);
        pdf.text(kpi.value, x + boxW / 2, y + 16, { align: 'center' });
      });
      y += 28;

      // Summary text
      y = drawSectionTitle('Summary', y);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      const summaryText = `Analysis of license server "${data.metadata.serverName}" identified ${totalSessions.toLocaleString()} successful checkouts across ${Object.keys(data.featureStats).length} features and ${Object.keys(data.userStats).length} users.${totalDenials > 0 ? ` There were ${totalDenials} denied requests (${denialRate}% denial rate).` : ' No license denials were recorded.'}${data.errors.length > 0 ? ` ${data.errors.length} system events require attention.` : ''}`;
      const lines = pdf.splitTextToSize(summaryText, cw);
      pdf.text(lines, margin, y);
      y += lines.length * 4 + 6;

      // Top 10 features mini-table
      y = drawSectionTitle('Top Features by Usage', y);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text('Feature', margin, y);
      pdf.text('Checkouts', margin + 80, y);
      pdf.text('Duration', margin + 105, y);
      pdf.text('Denials', margin + 135, y);
      y += 1;
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y, W - margin, y);
      y += 4;
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 67);
      topFeatures.slice(0, 12).forEach(([name, stats]) => {
        pdf.setTextColor(30, 41, 67);
        pdf.text(name.length > 30 ? name.substring(0, 28) + '...' : name, margin, y);
        pdf.text(stats.checkouts.toString(), margin + 80, y);
        pdf.text(formatDuration(stats.totalDuration), margin + 105, y);
        pdf.setTextColor(stats.denials > 0 ? 239 : 148, stats.denials > 0 ? 68 : 163, stats.denials > 0 ? 68 : 184);
        pdf.text(stats.denials.toString(), margin + 135, y);
        y += 5;
      });

      drawFooter(1, totalPages);

      // === PAGE 2: Full License Inventory ===
      pdf.addPage();
      y = drawHeader('License Inventory');
      y = drawSectionTitle('Feature Inventory & Health', y);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      const cols = [margin, margin + 65, margin + 90, margin + 115, margin + 140];
      pdf.text('LICENSE NAME', cols[0], y);
      pdf.text('CHECKOUTS', cols[1], y);
      pdf.text('USAGE TIME', cols[2], y);
      pdf.text('DENIALS', cols[3], y);
      pdf.text('STATUS', cols[4], y);
      y += 1.5;
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y, W - margin, y);
      y += 4;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      topFeatures.forEach(([name, stats]) => {
        if (y > H - 25) {
          drawFooter(2, totalPages);
          pdf.addPage();
          y = drawHeader('License Inventory (cont.)');
        }
        pdf.setTextColor(30, 41, 67);
        pdf.setFont('helvetica', 'bold');
        pdf.text(name.length > 25 ? name.substring(0, 23) + '...' : name, cols[0], y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(stats.checkouts.toLocaleString(), cols[1], y);
        pdf.text(formatDuration(stats.totalDuration), cols[2], y);
        pdf.setTextColor(stats.denials > 0 ? 239 : 148, stats.denials > 0 ? 68 : 163, stats.denials > 0 ? 68 : 184);
        pdf.text(stats.denials.toString(), cols[3], y);
        // Status badge
        const status = stats.denials > 5 ? 'UNDERSIZED' : stats.checkouts === 0 ? 'IDLE' : 'OK';
        const statusColor = stats.denials > 5 ? [239, 68, 68] : stats.checkouts === 0 ? [148, 163, 184] : [16, 185, 129];
        pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
        pdf.setFont('helvetica', 'bold');
        pdf.text(status, cols[4], y);
        pdf.setFont('helvetica', 'normal');
        y += 5;
      });

      drawFooter(2, totalPages);

      // === PAGE 3: User Analysis ===
      pdf.addPage();
      y = drawHeader('User Analysis');
      y = drawSectionTitle(`Top Users (${topUsers.length} total)`, y);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(100, 116, 139);
      const uCols = [margin, margin + 50, margin + 80, margin + 110, margin + 140];
      pdf.text('USERNAME', uCols[0], y);
      pdf.text('SESSIONS', uCols[1], y);
      pdf.text('TOTAL DURATION', uCols[2], y);
      pdf.text('AVG DURATION', uCols[3], y);
      pdf.text('DENIALS', uCols[4], y);
      y += 1.5;
      pdf.line(margin, y, W - margin, y);
      y += 4;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      topUsers.slice(0, 40).forEach(([name, stats]) => {
        if (y > H - 25) {
          drawFooter(3, totalPages);
          pdf.addPage();
          y = drawHeader('User Analysis (cont.)');
        }
        pdf.setTextColor(30, 41, 67);
        pdf.setFont('helvetica', 'bold');
        pdf.text(name.length > 20 ? name.substring(0, 18) + '...' : name, uCols[0], y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(stats.sessions.toString(), uCols[1], y);
        pdf.text(formatDuration(stats.totalDuration), uCols[2], y);
        pdf.text(formatDuration(stats.totalDuration / (stats.sessions || 1)), uCols[3], y);
        pdf.setTextColor(stats.denials > 0 ? 239 : 148, stats.denials > 0 ? 68 : 163, stats.denials > 0 ? 68 : 184);
        pdf.text(stats.denials.toString(), uCols[4], y);
        y += 5;
      });

      drawFooter(3, totalPages);

      // === PAGE 4: Denial Log (conditional) ===
      if (totalDenials > 0) {
        pdf.addPage();
        y = drawHeader('Denial Log');
        y = drawSectionTitle(`Denial Events (${totalDenials} total)`, y);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        const dCols = [margin, margin + 22, margin + 52, margin + 82, margin + 115];
        pdf.text('TIME', dCols[0], y);
        pdf.text('USER', dCols[1], y);
        pdf.text('HOST', dCols[2], y);
        pdf.text('FEATURE', dCols[3], y);
        pdf.text('REASON', dCols[4], y);
        y += 1.5;
        pdf.line(margin, y, W - margin, y);
        y += 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        data.denials.slice(0, 60).forEach((d) => {
          if (y > H - 25) {
            drawFooter(4, totalPages);
            pdf.addPage();
            y = drawHeader('Denial Log (cont.)');
          }
          pdf.setTextColor(148, 163, 184);
          pdf.text(d.time || '', dCols[0], y);
          pdf.setTextColor(30, 41, 67);
          pdf.setFont('helvetica', 'bold');
          pdf.text((d.user || '').substring(0, 12), dCols[1], y);
          pdf.setFont('helvetica', 'normal');
          pdf.text((d.host || '').substring(0, 12), dCols[2], y);
          pdf.setTextColor(24, 113, 189);
          pdf.text((d.feature || '').substring(0, 14), dCols[3], y);
          pdf.setTextColor(239, 68, 68);
          pdf.text((d.reason || '').substring(0, 25), dCols[4], y);
          y += 4.5;
        });

        drawFooter(4, totalPages);
      }

      pdf.save(`SNL-Executive-Report-${data.metadata.serverName || 'Export'}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed: ' + (err as Error).message);
    } finally {
      setPdfGenerating(false);
    }
  };

  const topFeaturesBySessions = useMemo(() => {
    if (!d) return [];
    return (Object.entries(d.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
      .map(([name, stats]) => ({ name, value: stats.checkouts }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 10);
  }, [d]);

  const topDeniedFeatures = useMemo(() => {
    if (!d) return [];
    return (Object.entries(d.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
      .map(([name, stats]) => ({ name, value: stats.denials }))
      .filter(f => f.value > 0)
      .sort((a,b) => b.value - a.value)
      .slice(0, 10);
  }, [d]);

  const topUsers = useMemo(() => {
    if (!d) return [];
    return (Object.entries(d.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][])
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a,b) => b.sessions - a.sessions)
      .slice(0, 10);
  }, [d]);

  if (!data) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#0c1220] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-300`}>
        <div className="max-w-5xl mx-auto px-6 py-16 md:py-24">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-16">
            <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-10" />
            <span className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-medium">License Analytics Tool</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
            {/* Left: Copy */}
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight leading-[1.1]">
                SNL License<br/><span className="text-[#1871bd]">Parser</span>
              </h1>
              <p className="text-base text-slate-400 mb-8 leading-relaxed max-w-md">
                Drop a FlexLM log file and get instant visibility into license usage, denials, and user patterns. Built for SolidWorks CAD administrators.
              </p>
              
              <div className="flex items-center gap-6 text-[11px] text-slate-600 uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Client-side only</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#1871bd] rounded-full" /> No data uploaded</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#46b6e3] rounded-full" /> PDF export</span>
              </div>
            </div>

            {/* Right: Upload */}
            <div>
              <label className="group relative cursor-pointer block">
                <div className={`
                  border border-dashed p-12 text-center transition-all duration-200
                  ${isDarkMode ? 'border-slate-700 bg-[#111827] hover:border-[#1871bd] hover:bg-[#111827]/80' : 'border-slate-300 bg-white hover:border-[#1871bd]'}
                `}>
                  <Upload size={28} className="text-[#1871bd] mx-auto mb-4 group-hover:translate-y-[-2px] transition-transform" />
                  <span className="text-lg font-semibold block mb-1">Select License Log</span>
                  <p className="text-sm text-slate-500">Drop your <span className="font-mono-brand text-xs text-slate-400">lmgrd.log</span> file here</p>
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
                </div>
                {isParsing && (
                  <div className="absolute inset-0 bg-[#0c1220]/90 flex items-center justify-center flex-col gap-3">
                    <div className="w-8 h-8 border-2 border-[#1871bd] border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-slate-300">Parsing...</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Feature strip */}
          <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800">
            {[
              { icon: ShieldAlert, title: 'Denial Analysis', desc: 'See which engineers are blocked and why.' },
              { icon: Clock, title: 'Usage Analytics', desc: 'Session durations, peak hours, top features.' },
              { icon: FileDown, title: 'PDF Reports', desc: 'Multi-page executive reports, one click.' }
            ].map((f, i) => (
              <div key={i} className="bg-[#0c1220] p-6">
                <div className="flex items-center gap-3 mb-2">
                  <f.icon size={16} className="text-[#1871bd]" />
                  <h3 className="font-semibold text-sm text-white">{f.title}</h3>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#0c1220] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-300 flex overflow-hidden`}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-[#0c1220] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/ellison-logo.png" alt="Ellison" className="h-5" />
          <span className="text-sm font-medium text-slate-400">SNL Parser</span>
        </div>
        <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="p-2 hover:bg-slate-800">
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile Nav Overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/60" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute top-12 left-0 right-0 bg-[#111827] border-b border-slate-800 p-3 space-y-0.5" onClick={e => e.stopPropagation()}>
            {[
              { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
              { id: 'licenses', icon: Activity, label: 'License Inventory' },
              { id: 'users', icon: Users, label: 'User Insights' },
              { id: 'denials', icon: ShieldAlert, label: 'Denial Logs' },
              { id: 'errors', icon: AlertTriangle, label: 'System Errors' },
              { id: 'reports', icon: FileDown, label: 'Exports' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
                  activeTab === item.id 
                    ? 'text-[#1871bd] font-semibold border-l-2 border-[#1871bd] bg-[#1871bd]/5' 
                    : 'text-slate-500 hover:text-slate-300 border-l-2 border-transparent'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
            <div className="border-t border-slate-800 pt-2 mt-2 flex gap-2">
              <button onClick={() => setData(null)} className="flex-1 px-3 py-2 bg-slate-800 text-xs font-medium text-slate-400">Change Log</button>
              <button onClick={() => { downloadMasterPDF(); setMobileNavOpen(false); }} className="flex-1 px-3 py-2 bg-[#1871bd] text-white text-xs font-medium">Export PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-56 border-r border-slate-800 py-6 flex flex-col hidden lg:flex sticky top-0 h-screen bg-[#0c1220] z-20">
        <div className="flex items-center gap-2.5 mb-10 px-5">
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-6" />
          <span className="text-sm font-medium text-slate-400">SNL Parser</span>
        </div>

        <nav className="space-y-0.5 flex-1 px-2">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'licenses', icon: Activity, label: 'Licenses' },
            { id: 'users', icon: Users, label: 'Users' },
            { id: 'denials', icon: ShieldAlert, label: 'Denials' },
            { id: 'errors', icon: AlertTriangle, label: 'Errors' },
            { id: 'reports', icon: FileDown, label: 'Exports' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-[13px] transition-all duration-150 ${
                activeTab === item.id 
                  ? 'text-[#1871bd] font-semibold border-l-2 border-[#1871bd] bg-[#1871bd]/5' 
                  : 'text-slate-500 hover:text-slate-300 border-l-2 border-transparent'
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto px-5 space-y-4">
          <button 
            onClick={() => {
              const root = document.documentElement;
              if (isDarkMode) root.classList.remove('dark');
              else root.classList.add('dark');
              setIsDarkMode(!isDarkMode);
            }}
            className="w-full flex items-center gap-2 text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
          >
            {isDarkMode ? <Sun size={14} /> : <Moon size={14} />}
            {isDarkMode ? 'Light mode' : 'Dark mode'}
          </button>
          
          <div className="border-t border-slate-800 pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-slate-600 uppercase tracking-wider">Server</span>
            </div>
            <div className="space-y-1.5 font-mono-brand text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-600">host</span>
                <span className="text-slate-400 truncate ml-2">{data.metadata.serverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">flex</span>
                <span className="text-slate-400">v{data.metadata.flexVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">port</span>
                <span className="text-slate-400">{data.metadata.port}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 pt-16 lg:p-8 lg:pt-8 max-w-7xl mx-auto w-full overflow-y-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              {activeTab === 'overview' && 'Overview'}
              {activeTab === 'licenses' && 'License Inventory'}
              {activeTab === 'users' && 'User Analytics'}
              {activeTab === 'denials' && 'Denial Intelligence'}
              {activeTab === 'errors' && 'System Events'}
              {activeTab === 'reports' && 'Reports & Exports'}
            </h1>
            <p className="text-xs text-slate-500 font-mono-brand">
              {data.metadata.serverName} · {data.metadata.startDate || 'unknown date'} · {data.entries.length.toLocaleString()} lines parsed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setData(null)}
              className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-white border border-slate-800 hover:border-slate-600 transition-all"
            >
              Change Log
            </button>
            <button 
              onClick={downloadMasterPDF}
              className="px-4 py-2 bg-[#1871bd] hover:bg-[#1565a0] text-white text-xs font-medium transition-all flex items-center gap-2"
            >
              <Printer size={14} /> Export PDF
            </button>
          </div>
        </header>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-slate-800/50">
          <Filter size={14} className="text-slate-600" />
          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="bg-[#111827] border border-slate-800 text-xs text-slate-300 px-3 py-1.5 focus:border-[#1871bd] focus:outline-none min-w-[160px]"
          >
            <option value="">All Users</option>
            {allUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select
            value={filterFeature}
            onChange={e => setFilterFeature(e.target.value)}
            className="bg-[#111827] border border-slate-800 text-xs text-slate-300 px-3 py-1.5 focus:border-[#1871bd] focus:outline-none min-w-[200px]"
          >
            <option value="">All Features</option>
            {allFeatures.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          {(filterUser || filterFeature) && (
            <button
              onClick={() => { setFilterUser(''); setFilterFeature(''); }}
              className="text-[11px] text-slate-500 hover:text-white px-2 py-1 border border-slate-800 hover:border-slate-600 transition-all flex items-center gap-1"
            >
              <X size={12} /> Clear filters
            </button>
          )}
          {(filterUser || filterFeature) && d && (
            <span className="text-[11px] text-slate-600 ml-auto">
              Showing {d.sessions.length.toLocaleString()} sessions · {d.denials.length} denials
              {filterUser && <> · user: <span className="text-[#46b6e3]">{filterUser}</span></>}
              {filterFeature && <> · feature: <span className="text-[#46b6e3]">{filterFeature}</span></>}
            </span>
          )}
        </div>

        <div id="capture-area" ref={reportRef} className="pb-20 space-y-8">
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-800">
                <StatCard title="Sessions" value={d!.sessions.length.toLocaleString()} icon={Clock} color={COLORS.brandMid} />
                <StatCard title="Users" value={Object.keys(d!.userStats).length} icon={Users} color={COLORS.brandBlue} />
                <StatCard title="Denials" value={d!.denials.length} icon={ShieldAlert} color={COLORS.error} />
                <StatCard title="Avg Duration" value={formatDuration(d!.sessions.reduce((acc, s) => acc + (s.duration || 0), 0) / (d!.sessions.length || 1))} icon={Activity} color={COLORS.success} />
              </div>

              <ExecutiveSummary data={d!} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-800">
                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
                    <Activity size={16} className="text-[#1871bd]" /> Checkout Trend
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d!.timeSeriesUsage}>
                        <defs>
                          <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.brandMid} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={COLORS.brandMid} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="count" stroke={COLORS.brandMid} fillOpacity={1} fill="url(#colorUsage)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
                    <LayoutDashboard size={16} className="text-[#46b6e3]" /> Demand by Feature
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={topFeaturesBySessions}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke="#475569" fontSize={10} width={100} tickLine={false} axisLine={false} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                          contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <Bar dataKey="value" fill={COLORS.brandMid} radius={[0, 3, 3, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Concurrent Usage + Peak Hours */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-800">
                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-1 text-slate-300">Peak Concurrent Licenses</h3>
                  <p className="text-[11px] text-slate-500 mb-4">Maximum simultaneous checkouts per day</p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={d!.concurrentUsage}>
                        <defs>
                          <linearGradient id="colorConcurrent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }} />
                        <Area type="stepAfter" dataKey="concurrent" stroke="#f59e0b" fillOpacity={1} fill="url(#colorConcurrent)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-1 text-slate-300">Checkout Activity by Hour</h3>
                  <p className="text-[11px] text-slate-500 mb-4">When are licenses being checked out?</p>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d!.peakHours}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                        <XAxis dataKey="hour" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(h: number) => `${h}:00`} />
                        <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }} labelFormatter={(h: number) => `${h}:00`} />
                        <Bar dataKey="count" fill="#46b6e3" radius={[2, 2, 0, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Session Duration Distribution */}
              <div className="bg-[#111827] p-6 border border-slate-800">
                <h3 className="text-sm font-semibold mb-1 text-slate-300">Session Duration Distribution</h3>
                <p className="text-[11px] text-slate-500 mb-4">How long are licenses typically held?</p>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d!.durationDistribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }} />
                      <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {activeTab === 'licenses' && (
            <div className="space-y-10">
               <div className="bg-[#111827] border border-slate-800 overflow-hidden">
                <div className="p-8 border-b border-slate-800 bg-[#0c1220]">
                  <h3 className="text-lg font-bold">Feature Inventory & Health</h3>
                  <p className="text-slate-500 text-sm mt-1">Detailed utilization breakdown across all detected SolidWorks features.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#0c1220]">
                      <tr>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">License Name</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Checkouts</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Usage Time</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Denials</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {(Object.entries(d!.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][]).map(([name, stats]) => (
                        <tr key={name} className="hover:bg-[#1a2332] transition-colors">
                          <td className="px-5 py-3 font-bold text-sm">{name}</td>
                          <td className="px-5 py-3 text-sm">{stats.checkouts.toLocaleString()}</td>
                          <td className="px-5 py-3 text-sm">{formatDuration(stats.totalDuration)}</td>
                          <td className={`px-5 py-3 text-sm font-black ${stats.denials > 0 ? 'text-red-500' : 'text-slate-400'}`}>{stats.denials}</td>
                          <td className="px-5 py-3">
                            <span className={`px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                              stats.denials > 5 ? 'bg-red-500/10 text-red-500' : 
                              stats.checkouts === 0 ? 'bg-slate-500/10 text-slate-400' : 'bg-green-500/10 text-green-500'
                            }`}>
                              {stats.denials > 5 ? 'Undersized' : stats.checkouts === 0 ? 'Idle Asset' : 'Optimized'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Denial Ratio + Feature Co-usage */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-800">
                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-1 text-slate-300">Denial-to-Checkout Ratio</h3>
                  <p className="text-[11px] text-slate-500 mb-4">Which features are most constrained?</p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={d!.denialRatioByFeature.filter(f => f.ratio > 0).slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
                        <XAxis type="number" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} />
                        <YAxis dataKey="name" type="category" stroke="#475569" fontSize={9} width={100} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e2943', border: '1px solid #334155', borderRadius: '4px', fontSize: '12px' }} formatter={(v: number) => [`${v}%`, 'Denial Rate']} />
                        <Bar dataKey="ratio" fill="#ef4444" radius={[0, 3, 3, 0]} barSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#111827] p-6">
                  <h3 className="text-sm font-semibold mb-1 text-slate-300">Feature Co-usage</h3>
                  <p className="text-[11px] text-slate-500 mb-4">Features commonly used by the same users</p>
                  <div className="space-y-2">
                    {d!.featureCoUsage.slice(0, 8).map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                        <span className="text-xs text-slate-300 font-medium truncate mr-4">{item.pair}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-20 h-1.5 bg-slate-800 overflow-hidden">
                            <div className="h-full bg-[#46b6e3]" style={{ width: `${Math.min(100, (item.count / (d!.featureCoUsage[0]?.count || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono-brand w-8 text-right">{item.count}</span>
                        </div>
                      </div>
                    ))}
                    {d!.featureCoUsage.length === 0 && <p className="text-xs text-slate-500">No co-usage patterns detected</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                 <div className="lg:col-span-2 bg-[#111827] border border-slate-800 overflow-hidden">
                    <div className="p-8 border-b border-slate-800 flex justify-between items-center">
                      <h3 className="text-lg font-bold">Consumption by User</h3>
                      <div className="relative w-64">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Filter names..." className="w-full pl-12 pr-6 py-3 bg-[#0c1220] rounded-lg text-xs outline-none focus:ring-2 ring-[#1871bd]" />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-[#0c1220]">
                          <tr>
                            <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Username</th>
                            <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Total Sessions</th>
                            <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Avg Duration</th>
                            <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Denials</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {(Object.entries(d!.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][]).sort((a,b) => b[1].sessions - a[1].sessions).map(([name, stats]) => (
                            <tr key={name} className="hover:bg-[#1a2332]">
                              <td className="px-5 py-3 text-sm font-black flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                {name}
                              </td>
                              <td className="px-5 py-3 text-sm">{stats.sessions}</td>
                              <td className="px-5 py-3 text-sm font-medium">{formatDuration(stats.totalDuration / (stats.sessions || 1))}</td>
                              <td className="px-5 py-3 text-sm font-black text-red-500/80">{stats.denials}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
                 <div className="bg-[#111827] p-10 border border-slate-800 flex flex-col">
                    <h3 className="text-sm font-semibold mb-8">Top Power Users</h3>
                    <div className="h-64 w-full mb-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={topUsers}
                            dataKey="sessions"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={8}
                          >
                            {topUsers.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} stroke="transparent" />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: isDarkMode ? '#1e2943' : '#fff', border: 'none', borderRadius: '15px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                      {topUsers.slice(0, 5).map((user, i) => (
                        <div key={user.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.chart[i % COLORS.chart.length] }}></div>
                            <span className="font-bold">{user.name}</span>
                          </div>
                          <span className="text-slate-500 font-black">{user.sessions} Sessions</span>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>

              {/* Host/Machine Analysis */}
              <div className="bg-[#111827] border border-slate-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800 bg-[#0c1220]">
                  <h3 className="text-sm font-semibold text-slate-300">Host / Machine Analysis</h3>
                  <p className="text-[11px] text-slate-500">License consumption by workstation</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#0c1220]">
                      <tr>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Host</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Sessions</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Total Duration</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Unique Users</th>
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {Object.entries(d!.hostStats)
                        .sort((a, b) => b[1].sessions - a[1].sessions)
                        .slice(0, 20)
                        .map(([host, stats]) => (
                        <tr key={host} className="hover:bg-[#1a2332]">
                          <td className="px-5 py-3 text-sm font-semibold font-mono-brand text-xs">{host}</td>
                          <td className="px-5 py-3 text-sm">{stats.sessions}</td>
                          <td className="px-5 py-3 text-sm">{formatDuration(stats.totalDuration)}</td>
                          <td className="px-5 py-3 text-sm">{stats.users.size}</td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${stats.users.size > 1 ? 'text-amber-400' : 'text-slate-500'}`}>
                              {stats.users.size > 1 ? 'Shared' : 'Individual'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Activity Timeline (simplified - top 15 users, session blocks) */}
              <div className="bg-[#111827] border border-slate-800 p-6">
                <h3 className="text-sm font-semibold mb-1 text-slate-300">User Activity Timeline</h3>
                <p className="text-[11px] text-slate-500 mb-4">Session patterns for top users (most recent 7 days)</p>
                <div className="space-y-1.5 overflow-x-auto">
                  {(() => {
                    const topUserNames = Object.entries(d!.userStats)
                      .sort((a, b) => b[1].sessions - a[1].sessions)
                      .slice(0, 15)
                      .map(([name]) => name);
                    
                    // Find time range
                    const allTimes = d!.sessions.filter(s => s.end).map(s => [s.start.getTime(), s.end!.getTime()]).flat();
                    if (allTimes.length === 0) return <p className="text-xs text-slate-500">No session data available</p>;
                    const maxTime = Math.max(...allTimes);
                    const minTime = maxTime - 7 * 24 * 60 * 60 * 1000; // last 7 days
                    const range = maxTime - minTime;

                    return topUserNames.map(userName => {
                      const userSessions = d!.sessions.filter(s => s.user === userName && s.end && s.start.getTime() >= minTime);
                      return (
                        <div key={userName} className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-500 w-24 truncate shrink-0 font-mono-brand">{userName}</span>
                          <div className="flex-1 h-4 bg-[#0c1220] relative min-w-[400px]">
                            {userSessions.map((s, i) => {
                              const left = ((s.start.getTime() - minTime) / range) * 100;
                              const width = Math.max(0.3, ((s.end!.getTime() - s.start.getTime()) / range) * 100);
                              return (
                                <div
                                  key={i}
                                  className="absolute top-0.5 h-3 bg-[#1871bd] opacity-70 hover:opacity-100 transition-opacity"
                                  style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(width, 100 - left)}%` }}
                                  title={`${s.feature} · ${formatDuration(s.duration || 0)}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-600">
                  <span>7 days ago</span>
                  <span>Most recent</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'denials' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-[#111827] p-10 border border-slate-800">
                  <h3 className="text-sm font-semibold mb-8 flex items-center gap-3">
                    <ShieldAlert size={24} className="text-red-500" /> Denial Heatmap (Daily)
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d!.denialsByDay}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="time" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1e2943' : '#fff', border: 'none', borderRadius: '15px' }} />
                        <Bar dataKey="count" fill={COLORS.error} radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-[#111827] p-10 border border-slate-800">
                  <h3 className="text-sm font-semibold mb-8">Most Common Denial Reasons</h3>
                  <div className="space-y-6">
                    {Array.from(new Set(d!.denials.map(d => d.reason))).slice(0, 5).map(reason => {
                      const count = d!.denials.filter(d => d.reason === reason).length;
                      const percentage = Math.round((count / (d!.denials.length || 1)) * 100);
                      return (
                        <div key={reason} className="group">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{reason}</p>
                            <span className="text-xs font-black text-red-500">{count} Events</span>
                          </div>
                          <div className="w-full h-3 bg-slate-800 overflow-hidden">
                            <div 
                              className="h-full bg-red-500 transition-all duration-1000 group-hover:bg-red-400" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 overflow-hidden">
                <div className="p-8 border-b border-slate-800">
                  <h3 className="text-lg font-bold">Denial Audit Trail</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-[#0c1220]">
                      <tr>
                        <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Timestamp</th>
                        <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">User</th>
                        <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Requested Feature</th>
                        <th className="px-5 py-3 text-xs font-black uppercase text-slate-500">Reason / Return Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {d!.denials.slice(0, 50).map((d, i) => (
                        <tr key={i} className="hover:bg-[#1a2332] transition-colors">
                          <td className="px-5 py-3 text-xs font-medium text-slate-400 font-mono">{d.time}</td>
                          <td className="px-5 py-3 text-sm font-bold">{d.user}</td>
                          <td className="px-5 py-3 text-sm font-medium text-blue-500">{d.feature}</td>
                          <td className="px-5 py-3 text-sm text-red-500 font-bold">{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'errors' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-[#111827] p-10 border border-slate-800">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Fatal Errors</p>
                  <p className="text-3xl font-bold font-mono-brand text-red-500">{d!.errors.filter(e => e.type === 'ERROR').length}</p>
                </div>
                <div className="bg-[#111827] p-10 border border-slate-800">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Unsupported Features</p>
                  <p className="text-3xl font-bold font-mono-brand text-amber-500">{d!.errors.filter(e => e.type === 'UNSUPPORTED').length}</p>
                </div>
                <div className="bg-[#111827] p-10 border border-slate-800">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Analyzed Lines</p>
                  <p className="text-3xl font-bold font-mono-brand text-blue-500">{d!.entries.length.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 overflow-hidden">
                <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-[#0c1220]">
                  <h3 className="text-sm font-semibold">System Event Trace</h3>
                  <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl text-[10px] font-black uppercase">Debug View</div>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-[11px] bg-[#0c1220]">
                  {d!.errors.map((err, i) => (
                    <div key={i} className="py-2.5 px-6 flex gap-6 hover:bg-[#1a2332] rounded-lg group transition-all">
                      <span className="text-slate-400 whitespace-nowrap">{err.time}</span>
                      <span className={`font-black ${err.type === 'ERROR' ? 'text-red-500' : 'text-amber-500'}`}>[{err.type}]</span>
                      <span className="text-slate-600 dark:text-slate-300 break-all">{err.raw}</span>
                    </div>
                  ))}
                  {d!.errors.length === 0 && (
                    <div className="py-20 text-center text-slate-400 font-sans">
                      <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-green-500" />
                      </div>
                      <p className="text-lg font-bold text-slate-700 dark:text-slate-300">No Critical Faults Detected</p>
                      <p className="text-sm mt-1">Your SNL environment appears healthy based on current logs.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-[#111827] p-10 border border-slate-800 ">
                  <div className="p-6 bg-[#1871bd]/10 w-fit mb-8 ">
                    <FileDown size={48} className="text-[#1871bd]" />
                  </div>
                  <h3 className="text-lg font-bold mb-4">Executive Performance Report</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Compiles all high-level metrics, usage charts, and system health alerts into a professional multi-page PDF document suitable for IT management and procurement stakeholders.
                  </p>
                  <button 
                    onClick={downloadMasterPDF}
                    className="w-full py-5 bg-[#1871bd] hover:bg-blue-700 text-white font-black rounded-xl  transition-all flex items-center justify-center gap-4 text-lg"
                  >
                    <Printer size={22} /> Generate Executive PDF
                  </button>
                </div>
                <div className="bg-[#111827] p-10 border border-slate-800 flex flex-col">
                  <div className="p-6 bg-purple-900/20 w-fit mb-8">
                    <Database size={48} className="text-purple-600" />
                  </div>
                  <h3 className="text-lg font-bold mb-4">Raw Data Insights (CSV)</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Need further custom analysis? Export the structured dataset for PowerBI, Excel, or internal auditing tools.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-auto">
                    <button className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      Session Table
                    </button>
                    <button className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      User Statistics
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#1e2943] border border-slate-800 p-6 relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 p-10 opacity-10 rotate-12">
                   <Server size={300} className="text-white" />
                </div>
                <div className="flex gap-8 items-start relative z-10">
                  <div className="p-5 bg-blue-500/20 rounded-lg border border-blue-500/40">
                    <Info className="text-blue-300" size={32} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white mb-2 tracking-tight">Optimization Recommendation</h4>
                    <p className="text-blue-100/70 max-w-2xl leading-relaxed font-medium">
                      {(() => {
                        const dr = data ? ((d!.denials.length / ((d!.sessions.length + d!.denials.length) || 1)) * 100) : 0;
                        const longSessions = data ? d!.sessions.filter(s => (s.duration || 0) > 480).length : 0;
                        const longPct = data ? Math.round((longSessions / (d!.sessions.length || 1)) * 100) : 0;
                        if (dr > 10) return <>Your denial rate is <strong>{dr.toFixed(1)}%</strong> — consider adding seats for your most-denied features to reduce engineer downtime.</>;
                        if (dr > 5) return <>Denial rate of <strong>{dr.toFixed(1)}%</strong> detected. Review seat counts for frequently denied features and consider implementing timeout policies for idle sessions.</>;
                        if (longPct > 20) return <><strong>{longPct}%</strong> of sessions exceed 8 hours. Consider implementing idle timeout rules to free licenses for other users.</>;
                        return <>License utilization appears healthy. Continue monitoring for seasonal trends and review seat counts at renewal time.</>;
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hidden multi-page report for PDF export */}
      {/* PDF generated via jsPDF native API — no hidden report div needed */}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
