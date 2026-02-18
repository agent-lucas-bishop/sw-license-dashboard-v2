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
  ChevronRight, Printer, FileDown, Info, Server, Cpu, Layers
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
  usageByFeature: Record<string, number>;
  userStats: Record<string, { sessions: number, totalDuration: number, denials: number }>;
  featureStats: Record<string, { checkouts: number, denials: number, totalDuration: number }>;
  timeSeriesUsage: { time: string, count: number }[];
  denialsByDay: { time: string, count: number }[];
  errors: LogEntry[];
}

// --- Utils ---
const formatDuration = (mins: number) => {
  if (isNaN(mins) || mins === 0) return '0m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${hrs}h ${m}m`;
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
    const timeMatch = line.match(/^\s*(\d{1,2}:\d{2}:\d{2})\s+\(([\w\s.-]+)\)\s+(.*)$/);
    if (!timeMatch) return;

    const [_, time, daemon, message] = timeMatch;
    let entry: LogEntry = { time, daemon, type: 'INFO', raw: line };

    if (message.includes('TIMESTAMP')) {
      const dateMatch = message.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) currentDate = dateMatch[1];
      entry.type = 'TIMESTAMP';
    }

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

    entry.date = currentDate;

    if (message.includes('OUT:')) {
      entry.type = 'OUT';
      const parts = message.match(/OUT:\s+"?([^"\s]+)"?\s+(\S+)@(\S+)/);
      if (parts) {
        entry.feature = parts[1];
        entry.user = parts[2];
        entry.host = parts[3];
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

  const userStats: Record<string, any> = {};
  const featureStats: Record<string, any> = {};
  const timeSeries: Record<string, number> = {};
  const denialsByDay: Record<string, number> = {};

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

  const denials = entries.filter(e => e.type === 'DENIED');
  denials.forEach(d => {
    if (d.user && !userStats[d.user]) userStats[d.user] = { sessions: 0, totalDuration: 0, denials: 0 };
    if (d.user) userStats[d.user].denials++;
    if (d.feature && !featureStats[d.feature]) featureStats[d.feature] = { checkouts: 0, denials: 0, totalDuration: 0 };
    if (d.feature) featureStats[d.feature].denials++;
    const dateKey = d.date || 'Unknown';
    denialsByDay[dateKey] = (denialsByDay[dateKey] || 0) + 1;
  });

  return {
    metadata: { serverName, flexVersion, port, vendorPort, pid, logPath, startDate: currentDate },
    entries,
    sessions,
    denials,
    usageByFeature: featureStats,
    userStats,
    featureStats,
    timeSeriesUsage: Object.entries(timeSeries).map(([time, count]) => ({ time, count })).sort((a,b) => a.time.localeCompare(b.time)),
    denialsByDay: Object.entries(denialsByDay).map(([time, count]) => ({ time, count })).sort((a,b) => a.time.localeCompare(b.time)),
    errors: entries.filter(e => e.type === 'ERROR' || e.type === 'UNSUPPORTED')
  };
};

// --- Components ---

const StatCard = ({ title, value, icon: Icon, trend, color, reportMode = false }: any) => (
  <div className={`p-6 rounded-2xl border ${reportMode ? 'bg-slate-50 border-slate-200' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'} shadow-sm transition-all`}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-opacity-10`} style={{ backgroundColor: color + '20' }}>
        <Icon size={24} style={{ color }} />
      </div>
      {trend && !reportMode && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div>
      <h3 className={`text-sm font-semibold uppercase tracking-wider ${reportMode ? 'text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>{title}</h3>
      <p className={`text-3xl font-bold mt-1 ${reportMode ? 'text-slate-900' : 'text-slate-900 dark:text-white'}`}>{value}</p>
    </div>
  </div>
);

const ExecutiveSummaryContent = ({ data, reportMode = false }: { data: DashboardData, reportMode?: boolean }) => {
  const topApp = Object.entries(data.featureStats).sort((a,b) => b[1].checkouts - a[1].checkouts)[0];
  const topDenied = Object.entries(data.featureStats).sort((a,b) => b[1].denials - a[1].denials)[0];
  const totalSessions = data.sessions.length;
  const totalDenials = data.denials.length;
  const totalCheckoutsAttempted = totalSessions + totalDenials;
  const denialRate = totalCheckoutsAttempted > 0 ? ((totalDenials / totalCheckoutsAttempted) * 100).toFixed(1) : '0';

  return (
    <div className={`p-8 rounded-xl ${reportMode ? 'bg-slate-50 border border-slate-200 text-slate-900' : 'bg-gradient-to-br from-[#1e2943] to-[#1871bd] text-white shadow-sm'}`}>
      <h2 className={`text-2xl font-bold mb-4 flex items-center gap-2 ${reportMode ? 'text-[#1871bd]' : 'text-white'}`}>
        <Info size={24} /> Executive Summary
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <p className={`text-lg leading-relaxed ${reportMode ? 'text-slate-600' : 'text-slate-200'}`}>
            Log analysis for <span className={`font-semibold ${reportMode ? 'text-slate-900' : 'text-white'}`}>{data.metadata.serverName}</span> complete. 
            We've identified <span className={`font-semibold ${reportMode ? 'text-slate-900' : 'text-white'}`}>{totalSessions.toLocaleString()}</span> successful sessions. 
            The feature <span className={`font-semibold ${reportMode ? 'text-slate-900' : 'text-white'}`}>"{topApp?.[0] || 'N/A'}"</span> dominates usage.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <div className={`px-4 py-2 rounded-xl border ${reportMode ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
              <p className={`text-[10px] uppercase font-bold ${reportMode ? 'text-slate-400' : 'text-slate-300'}`}>Health Status</p>
              <p className="text-xl font-bold text-green-500">Stable</p>
            </div>
            <div className={`px-4 py-2 rounded-xl border ${reportMode ? 'bg-white border-slate-200' : 'bg-white/10 border-white/20'}`}>
              <p className={`text-[10px] uppercase font-bold ${reportMode ? 'text-slate-400' : 'text-slate-300'}`}>Denial Rate</p>
              <p className={`text-xl font-bold ${Number(denialRate) > 5 ? 'text-red-500' : 'text-green-500'}`}>{denialRate}%</p>
            </div>
          </div>
        </div>
        <div className={`p-6 rounded-2xl border ${reportMode ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10 backdrop-blur-md'}`}>
          <h4 className={`font-semibold mb-3 flex items-center gap-2 uppercase tracking-widest text-xs ${reportMode ? 'text-[#1871bd]' : 'text-blue-300'}`}>
            <ShieldAlert size={14} /> Key Insights & Alerts
          </h4>
          <ul className={`space-y-3 text-sm ${reportMode ? 'text-slate-600' : 'text-slate-200'}`}>
            {totalDenials > 20 && (
              <li className="flex gap-2 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                <span><strong>License Scarcity:</strong> Frequent denials for "{topDenied?.[0]}". Suggest additional seat procurement.</span>
              </li>
            )}
            {totalSessions < 10 && (
              <li className="flex gap-2 items-start">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span><strong>Inventory Bloat:</strong> Low license utilization detected. Review maintenance contracts.</span>
              </li>
            )}
            <li className="flex gap-2 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
              <span><strong>FlexLM Ready:</strong> Operating on Port {data.metadata.port} (v{data.metadata.flexVersion}).</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// --- PDF REPORT TEMPLATE ---
const ReportPageFooter = ({ serverName, pageNum }: { serverName: string; pageNum: number }) => (
  <div className="absolute bottom-10 left-16 right-16 flex justify-between text-[10px] font-bold text-slate-300 uppercase tracking-widest border-t border-slate-100 pt-4">
    <span>Ellison Technologies — {serverName} License Audit</span>
    <span>Page {String(pageNum).padStart(2, '0')}</span>
  </div>
);

const ReportPageHeader = ({ serverName }: { serverName: string }) => (
  <div className="flex justify-between items-center mb-12">
    <div className="flex items-center gap-4">
      <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-8" />
      <div className="w-px h-8 bg-slate-200" />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1e2943]">SNL License Audit</h1>
        <p className="text-slate-400 font-semibold uppercase tracking-widest text-[10px]">{serverName}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-slate-400 font-semibold text-[10px] uppercase">Generated</p>
      <p className="font-semibold text-sm text-slate-600">{new Date().toLocaleDateString()}</p>
    </div>
  </div>
);

const MasterReport = ({ data }: { data: DashboardData }) => {
  const topUsers = Object.entries(data.userStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a,b) => b.sessions - a.sessions)
    .slice(0, 15);

  const topFeatures = (Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
    .map(([name, stats]) => ({ name, value: stats.checkouts }))
    .sort((a,b) => b.value - a.value)
    .slice(0, 10);

  const totalSessions = data.sessions.length;
  const totalDenials = data.denials.length;
  const denialRate = (totalSessions + totalDenials) > 0 ? ((totalDenials / (totalSessions + totalDenials)) * 100).toFixed(1) : '0';
  const avgDuration = formatDuration(data.sessions.reduce((a, s) => a + (s.duration || 0), 0) / (totalSessions || 1));

  return (
    <div className="p-0 bg-white text-slate-900 w-[1000px] overflow-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Page 1: Cover + Executive Summary */}
      <div id="report-page-1" className="p-16 h-[1414px] flex flex-col relative">
        {/* Cover header */}
        <div className="flex items-center gap-6 mb-16">
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-10" />
          <div className="w-px h-10 bg-slate-200" />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#1e2943]">SNL License Audit</h1>
            <p className="text-slate-400 font-semibold uppercase tracking-widest text-xs mt-1">Executive Performance Report — {data.metadata.serverName}</p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-4 mb-10">
          {[
            { label: 'Total Sessions', val: totalSessions.toLocaleString(), color: '#1871bd' },
            { label: 'Active Users', val: String(Object.keys(data.userStats).length), color: '#46b6e3' },
            { label: 'License Denials', val: String(totalDenials), color: '#ef4444' },
            { label: 'Denial Rate', val: denialRate + '%', color: Number(denialRate) > 5 ? '#ef4444' : '#10b981' },
            { label: 'Avg Duration', val: avgDuration, color: '#10b981' },
          ].map(kpi => (
            <div key={kpi.label} className="p-4 rounded-lg border border-slate-100 bg-slate-50">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">{kpi.label}</p>
              <p className="text-2xl font-extrabold" style={{ color: kpi.color }}>{kpi.val}</p>
            </div>
          ))}
        </div>

        <ExecutiveSummaryContent data={data} reportMode />

        {/* Usage trend */}
        <div className="mt-10 flex-1">
          <h3 className="text-lg font-extrabold mb-6 text-[#1e2943]">Utilization Trend</h3>
          <div className="h-[340px] w-full bg-slate-50 p-6 rounded-lg border border-slate-100">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.timeSeriesUsage}>
                <defs>
                  <linearGradient id="colorUsageReport" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.brandMid} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={COLORS.brandMid} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
                <Area type="monotone" dataKey="count" stroke={COLORS.brandMid} fillOpacity={1} fill="url(#colorUsageReport)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <ReportPageFooter serverName={data.metadata.serverName} pageNum={1} />
      </div>

      {/* Page 2: License Inventory */}
      <div id="report-page-2" className="p-16 h-[1414px] flex flex-col relative border-t border-slate-100">
        <ReportPageHeader serverName={data.metadata.serverName} />
        <h2 className="text-2xl font-extrabold mb-8 text-[#1e2943]">License Inventory</h2>
        <div className="flex-1 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-[#1871bd]">
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Feature</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Checkouts</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Total Duration</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Avg Duration</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Denials</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
                .sort((a, b) => b[1].checkouts - a[1].checkouts)
                .slice(0, 22).map(([name, stats]) => (
                <tr key={name}>
                  <td className="px-4 py-3 text-sm font-semibold">{name}</td>
                  <td className="px-4 py-3 text-sm text-right">{stats.checkouts}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{formatDuration(stats.totalDuration)}</td>
                  <td className="px-4 py-3 text-sm text-right text-slate-500">{formatDuration(stats.totalDuration / (stats.checkouts || 1))}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${stats.denials > 0 ? 'text-red-500' : 'text-slate-300'}`}>{stats.denials}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${
                      stats.denials > 5 ? 'bg-red-50 text-red-500' : stats.checkouts === 0 ? 'bg-slate-50 text-slate-400' : 'bg-green-50 text-green-600'
                    }`}>{stats.denials > 5 ? 'Undersized' : stats.checkouts === 0 ? 'Idle' : 'OK'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8">
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
            <h4 className="text-xs font-bold mb-4 uppercase text-[#1871bd]">Top Features by Checkouts</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFeatures}>
                  <Bar dataKey="value" fill={COLORS.brandMid} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
            <h4 className="text-xs font-bold mb-4 uppercase text-[#1871bd]">User Session Distribution</h4>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={topUsers.slice(0, 8)} dataKey="sessions" cx="50%" cy="50%" innerRadius={35} outerRadius={65}>
                    {topUsers.slice(0, 8).map((e,i) => <Cell key={i} fill={COLORS.chart[i % COLORS.chart.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <ReportPageFooter serverName={data.metadata.serverName} pageNum={2} />
      </div>

      {/* Page 3: User Analysis */}
      <div id="report-page-3" className="p-16 h-[1414px] flex flex-col relative border-t border-slate-100">
        <ReportPageHeader serverName={data.metadata.serverName} />
        <h2 className="text-2xl font-extrabold mb-8 text-[#1e2943]">User Analysis</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b-2 border-[#1871bd]">
              <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">User</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Sessions</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Total Duration</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Avg Duration</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500 text-right">Denials</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.entries(data.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][])
              .sort((a,b) => b[1].sessions - a[1].sessions)
              .slice(0, 30).map(([name, stats]) => (
              <tr key={name}>
                <td className="px-4 py-2.5 text-sm font-semibold">{name}</td>
                <td className="px-4 py-2.5 text-sm text-right">{stats.sessions}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-500">{formatDuration(stats.totalDuration)}</td>
                <td className="px-4 py-2.5 text-sm text-right text-slate-500">{formatDuration(stats.totalDuration / (stats.sessions || 1))}</td>
                <td className={`px-4 py-2.5 text-sm text-right font-bold ${stats.denials > 0 ? 'text-red-500' : 'text-slate-300'}`}>{stats.denials}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ReportPageFooter serverName={data.metadata.serverName} pageNum={3} />
      </div>

      {/* Page 4: Denial Log */}
      {data.denials.length > 0 && (
        <div id="report-page-4" className="p-16 h-[1414px] flex flex-col relative border-t border-slate-100">
          <ReportPageHeader serverName={data.metadata.serverName} />
          <h2 className="text-2xl font-extrabold mb-4 text-[#1e2943]">Denial Log</h2>
          <p className="text-sm text-slate-500 mb-6">{data.denials.length} total denial events recorded</p>
          <div className="flex-1 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-red-400">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Time</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">User</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Host</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Feature</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase text-slate-500">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.denials.slice(0, 35).map((d, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-xs font-mono text-slate-400">{d.time}</td>
                    <td className="px-4 py-2 text-xs font-semibold">{d.user}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{d.host}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-[#1871bd]">{d.feature}</td>
                    <td className="px-4 py-2 text-xs text-red-500">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.denials.length > 35 && (
              <p className="mt-4 text-xs text-slate-400 italic">Showing 35 of {data.denials.length} denial events.</p>
            )}
          </div>
          <ReportPageFooter serverName={data.metadata.serverName} pageNum={4} />
        </div>
      )}
    </div>
  );
};

export function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isParsing, setIsParsing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  const reportRef = useRef<HTMLDivElement>(null);
  const masterReportRef = useRef<HTMLDivElement>(null);

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

  const downloadMasterPDF = async () => {
    if (!data) return;
    setIsGeneratingPDF(true);
    
    // Give time for hidden report div to render properly if needed
    await new Promise(r => setTimeout(r, 500));

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pages = ['report-page-1', 'report-page-2', 'report-page-3', 'report-page-4'];
    
    let firstPage = true;
    for (const pageId of pages) {
      const el = document.getElementById(pageId);
      if (el) {
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        if (!firstPage) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        firstPage = false;
      }
    }
    
    pdf.save(`SNL-Executive-Master-Report-${data.metadata.serverName}.pdf`);
    setIsGeneratingPDF(false);
  };

  const downloadCurrentPagePDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { 
      scale: 2, 
      backgroundColor: isDarkMode ? '#0f172a' : '#f8fafc' 
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`SNL-Report-${activeTab}-${data?.metadata.serverName || 'Export'}.pdf`);
  };

  const topFeaturesBySessions = useMemo(() => {
    if (!data) return [];
    return (Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
      .map(([name, stats]) => ({ name, value: stats.checkouts }))
      .sort((a,b) => b.value - a.value)
      .slice(0, 10);
  }, [data]);

  const topDeniedFeatures = useMemo(() => {
    if (!data) return [];
    return (Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][])
      .map(([name, stats]) => ({ name, value: stats.denials }))
      .filter(f => f.value > 0)
      .sort((a,b) => b.value - a.value)
      .slice(0, 10);
  }, [data]);

  const topUsers = useMemo(() => {
    if (!data) return [];
    return (Object.entries(data.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][])
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a,b) => b.sessions - a.sessions)
      .slice(0, 10);
  }, [data]);

  if (!data) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${isDarkMode ? 'dark bg-[#0f172a] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-300`}>
        <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-12 mb-6" />
          <h1 className="text-5xl font-extrabold mb-4 tracking-tight">
            SNL <span className="text-[#1871bd]">License Parser</span>
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 mb-12 max-w-2xl font-medium">
            Professional dashboard for SolidWorks CAD Administrators. Visualize licensing health, track denials, and optimize your software spend instantly.
          </p>
          <label className="group relative cursor-pointer w-full max-w-lg">
            <div className={`
              border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300
              ${isDarkMode ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-[#1871bd]' : 'border-slate-300 bg-white hover:border-[#1871bd] shadow-lg'}
            `}>
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Upload size={32} className="text-[#1871bd]" />
              </div>
              <span className="text-2xl font-bold block mb-2">Select License Log</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">Drag & drop your <strong>lmgrd.log</strong> here</p>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
            </div>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#0f172a] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-300 flex overflow-hidden`}>
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-200 dark:border-slate-800 p-8 flex flex-col hidden lg:flex sticky top-0 h-screen bg-white dark:bg-[#0f172a] z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-8" />
        </div>

        <nav className="space-y-2 flex-1">
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
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-200 ${
                activeTab === item.id 
                  ? 'bg-[#1871bd] text-white shadow-sm font-bold scale-[1.02]' 
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-medium'
              }`}
            >
              <item.icon size={20} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-6">
          <button 
            onClick={() => {
              const root = document.documentElement;
              if (isDarkMode) root.classList.remove('dark');
              else root.classList.add('dark');
              setIsDarkMode(!isDarkMode);
            }}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-bold text-sm">{isDarkMode ? 'Switch to Light' : 'Switch to Dark'}</span>
          </button>
          <div className="p-5 rounded-xl bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
              <Server size={12} /> {data.metadata.serverName}
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-tighter">FlexLM v{data.metadata.flexVersion}</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 max-w-7xl mx-auto w-full overflow-y-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-2">
              {activeTab === 'overview' && 'Dashboard Overview'}
              {activeTab === 'licenses' && 'License Utilization'}
              {activeTab === 'users' && 'User Analytics'}
              {activeTab === 'denials' && 'Denial Intelligence'}
              {activeTab === 'errors' && 'System Events'}
              {activeTab === 'reports' && 'Reports & Exports'}
            </h1>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Clock size={16} />
              <p className="text-sm font-medium">Log coverage starts from {data.metadata.startDate || 'Unknown Date'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setData(null)}
              className="px-6 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold border border-slate-200 dark:border-slate-700"
            >
              Change Log
            </button>
            <button 
              onClick={downloadCurrentPagePDF}
              className="px-6 py-3 rounded-2xl bg-[#1871bd] hover:bg-blue-700 text-white text-sm font-bold shadow-sm flex items-center gap-3 transition-all"
            >
              <Printer size={18} /> Print View
            </button>
          </div>
        </header>

        <div id="capture-area" ref={reportRef} className="pb-20 space-y-12">
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <StatCard title="Total Sessions" value={data.sessions.length.toLocaleString()} icon={Clock} color={COLORS.brandMid} />
                <StatCard title="Unique Users" value={Object.keys(data.userStats).length} icon={Users} color={COLORS.brandBlue} />
                <StatCard title="Denied Requests" value={data.denials.length} icon={ShieldAlert} color={COLORS.error} />
                <StatCard title="Avg Use Duration" value={formatDuration(data.sessions.reduce((acc, s) => acc + (s.duration || 0), 0) / (data.sessions.length || 1))} icon={Activity} color={COLORS.success} />
              </div>
              <ExecutiveSummaryContent data={data} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Activity size={24} className="text-[#1871bd]" /> Checkout Trend
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.timeSeriesUsage}>
                        <defs>
                          <linearGradient id="colorUsageMain" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.brandMid} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={COLORS.brandMid} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="time" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                        <Area type="monotone" dataKey="count" stroke={COLORS.brandMid} fillOpacity={1} fill="url(#colorUsageMain)" strokeWidth={4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <LayoutDashboard size={24} className="text-[#46b6e3]" /> Demand by Feature
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={topFeaturesBySessions}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} width={100} tickLine={false} axisLine={false} />
                        <Bar dataKey="value" fill={COLORS.brandMid} radius={[0, 10, 10, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'licenses' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
              <div className="p-8 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-2xl font-black">License Inventory Health</h3>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 dark:bg-slate-900/30 text-slate-500 text-xs uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-8 py-5">Feature</th>
                    <th className="px-8 py-5 text-center">Checkouts</th>
                    <th className="px-8 py-5 text-center">Avg Duration</th>
                    <th className="px-8 py-5 text-center">Denials</th>
                    <th className="px-8 py-5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {(Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][]).map(([name, stats]) => (
                    <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-8 py-6 font-bold text-sm">{name}</td>
                      <td className="px-8 py-6 text-sm text-center">{stats.checkouts.toLocaleString()}</td>
                      <td className="px-8 py-6 text-sm text-center font-medium text-slate-400">{formatDuration(stats.totalDuration / (stats.checkouts || 1))}</td>
                      <td className={`px-8 py-6 text-sm text-center font-black ${stats.denials > 0 ? 'text-red-500' : 'text-slate-400'}`}>{stats.denials}</td>
                      <td className="px-8 py-6 text-right">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          stats.denials > 5 ? 'bg-red-500/10 text-red-500' : 
                          stats.checkouts === 0 ? 'bg-slate-500/10 text-slate-400' : 'bg-green-500/10 text-green-500'
                        }`}>
                          {stats.denials > 5 ? 'Undersized' : stats.checkouts === 0 ? 'Idle' : 'Optimized'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'users' && (
             <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
              <div className="p-8 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-2xl font-black">User Consumption Analysis</h3>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 dark:bg-slate-900/30 text-slate-500 text-xs uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-8 py-5">User ID</th>
                    <th className="px-8 py-5 text-center">Sessions</th>
                    <th className="px-8 py-5 text-center">Avg Duration</th>
                    <th className="px-8 py-5 text-right">Denials</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {(Object.entries(data.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][]).sort((a,b) => b[1].sessions - a[1].sessions).map(([name, stats]) => (
                    <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="px-8 py-6 text-sm font-black flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                          {name.charAt(0).toUpperCase()}
                        </div>
                        {name}
                      </td>
                      <td className="px-8 py-6 text-sm text-center">{stats.sessions}</td>
                      <td className="px-8 py-6 text-sm font-medium text-center">{formatDuration(stats.totalDuration / (stats.sessions || 1))}</td>
                      <td className="px-8 py-6 text-sm font-black text-red-500/80 text-right">{stats.denials}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'denials' && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
              <div className="p-8 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-2xl font-black">Denial Audit Trail</h3>
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-100/50 dark:bg-slate-900/30 text-slate-500 text-xs uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-8 py-5">Timestamp</th>
                    <th className="px-8 py-5">User</th>
                    <th className="px-8 py-5">Feature</th>
                    <th className="px-8 py-5 text-right">Return Code / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {data.denials.map((d, i) => (
                    <tr key={i} className="hover:bg-red-50/20 dark:hover:bg-red-900/10">
                      <td className="px-8 py-5 text-xs font-medium text-slate-400 font-mono">{d.time}</td>
                      <td className="px-8 py-5 text-sm font-bold">{d.user}</td>
                      <td className="px-8 py-5 text-sm font-bold text-[#1871bd]">{d.feature}</td>
                      <td className="px-8 py-5 text-sm text-red-500 font-black text-right">{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'errors' && (
             <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
                <div className="p-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <h3 className="text-xl font-black">System Event Trace</h3>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-[11px] bg-slate-50 dark:bg-slate-900/50">
                  {data.errors.map((err, i) => (
                    <div key={i} className="py-2.5 px-6 flex gap-6 hover:bg-slate-200 dark:hover:bg-slate-800/60 rounded-2xl group transition-all">
                      <span className="text-slate-400 whitespace-nowrap">{err.time}</span>
                      <span className={`font-black ${err.type === 'ERROR' ? 'text-red-500' : 'text-amber-500'}`}>[{err.type}]</span>
                      <span className="text-slate-600 dark:text-slate-300 break-all">{err.raw}</span>
                    </div>
                  ))}
                </div>
              </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md group transition-all">
                  <div className="p-6 bg-blue-100 dark:bg-blue-900/30 rounded-xl w-fit mb-8 group-hover:rotate-3 transition-transform">
                    <Layers size={48} className="text-[#1871bd]" />
                  </div>
                  <h3 className="text-2xl font-black mb-4">Master Executive Audit</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Compiles a multi-page, professional PDF including all key dashboard metrics, charts, inventory tables, and user insights. Cleanlight theme optimized for printing.
                  </p>
                  <button 
                    onClick={downloadMasterPDF}
                    disabled={isGeneratingPDF}
                    className="w-full py-5 bg-[#1871bd] hover:bg-blue-700 disabled:bg-slate-400 text-white font-black rounded-xl shadow-sm transition-all flex items-center justify-center gap-4 text-lg"
                  >
                    {isGeneratingPDF ? (
                       <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <FileDown size={22} /> {isGeneratingPDF ? 'Generating...' : 'Download Master PDF'}
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md">
                  <div className="p-6 bg-purple-100 dark:bg-purple-900/30 rounded-xl w-fit mb-8">
                    <Database size={48} className="text-purple-600" />
                  </div>
                  <h3 className="text-2xl font-black mb-4">Quick PDF Summary</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Need a fast one-pager? Export the current view as a high-resolution PDF for immediate sharing or quick reference.
                  </p>
                  <button 
                    onClick={downloadCurrentPagePDF}
                    className="w-full py-5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[#1e2943] dark:text-white font-black rounded-xl transition-all flex items-center justify-center gap-4 text-lg border border-slate-200 dark:border-slate-600"
                  >
                    <Printer size={22} /> Export Current Page
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hidden Master Report Container for PDF Capture */}
      <div className="fixed top-0 left-[-2000px]">
         <div ref={masterReportRef}>
            <MasterReport data={data} />
         </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
