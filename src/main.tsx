
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
  ChevronRight, Printer, FileDown, Info, Server, Cpu, Menu, X, Settings, Copy, Plus, Trash2, HelpCircle, DollarSign, TrendingDown, TrendingUp
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

// --- SNL Feature Name Reference (from Dassault S-068783) ---
const SNL_FEATURES: Record<string, string> = {
  solidworks: 'SOLIDWORKS Standard',
  swoffice: 'SOLIDWORKS Office (Legacy)',
  swofficepro: 'SOLIDWORKS Professional',
  swofficepremium: 'SOLIDWORKS Premium',
  swofficepremium_cwadvpro: 'SOLIDWORKS Premium w/ Simulation Premium',
  swofficepremium_cwpro: 'SOLIDWORKS Premium w/ Simulation Professional',
  catiatoswtrans: 'CATIA V5-SW Translator (Legacy)',
  edrw: 'eDrawings Professional',
  cae_cwstd: 'Simulation Standard',
  cae_cwpro: 'Simulation Professional',
  cae_cwadvpro: 'Simulation Premium',
  cae_cosmosfloworkspe: 'Flow Simulation',
  cae_cosmosfloworks_hvac: 'Flow Simulation HVAC',
  cae_cosmosfloworks_elec: 'Flow Simulation Electronic Cooling',
  swsustainability: 'Sustainability',
  plastics_pro: 'Plastics Standard',
  plastics_premium: 'Plastics Professional',
  plastics_advanced: 'Plastics Premium',
  cae_cosmosmotion: 'Motion',
  swepdm_cadeditorandweb: 'PDM Professional CAD Editor & Web',
  swepdm_contributorandweb: 'PDM Professional Contributor & Web',
  swepdm_processor: 'PDM Professional Processor',
  swepdm_viewer: 'PDM Professional Viewer',
  swpdmstd_cadeditor: 'PDM Standard CAD Editor',
  swpdmstd_contributor: 'PDM Standard Contributor',
  swpdmstd_viewer: 'PDM Standard Viewer',
  swmanagepro_contributor: 'Manage Professional Contributor',
  swmanagepro_editor: 'Manage Professional Editor',
  swmanagepro_processor: 'Manage Professional Processor',
  swmanagepro_viewer: 'Manage Professional Viewer',
  elec2d: 'Electrical Schematic Professional',
  elec3d: 'Electrical 3D',
  elecpro: 'Electrical Professional',
  pcbpro: 'PCB',
  pcbaltium: 'PCB Connector for Altium',
  swcomposer: 'Composer',
  swcomposer_check: 'Composer Check',
  swcomposer_playerpro: 'Composer Player Pro',
  swcomposer_sync: 'Composer Sync',
  swcomposer_syncenterprise: 'Composer Enterprise Sync',
  swinspection_pro: 'Inspection Professional',
  swinspection_std: 'Inspection Standard',
  swmbd_std: 'MBD Standard',
  visustd: 'Visualize Standard',
  visupro: 'Visualize Professional',
  visuboost: 'Visualize Boost',
  draftsightpremium: 'DraftSight Enterprise',
  camstd: 'CAM Standard',
  campro: 'CAM Professional',
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

// --- Demo Log Generator ---
const generateDemoLog = (): string => {
  const features = ['solidworks', 'swpremium', 'swsimulation', 'swepdm_cadeditorandweb', 'swepdm_viewer', 'swinspection_std'];
  const featureSeats: Record<string, number> = { solidworks: 5, swpremium: 3, swsimulation: 1, swepdm_cadeditorandweb: 8, swepdm_viewer: 25, swinspection_std: 6 };
  const users = ['mthompson', 'jchen', 'agarcia', 'bwilson', 'kpatel', 'rjohnson', 'lnguyen', 'dsmith', 'cmartinez', 'ekim', 'twright', 'pbrown'];
  const hosts = ['ENG-WS01', 'ENG-WS02', 'ENG-WS03', 'DESIGN-PC1', 'DESIGN-PC2', 'LAB-WS01', 'MFG-PC01', 'MFG-PC02', 'REMOTE-01', 'REMOTE-02', 'QA-WS01', 'ADMIN-PC1'];
  const lines: string[] = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const fmt = (d: Date) => `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}/${d.getFullYear()}`;
  const fmtTime = (d: Date) => `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;

  // Server startup
  lines.push(`${fmtTime(startDate)} (lmgrd) -----------------------------------------------`);
  lines.push(`${fmtTime(startDate)} (lmgrd) Please Note:`);
  lines.push(`${fmtTime(startDate)} (lmgrd) FLEXnet Licensing (v11.18.2.0 build 232202) started on SNLSERVER01 (${fmt(startDate)})`);
  lines.push(`${fmtTime(startDate)} (lmgrd) Copyright (c) 1988-2024 Flexera Software LLC. All Rights Reserved.`);
  lines.push(`${fmtTime(startDate)} (lmgrd) US Patents 5,390,297 and 5,671,412.`);
  lines.push(`${fmtTime(startDate)} (lmgrd) World Wide Web: http://www.flexerasoftware.com`);
  lines.push(`${fmtTime(startDate)} (lmgrd) License file(s): C:\\Program Files (x86)\\SOLIDWORKS Corp\\SolidNetWork License Manager\\licenses\\sw_d.lic`);
  lines.push(`${fmtTime(startDate)} (lmgrd) lmgrd tcp-port 25734`);
  lines.push(`${fmtTime(startDate)} (lmgrd) Starting vendor daemons ...`);
  lines.push(`${fmtTime(startDate)} (lmgrd) Started SW_D (internet tcp_port 25735 pid 4521)`);
  lines.push(`${fmtTime(startDate)} (lmgrd) SW_D using TCP-port 25735`);
  lines.push(`${fmtTime(startDate)} (SW_D) Server started on SNLSERVER01 for: ${features.join(' ')}`);
  lines.push(`${fmtTime(startDate)} (SW_D) EXTERNAL FILTERS are OFF`);
  lines.push(`${fmtTime(startDate)} (SW_D) SLOG: SNLSERVER01 is alive`);
  lines.push(`${fmtTime(startDate)} (lmgrd) SNLSERVER01's Server nodeid is AABBCCDD1122`);

  // Generate 30 days of activity
  const rng = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = <T,>(arr: T[]): T => arr[rng(0, arr.length - 1)];
  const activeSessions: { user: string, host: string, feature: string, start: Date }[] = [];

  for (let day = 0; day < 30; day++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + day);
    lines.push(`${fmtTime(d)} (SW_D) TIMESTAMP ${fmt(d)}`);

    // Weekdays get 15-30 events, weekends 2-5
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const eventCount = isWeekend ? rng(2, 5) : rng(15, 30);

    for (let ev = 0; ev < eventCount; ev++) {
      const hour = isWeekend ? rng(9, 17) : rng(6, 20);
      const min = rng(0, 59);
      const sec = rng(0, 59);
      const t = new Date(d); t.setHours(hour, min, sec);
      const time = fmtTime(t);
      const user = pick(users);
      const host = pick(hosts);
      const feature = pick(features);

      // Check if we should check in an existing session
      const existingIdx = activeSessions.findIndex(s => s.user === user && s.feature === feature);
      if (existingIdx >= 0 && Math.random() < 0.6) {
        const s = activeSessions[existingIdx];
        lines.push(`${time} (SW_D) IN: "${s.feature}" ${s.user}@${s.host}`);
        activeSessions.splice(existingIdx, 1);
        continue;
      }

      // Count current checkouts for this feature
      const currentOut = activeSessions.filter(s => s.feature === feature).length;
      const seats = featureSeats[feature] || 5;

      if (currentOut >= seats) {
        // Denial
        lines.push(`${time} (SW_D) DENIED: "${feature}" ${user}@${host} (Licensed number of users already reached. (-4,342:10054 ""))`);
      } else {
        // Checkout
        lines.push(`${time} (SW_D) OUT: "${feature}" ${user}@${host}`);
        activeSessions.push({ user, host, feature, start: t });
      }
    }

    // End of day: check in most sessions
    activeSessions.forEach((s, i) => {
      if (Math.random() < 0.8) {
        const t = new Date(d); t.setHours(rng(17, 22), rng(0, 59), rng(0, 59));
        lines.push(`${fmtTime(t)} (SW_D) IN: "${s.feature}" ${s.user}@${s.host}`);
        activeSessions.splice(i, 1);
      }
    });
  }

  // Some errors sprinkled in
  const errDate = new Date(startDate); errDate.setDate(errDate.getDate() + 12);
  lines.push(`${fmtTime(errDate)} (SW_D) Error getting ethernet address: Cannot find an available ethernet adapter.`);
  const errDate2 = new Date(startDate); errDate2.setDate(errDate2.getDate() + 20);
  lines.push(`${fmtTime(errDate2)} (lmgrd) SW_D reported server error: -15,570`);

  return lines.join('\n');
};

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
    if (daemon.toLowerCase() === 'lmgrd' && (message.includes('Server\'s nodeid') || message.includes('Server nodeid'))) {
      const hMatch = line.match(/^\s*[\d:]+\s+(\S+)\s+\(lmgrd\)/) || message.match(/^(\S+)'s Server nodeid/);
      if (hMatch) serverName = hMatch[1];
    }
    if (serverName === 'Unknown' && message.includes('started on') && daemon.toLowerCase() === 'lmgrd') {
      const sMatch = message.match(/started on (\S+)/);
      if (sMatch) serverName = sMatch[1];
    }
    if (serverName === 'Unknown' && message.includes('Server started on')) {
      const sMatch = message.match(/Server started on (\S+)/);
      if (sMatch) serverName = sMatch[1];
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
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [filterFeatures, setFilterFeatures] = useState<string[]>([]);
  
  // Options file builder state
  const [optTimeoutEnabled, setOptTimeoutEnabled] = useState(false);
  const [optTimeout, setOptTimeout] = useState(3600);
  const [optFeatureTimeouts, setOptFeatureTimeouts] = useState<{ feature: string, seconds: number }[]>([]);
  const [optGroups, setOptGroups] = useState<{ name: string, users: string[] }[]>([]);
  const [optRules, setOptRules] = useState<{ type: 'MAX' | 'RESERVE' | 'INCLUDE' | 'EXCLUDE' | 'INCLUDE_BORROW' | 'EXCLUDE_BORROW', count: number, feature: string, groupOrUser: string, targetType: 'GROUP' | 'USER' | 'HOST' | 'INTERNET', versionFilter: string }[]>([]);
  const [customUsers, setCustomUsers] = useState<string[]>([]);
  const [licenseCosts, setLicenseCosts] = useState<Record<string, number>>({});
  const [licenseSeats, setLicenseSeats] = useState<Record<string, number>>({});
  const [optCopied, setOptCopied] = useState(false);
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
    if (filterUsers.length === 0 && filterFeatures.length === 0) return data;

    const filteredSessions = data.sessions.filter(s => 
      (filterUsers.length === 0 || filterUsers.includes(s.user)) && 
      (filterFeatures.length === 0 || filterFeatures.includes(s.feature))
    );
    const filteredDenials = data.denials.filter(d => 
      (filterUsers.length === 0 || (d.user && filterUsers.includes(d.user))) && 
      (filterFeatures.length === 0 || (d.feature && filterFeatures.includes(d.feature)))
    );
    const filteredErrors = data.errors.filter(e =>
      (filterFeatures.length === 0 || (e.feature && filterFeatures.includes(e.feature)))
    );
    const analytics = computeAnalytics(filteredSessions, filteredDenials);

    return {
      ...data,
      sessions: filteredSessions,
      denials: filteredDenials,
      errors: filteredErrors,
      ...analytics,
    };
  }, [data, filterUsers, filterFeatures]);

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
              <button
                onClick={() => { setIsParsing(true); setTimeout(() => { setData(parseLogFile(generateDemoLog())); setLicenseSeats({ solidworks: 5, swpremium: 3, swsimulation: 1, swepdm_cadeditorandweb: 8, swepdm_viewer: 25, swinspection_std: 6 }); setLicenseCosts({ solidworks: 1800, swpremium: 2400, swsimulation: 3600, swepdm_cadeditorandweb: 1200, swepdm_viewer: 450, swinspection_std: 1500 }); setIsParsing(false); }, 300); }}
                className="mt-3 w-full py-2.5 border border-slate-700 text-xs text-slate-500 hover:text-[#46b6e3] hover:border-[#1871bd]/50 transition-colors"
              >
                No log file handy? <span className="text-[#1871bd]">Try with sample data →</span>
              </button>
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
              { id: 'reports', icon: FileDown, label: 'Exports' },
            { id: 'cost', icon: DollarSign, label: 'Cost & Right-Sizing' },
            { id: 'options', icon: Settings, label: 'Options File' }
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
            { id: 'reports', icon: FileDown, label: 'Exports' },
            { id: 'cost', icon: DollarSign, label: 'Cost & Right-Sizing' },
            { id: 'options', icon: Settings, label: 'Options File' }
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
              {activeTab === 'cost' && 'Cost Analysis & Right-Sizing'}
              {activeTab === 'options' && 'Options File Builder'}
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
        <div className="mb-6 pb-4 border-b border-slate-800/50">
          <div className="flex flex-wrap items-center gap-3">
            <Filter size={14} className="text-slate-600 shrink-0" />
            <div className="relative group">
              <select
                value=""
                onChange={e => { if (e.target.value && !filterUsers.includes(e.target.value)) setFilterUsers([...filterUsers, e.target.value]); e.target.value = ''; }}
                className="bg-[#111827] border border-slate-800 text-xs text-slate-400 px-3 py-1.5 focus:border-[#1871bd] focus:outline-none min-w-[140px] cursor-pointer"
              >
                <option value="">+ Add user</option>
                {allUsers.filter(u => !filterUsers.includes(u)).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="relative group">
              <select
                value=""
                onChange={e => { if (e.target.value && !filterFeatures.includes(e.target.value)) setFilterFeatures([...filterFeatures, e.target.value]); e.target.value = ''; }}
                className="bg-[#111827] border border-slate-800 text-xs text-slate-400 px-3 py-1.5 focus:border-[#1871bd] focus:outline-none min-w-[160px] cursor-pointer"
              >
                <option value="">+ Add feature</option>
                {allFeatures.filter(f => !filterFeatures.includes(f)).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            {(filterUsers.length > 0 || filterFeatures.length > 0) && (
              <button
                onClick={() => { setFilterUsers([]); setFilterFeatures([]); }}
                className="text-[11px] text-slate-500 hover:text-white px-2 py-1 border border-slate-800 hover:border-slate-600 transition-all flex items-center gap-1"
              >
                <X size={12} /> Clear all
              </button>
            )}
            {(filterUsers.length > 0 || filterFeatures.length > 0) && d && (
              <span className="text-[11px] text-slate-600 ml-auto">
                {d.sessions.length.toLocaleString()} sessions · {d.denials.length} denials
              </span>
            )}
          </div>
          {/* Active filter chips */}
          {(filterUsers.length > 0 || filterFeatures.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-2 ml-7">
              {filterUsers.map(u => (
                <button key={u} onClick={() => setFilterUsers(filterUsers.filter(x => x !== u))} className="flex items-center gap-1 px-2 py-0.5 bg-[#1871bd]/10 border border-[#1871bd]/30 text-[#46b6e3] text-[11px] hover:bg-[#1871bd]/20 transition-colors">
                  <Users size={10} /> {u} <X size={10} className="opacity-50 hover:opacity-100" />
                </button>
              ))}
              {filterFeatures.map(f => (
                <button key={f} onClick={() => setFilterFeatures(filterFeatures.filter(x => x !== f))} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] hover:bg-emerald-500/20 transition-colors">
                  <Activity size={10} /> {f} <X size={10} className="opacity-50 hover:opacity-100" />
                </button>
              ))}
            </div>
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
                    <button onClick={() => {
                      if (!d) return;
                      const rows = [['User','Host','Feature','Start','End','Duration (min)'].join(','),
                        ...d.sessions.map(s => [s.user, s.host, s.feature, s.start.toISOString(), s.end?.toISOString() || '', Math.round(s.duration || 0)].join(','))];
                      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sessions.csv'; a.click();
                    }} className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      Session Table
                    </button>
                    <button onClick={() => {
                      if (!d) return;
                      const rows = [['User','Sessions','Total Hours','Avg Session (min)','Denials'].join(','),
                        ...Object.entries(d.userStats).map(([u, s]) => [u, s.sessions, (s.totalDuration / 60).toFixed(1), s.sessions > 0 ? Math.round(s.totalDuration / s.sessions) : 0, s.denials].join(','))];
                      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'user-statistics.csv'; a.click();
                    }} className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      User Statistics
                    </button>
                    <button onClick={() => {
                      if (!d) return;
                      const rows = [['Feature','Checkouts','Denials','Denial Rate %','Total Hours'].join(','),
                        ...Object.entries(d.featureStats).map(([f, s]) => [f, s.checkouts, s.denials, s.checkouts > 0 ? ((s.denials / (s.checkouts + s.denials)) * 100).toFixed(1) : '0', (s.totalDuration / 60).toFixed(1)].join(','))];
                      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'feature-statistics.csv'; a.click();
                    }} className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      Feature Stats
                    </button>
                    <button onClick={() => {
                      if (!d) return;
                      const rows = [['Timestamp','Feature','User','Host','Reason'].join(','),
                        ...d.denials.map(e => [e.time, e.feature || '', e.user || '', e.host || '', (e.reason || '').replace(/,/g, ';')].join(','))];
                      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'denials.csv'; a.click();
                    }} className="py-4 bg-slate-800 hover:bg-slate-700 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      Denial Log
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

          {activeTab === 'cost' && d && (() => {
            const features = Object.keys(d.featureStats);
            const logDays = d.sessions.length > 0 ? Math.max(1, Math.round((new Date(d.sessions[d.sessions.length - 1]?.start).getTime() - new Date(d.sessions[0]?.start).getTime()) / 86400000)) : 1;

            return (
              <div className="space-y-6 overflow-x-hidden">
                {/* Intro */}
                <div className="border-l-2 border-[#1871bd] bg-[#111827] px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-300 mb-1">Enter your seat counts and costs to find savings opportunities.</p>
                      <p className="text-[10px] text-slate-600">All calculations are based on {logDays} days of log data. Without seat counts, we can only show peak concurrent usage — not whether you're over-provisioned.</p>
                    </div>
                    <label className="shrink-0 cursor-pointer px-3 py-2 border border-dashed border-[#1871bd]/50 text-[11px] text-[#1871bd] hover:text-[#46b6e3] hover:border-[#46b6e3]/50 transition-colors flex items-center gap-1.5">
                      <Upload size={14} /> Import sw_d.lic
                      <input type="file" accept="*/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          const text = reader.result as string;
                          // Parse INCREMENT lines for seat counts: INCREMENT feature SW_D ... count ...
                          const lines = text.split('\n');
                          const seats: Record<string, number> = {};
                          lines.forEach(line => {
                            const m = line.match(/^INCREMENT\s+(\S+)\s+\S+\s+\S+\s+\S+\s+(\d+)/i);
                            if (m) seats[m[1].toLowerCase()] = parseInt(m[2]);
                          });
                          if (Object.keys(seats).length > 0) {
                            const mapped: Record<string, number> = {};
                            features.forEach(f => { if (seats[f.toLowerCase()]) mapped[f] = seats[f.toLowerCase()]; });
                            setLicenseSeats(prev => ({ ...prev, ...mapped }));
                          }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }} />
                    </label>
                  </div>
                </div>

                {/* Seat counts + costs */}
                <div className="border border-slate-800 bg-[#111827] p-5">
                  <h3 className="text-xs font-semibold text-slate-400 mb-3">License Configuration</h3>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="grid grid-cols-[1fr_80px_100px] gap-2 text-[10px] text-slate-600 uppercase tracking-wider pb-1 border-b border-slate-800/50">
                      <span>Feature</span>
                      <span>Total Seats</span>
                      <span>Annual $/Seat</span>
                    </div>
                    {features.map(f => (
                      <div key={f} className="grid grid-cols-[1fr_80px_100px] gap-2 items-center">
                        <span className="text-[11px] text-[#46b6e3] font-mono-brand truncate">{SNL_FEATURES[f.toLowerCase()] || f}</span>
                        <input type="number" value={licenseSeats[f] || ''} placeholder="?"
                          onChange={e => setLicenseSeats({ ...licenseSeats, [f]: Number(e.target.value) })}
                          className="bg-[#0c1220] border border-slate-800 text-white text-[11px] px-2 py-1 font-mono-brand focus:border-[#1871bd] focus:outline-none placeholder:text-slate-700" />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-600">$</span>
                          <input type="number" value={licenseCosts[f] || ''} placeholder="0"
                            onChange={e => setLicenseCosts({ ...licenseCosts, [f]: Number(e.target.value) })}
                            className="bg-[#0c1220] border border-slate-800 text-white text-[11px] px-2 py-1 w-full font-mono-brand focus:border-[#1871bd] focus:outline-none placeholder:text-slate-700" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-3">💡 Import your <span className="font-mono-brand">sw_d.lic</span> file to auto-fill seat counts from INCREMENT lines. Costs must be entered manually.</p>
                </div>

                {/* Right-Sizing Panel */}
                <div className="border border-slate-800 bg-[#111827] p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-1 flex items-center gap-2"><TrendingDown size={14} className="text-[#46b6e3]" /> Right-Sizing Recommendations</h3>
                  <p className="text-[10px] text-slate-600 mb-4">Based on peak concurrent usage vs total seats available.</p>
                  <div className="space-y-3">
                    {features.map(f => {
                      const stats = d.featureStats[f];
                      const peakConcurrent = d.concurrentUsage.reduce((max, c) => {
                        // We approximate per-feature peak from sessions
                        return max;
                      }, 0);
                      // Calculate actual per-feature peak concurrent from sessions
                      const featureSessions = d.sessions.filter(s => s.feature === f);
                      const events: { time: number, delta: number }[] = [];
                      featureSessions.forEach(s => {
                        events.push({ time: s.start.getTime(), delta: 1 });
                        if (s.end) events.push({ time: s.end.getTime(), delta: -1 });
                      });
                      events.sort((a, b) => a.time - b.time);
                      let concurrent = 0, featurePeak = 0;
                      events.forEach(e => { concurrent += e.delta; featurePeak = Math.max(featurePeak, concurrent); });

                      const totalSeats = licenseSeats[f] || 0;
                      const denials = stats.denials;
                      const checkouts = stats.checkouts;
                      const denialRate = checkouts + denials > 0 ? (denials / (checkouts + denials)) * 100 : 0;
                      const cost = licenseCosts[f] || 0;
                      const avgDaily = featureSessions.length / logDays;
                      const hasSeats = totalSeats > 0;
                      const unusedSeats = hasSeats ? totalSeats - featurePeak : 0;
                      const utilizationPct = hasSeats ? (featurePeak / totalSeats) * 100 : 0;

                      // Calculate concurrent distribution for this feature
                      // Sample concurrent usage at each event point, collect all values
                      const concurrentSamples: number[] = [];
                      let running = 0;
                      events.forEach(e => { running += e.delta; concurrentSamples.push(running); });
                      concurrentSamples.sort((a, b) => a - b);
                      const p50 = concurrentSamples[Math.floor(concurrentSamples.length * 0.5)] || 0;
                      const p90 = concurrentSamples[Math.floor(concurrentSamples.length * 0.9)] || 0;
                      const p95 = concurrentSamples[Math.floor(concurrentSamples.length * 0.95)] || 0;
                      const peakVsTypicalGap = featurePeak > 0 ? ((featurePeak - p90) / featurePeak) * 100 : 0;
                      
                      // Utilization categories
                      // Over-utilized: denials happened AND current seat count still can't cover peak
                      const isOverUtilized = denialRate > 3 && (!hasSeats || featurePeak >= totalSeats);
                      const isAtCapacity = !isOverUtilized && hasSeats && featurePeak >= totalSeats * 0.9 && totalSeats > 0;
                      // Over-provisioned: has seat data, peak never comes close to total
                      const isOverProvisioned = !isOverUtilized && !isAtCapacity && hasSeats && unusedSeats >= 2 && utilizationPct < 75;
                      // Under-utilized pattern (no seat data): peak is way above typical usage
                      const isUnderUtilized = !isOverUtilized && !isAtCapacity && !isOverProvisioned && featurePeak >= 3 && p90 <= Math.ceil(featurePeak * 0.4) && denialRate === 0;
                      
                      return (
                        <div key={f} className={`p-4 border ${isOverUtilized ? 'border-red-500/40 bg-red-500/5' : isAtCapacity ? 'border-orange-500/40 bg-orange-500/5' : (isUnderUtilized || isOverProvisioned) ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/30 bg-[#0c1220]'}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <span className="font-mono-brand text-[#46b6e3] text-xs">{SNL_FEATURES[f.toLowerCase()] || f}</span>
                            {isOverUtilized && <span className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 font-semibold flex items-center gap-1"><TrendingUp size={10} /> Needs More Seats</span>}
                            {!isOverUtilized && isAtCapacity && <span className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 font-semibold flex items-center gap-1"><AlertTriangle size={10} /> At Capacity</span>}
                            {!isOverUtilized && !isAtCapacity && (isUnderUtilized || isOverProvisioned) && <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1"><TrendingDown size={10} /> Potential Savings</span>}
                            {!isOverUtilized && !isAtCapacity && !isUnderUtilized && !isOverProvisioned && hasSeats && <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Right-Sized</span>}
                            {!isOverUtilized && !isAtCapacity && !isUnderUtilized && !isOverProvisioned && !hasSeats && <span className="text-[10px] px-2 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/20">Needs Seat Count</span>}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[11px]">
                            {hasSeats && (
                              <div>
                                <p className="text-slate-600 text-[10px]">Total seats</p>
                                <p className="text-white font-mono-brand">{totalSeats}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-slate-600 text-[10px]">Peak concurrent</p>
                              <p className="text-white font-mono-brand">{featurePeak}</p>
                            </div>
                            <div>
                              <p className="text-slate-600 text-[10px]">Typical (90th %ile)</p>
                              <p className="text-white font-mono-brand">{p90}</p>
                            </div>
                            <div>
                              <p className="text-slate-600 text-[10px]">Median</p>
                              <p className="text-white font-mono-brand">{p50}</p>
                            </div>
                            <div>
                              <p className="text-slate-600 text-[10px]">Denial rate</p>
                              <p className={`font-mono-brand ${denialRate > 3 ? 'text-red-400' : 'text-white'}`}>{denialRate.toFixed(1)}%</p>
                            </div>
                            {hasSeats && (
                              <div>
                                <p className="text-slate-600 text-[10px]">Utilization</p>
                                <p className={`font-mono-brand ${utilizationPct > 90 ? 'text-red-400' : utilizationPct < 50 ? 'text-amber-400' : 'text-white'}`}>{utilizationPct.toFixed(0)}%</p>
                              </div>
                            )}
                          </div>
                          {/* Visual bar: typical vs peak vs seats */}
                          {featurePeak > 0 && (
                            <div className="mt-3 h-2 bg-[#0c1220] border border-slate-800 relative overflow-hidden">
                              {hasSeats && <div className="absolute inset-0 bg-slate-800/30" style={{ width: '100%' }} />}
                              <div className="absolute inset-y-0 left-0 bg-[#1871bd]/40" style={{ width: `${hasSeats ? (p90 / totalSeats) * 100 : (p90 / featurePeak) * 100}%` }} />
                              <div className="absolute inset-y-0 left-0 bg-[#1871bd]" style={{ width: `${hasSeats ? (featurePeak / totalSeats) * 100 : 100}%`, opacity: 0.3 }} />
                              <div className="absolute inset-y-0 left-0 bg-[#46b6e3]" style={{ width: `${hasSeats ? (p50 / totalSeats) * 100 : (p50 / featurePeak) * 100}%` }} />
                            </div>
                          )}
                          {featurePeak > 0 && (
                            <div className="flex gap-4 mt-1 text-[9px] text-slate-600">
                              <span><span className="inline-block w-2 h-1.5 bg-[#46b6e3] mr-1" />Median</span>
                              <span><span className="inline-block w-2 h-1.5 bg-[#1871bd]/40 mr-1" />Typical</span>
                              <span><span className="inline-block w-2 h-1.5 bg-[#1871bd]/30 mr-1" />Peak</span>
                              {hasSeats && <span><span className="inline-block w-2 h-1.5 bg-slate-800/30 mr-1 border border-slate-700" />Total seats</span>}
                            </div>
                          )}

                          {/* Cost impact — over-utilization gets more visual weight */}
                          {(cost > 0 || isOverUtilized || isUnderUtilized || isOverProvisioned || isAtCapacity || !hasSeats) && (
                            <div className={`mt-3 pt-3 border-t ${isOverUtilized ? 'border-red-500/30' : isAtCapacity ? 'border-orange-500/30' : (isUnderUtilized || isOverProvisioned) ? 'border-amber-500/30' : 'border-slate-800/50'}`}>
                              {isAtCapacity && !isOverUtilized && (
                                <div className="bg-orange-500/10 border border-orange-500/20 p-3 mb-2">
                                  <p className="text-orange-400 text-xs font-semibold mb-1">⚠ Running at full capacity</p>
                                  <p className="text-slate-400 text-[11px]">Peak concurrent usage hit all <span className="font-mono-brand text-white">{totalSeats}</span> seats. No denials yet, but one more user and they'll start getting blocked.</p>
                                  {cost > 0 && <p className="text-orange-300 text-xs mt-2 font-semibold">Adding 1 seat ({`$${cost.toLocaleString()}/yr`}) would provide a safety buffer.</p>}
                                </div>
                              )}
                              {isOverUtilized && (() => {
                                // Measure actual wait times: for each denial, find same user's next checkout of same feature
                                const featureDenials = d.denials.filter(den => den.feature === f);
                                const waitTimesMin: number[] = [];
                                featureDenials.forEach(den => {
                                  if (!den.user || !den.date || !den.time) return;
                                  const denialTime = new Date(`${den.date} ${den.time}`);
                                  if (isNaN(denialTime.getTime())) return;
                                  // Find next checkout by same user for same feature
                                  const nextCheckout = featureSessions
                                    .filter(s => s.user === den.user && s.start > denialTime)
                                    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
                                  if (nextCheckout) {
                                    const waitMin = (nextCheckout.start.getTime() - denialTime.getTime()) / 60000;
                                    // Filter out next-day returns (>4 hours = probably gave up and came back later)
                                    if (waitMin > 0 && waitMin <= 240) waitTimesMin.push(waitMin);
                                  }
                                });
                                
                                // Use measured wait time if we have enough data, otherwise estimate conservatively
                                const measuredWaits = waitTimesMin.length;
                                const avgWaitMin = measuredWaits >= 3
                                  ? waitTimesMin.reduce((a, b) => a + b, 0) / measuredWaits
                                  : 45; // conservative fallback
                                const medianWaitMin = measuredWaits >= 3
                                  ? waitTimesMin.sort((a, b) => a - b)[Math.floor(measuredWaits / 2)]
                                  : avgWaitMin;
                                // Use median (more robust to outliers) + context-switch overhead
                                const effectiveWaitMin = medianWaitMin + 10; // +10 min for context-switching overhead
                                
                                const ENG_HOURLY = 40;
                                const annualizedDenials = logDays > 0 ? Math.round(denials * (365 / logDays)) : denials;
                                const annualHoursLost = annualizedDenials * (effectiveWaitMin / 60);
                                const annualDenialCost = Math.round(annualHoursLost * ENG_HOURLY);
                                const seatsNeeded = hasSeats ? Math.max(1, featurePeak - totalSeats + 1) : Math.max(1, Math.ceil(denialRate / 10));
                                const seatInvestment = seatsNeeded * cost;
                                const roiPositive = cost > 0 && annualDenialCost > seatInvestment;
                                const roiRatio = seatInvestment > 0 ? annualDenialCost / seatInvestment : 0;
                                
                                return <div className={`${roiPositive ? 'bg-red-500/10 border-red-500/20' : 'bg-orange-500/10 border-orange-500/20'} border p-3 mb-2`}>
                                  <p className={`${roiPositive ? 'text-red-400' : 'text-orange-400'} text-xs font-semibold mb-1`}>⚠ Engineer downtime from denials</p>
                                  <p className="text-slate-400 text-[11px]">
                                    <span className="font-mono-brand text-white">{denials}</span> denials over {logDays} days → <span className="font-mono-brand text-white">~{annualizedDenials.toLocaleString()}</span> projected/yr.
                                    {measuredWaits >= 3
                                      ? <> Median wait before retry: <span className="font-mono-brand text-white">{Math.round(medianWaitMin)} min</span> (measured from {measuredWaits} denial→checkout pairs).</>
                                      : <> Estimated ~{Math.round(effectiveWaitMin)} min lost per denial (waiting, retrying, context-switching).</>
                                    }
                                  </p>
                                  {hasSeats && cost > 0 && (
                                    <div className="mt-3 pt-2 border-t border-slate-700/50">
                                      <div className="flex flex-wrap items-center gap-3 text-[11px]">
                                        <div>
                                          <p className="text-slate-500 text-[10px]">Seats to add</p>
                                          <p className="text-white font-mono-brand">+{seatsNeeded} → {totalSeats + seatsNeeded}</p>
                                        </div>
                                        <div>
                                          <p className="text-slate-500 text-[10px]">Annual investment</p>
                                          <p className="text-white font-mono-brand">${seatInvestment.toLocaleString()}</p>
                                        </div>
                                        <div>
                                          <p className="text-slate-500 text-[10px]">Estimated productivity loss</p>
                                          <p className="text-red-400 font-mono-brand">${annualDenialCost.toLocaleString()}/yr</p>
                                        </div>
                                      </div>
                                      {roiPositive ? (
                                        <p className="text-red-300 text-xs mt-2 font-semibold">
                                          Adding {seatsNeeded} seat{seatsNeeded > 1 ? 's' : ''} pays for itself <span className="font-mono-brand">{roiRatio.toFixed(1)}×</span> over. Net recovery: <span className="font-mono-brand">${(annualDenialCost - seatInvestment).toLocaleString()}/yr</span>.
                                        </p>
                                      ) : (
                                        <p className="text-orange-300 text-xs mt-2 font-semibold">
                                          Seat cost exceeds estimated denial impact. Consider options file rules (idle timeouts, reservations) to reduce contention before adding seats.
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {hasSeats && !cost && <p className="text-red-300/70 text-[11px] mt-1">Enter cost per seat above to see the ROI analysis.</p>}
                                  {!hasSeats && <p className="text-red-300/70 text-[11px] mt-1">Enter your seat count above for specific recommendations.</p>}
                                </div>;
                              })()}
                              {(isUnderUtilized || isOverProvisioned) && (
                                <div className="bg-amber-500/10 border border-amber-500/20 p-3">
                                  <p className="text-amber-400 text-xs font-semibold mb-1">💰 Possible cost savings</p>
                                  <p className="text-slate-400 text-[11px]">
                                    Peak concurrent was <span className="font-mono-brand text-white">{featurePeak}</span> but 90% of the time only <span className="font-mono-brand text-white">{p90}</span> {p90 === 1 ? 'seat is' : 'seats are'} in use (median: {p50}).
                                    {hasSeats && <> You have <span className="font-mono-brand text-white">{totalSeats}</span> seats — <span className="text-amber-400 font-mono-brand">{unusedSeats}</span> were never used, even at peak.</>}
                                  </p>
                                  {hasSeats && cost > 0 && unusedSeats >= 2 && (() => {
                                    const canCut = Math.max(1, Math.min(unusedSeats - 1, Math.floor(unusedSeats * 0.5)));
                                    return <p className="text-amber-300 text-xs mt-2 font-semibold">Reducing by {canCut} seat{canCut > 1 ? 's' : ''} could save <span className="font-mono-brand">${(canCut * cost).toLocaleString()}/yr</span> while keeping a buffer above peak.</p>;
                                  })()}
                                  {!hasSeats && cost > 0 && <p className="text-amber-400/70 text-[11px] mt-1">Enter your seat count above to calculate exact savings.</p>}
                                  {!cost && <p className="text-amber-400/70 text-[11px] mt-1">Enter cost per seat above to calculate dollar savings.</p>}
                                  <p className="text-slate-500 text-[10px] mt-2">Always keep 1-2 seats above peak before reducing. Monitor for seasonal spikes.</p>
                                </div>
                              )}
                              {!isOverUtilized && !isUnderUtilized && !isOverProvisioned && !isAtCapacity && hasSeats && (
                                <p className="text-emerald-400/70 text-[11px]">✓ Current seat count appears well-matched to demand.{!cost && ' Enter cost per seat above for dollar-value analysis.'}</p>
                              )}
                              {!isOverUtilized && !isAtCapacity && !isUnderUtilized && !hasSeats && (
                                <div className="bg-slate-800/30 border border-slate-700/30 p-3">
                                  <p className="text-slate-400 text-[11px]">
                                    Peak concurrent: <span className="font-mono-brand text-white">{featurePeak}</span> · Typical: <span className="font-mono-brand text-white">{p90}</span> · Denials: <span className={`font-mono-brand ${denials > 0 ? 'text-red-400' : 'text-white'}`}>{denials}</span>
                                  </p>
                                  <p className="text-slate-500 text-[10px] mt-1">Enter seat count{!cost ? ' and cost per seat' : ''} above for right-sizing recommendations.</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Log Health Check */}
                <div className="border border-slate-800 bg-[#111827] p-5">
                  <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2"><Activity size={14} className="text-[#1871bd]" /> Log Health Check</h3>
                  <div className="space-y-2">
                    {(() => {
                      const checks: { status: 'ok' | 'warn' | 'error', label: string, detail: string }[] = [];
                      
                      // Check for log restart (multiple "started on" entries)
                      const startEntries = d.entries.filter(e => e.raw.includes('FLEXnet Licensing') && e.raw.includes('started on'));
                      if (startEntries.length > 1) {
                        checks.push({ status: 'warn', label: 'Log contains multiple server starts', detail: `Found ${startEntries.length} restart events. Your log may be overwriting on restart instead of appending. Add a "+" prefix to your log path in the registry to preserve history.` });
                      } else {
                        checks.push({ status: 'ok', label: 'Single server session detected', detail: 'Log appears continuous with no restarts.' });
                      }

                      // Check for time gaps > 24h (missing data)
                      const timestamps = d.sessions.map(s => s.start.getTime()).sort();
                      let maxGap = 0, gapStart = 0;
                      for (let i = 1; i < timestamps.length; i++) {
                        const gap = timestamps[i] - timestamps[i - 1];
                        if (gap > maxGap) { maxGap = gap; gapStart = timestamps[i - 1]; }
                      }
                      if (maxGap > 48 * 3600000) {
                        checks.push({ status: 'warn', label: 'Large time gap detected', detail: `${Math.round(maxGap / 3600000)} hour gap starting ${new Date(gapStart).toLocaleDateString()}. Could indicate a log overwrite, server downtime, or missing data.` });
                      } else {
                        checks.push({ status: 'ok', label: 'No significant time gaps', detail: 'Data appears continuous throughout the log period.' });
                      }

                      // Check for errors
                      if (d.errors.length > 5) {
                        checks.push({ status: 'error', label: `${d.errors.length} errors detected`, detail: 'Review the System Errors tab for details.' });
                      } else if (d.errors.length > 0) {
                        checks.push({ status: 'warn', label: `${d.errors.length} minor error(s)`, detail: 'A few errors were found. Check the System Errors tab.' });
                      } else {
                        checks.push({ status: 'ok', label: 'No errors in log', detail: 'Clean log with no error entries.' });
                      }

                      // Data coverage
                      checks.push({ status: logDays >= 14 ? 'ok' : 'warn', label: `${logDays} days of data`, detail: logDays >= 14 ? 'Good coverage for trend analysis.' : 'Less than 2 weeks — trends may not be reliable. Enable log appending for better historical data.' });

                      return checks.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${c.status === 'ok' ? 'bg-emerald-500' : c.status === 'warn' ? 'bg-amber-400' : 'bg-red-500'}`} />
                          <div>
                            <span className="text-slate-300 font-medium">{c.label}</span>
                            <p className="text-slate-600 text-[10px]">{c.detail}</p>
                            {c.label.includes('overwriting') && (
                              <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000109458" target="_blank" rel="noopener" className="text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Learn how to enable log appending →</a>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'options' && d && (() => {
            // Generate options file text
            const generateOptionsFile = () => {
              const lines: string[] = [];
              lines.push('# SolidNetWork License Options File (sw_d.opt)');
              lines.push(`# Generated by SNL License Dashboard · ${new Date().toLocaleDateString()}`);
              lines.push(`# Server: ${data.metadata.serverName}`);
              lines.push('');
              if (optTimeoutEnabled) {
                lines.push(`# Return idle licenses after ${formatDuration(optTimeout / 60)} of inactivity`);
                lines.push(`TIMEOUTALL ${optTimeout}`);
              } else {
                lines.push('# No global idle timeout configured');
              }
              if (optFeatureTimeouts.length > 0) {
                lines.push('');
                lines.push('# Per-feature idle timeouts (override global)');
                optFeatureTimeouts.forEach(ft => {
                  lines.push(`TIMEOUT ${ft.feature} ${ft.seconds}`);
                });
              }
              lines.push('');

              if (optGroups.length > 0) {
                lines.push('# User Groups');
                optGroups.forEach(g => {
                  if (g.users.length > 0) {
                    lines.push(`GROUP ${g.name} ${g.users.join(' ')}`);
                  }
                });
                lines.push('');
              }

              if (optRules.length > 0) {
                lines.push('# License Rules');
                optRules.forEach(r => {
                  const feat = r.versionFilter ? `${r.feature}:SWVERSION=${r.versionFilter}` : r.feature;
                  if (r.type === 'MAX' || r.type === 'RESERVE') {
                    lines.push(`${r.type} ${r.count} ${feat} ${r.targetType} ${r.groupOrUser}`);
                  } else {
                    lines.push(`${r.type} ${feat} ${r.targetType} ${r.groupOrUser}`);
                  }
                });
              }

              return lines.join('\n');
            };

            const optionsText = generateOptionsFile();
            const detectedFeatures = Object.keys(d.featureStats);
            const logUsers = Array.from(new Set(d.sessions.map(s => s.user))).sort();
            const detectedUsers = [...new Set([...logUsers, ...customUsers])].sort();
            const detectedHosts = Object.keys(d.hostStats).sort();
            const avgSessionMins = d.sessions.length > 0 ? d.sessions.reduce((a, s) => a + (s.duration || 0), 0) / d.sessions.length : 0;
            const longSessionPct = d.sessions.length > 0 ? Math.round((d.sessions.filter(s => (s.duration || 0) > 480).length / d.sessions.length) * 100) : 0;

            // Natural language descriptions for rule types
            const ruleDescriptions: Record<string, { label: string, hint: string }> = {
              'RESERVE': { label: 'Reserve seats for', hint: 'Sets aside licenses exclusively for this target. No one else can use these seats, even if they\'re idle. Use when a team absolutely must have guaranteed access.' },
              'MAX': { label: 'Cap seats at', hint: 'Limits how many licenses this target can hold at once. They can still use the feature, just not more than this many simultaneously. Use to prevent one team from hogging all seats.' },
              'INCLUDE': { label: 'Restrict to only', hint: 'Locks this feature so ONLY this target can use it — everyone else gets denied. Use carefully, as it blocks all other users.' },
              'EXCLUDE': { label: 'Block completely', hint: 'Prevents this target from using this feature at all. They\'ll get a "license denied" error. Use to cut off specific users or machines.' },
              'INCLUDE_BORROW': { label: 'Allow borrowing for', hint: 'Only this target can borrow (take offline) this license. Borrowing lets users work away from the network for a set period.' },
              'EXCLUDE_BORROW': { label: 'Block borrowing for', hint: 'Prevents this target from taking this license offline. They can still use it while connected to the network.' },
            };

            const targetLabels: Record<string, { label: string, hint: string }> = {
              'USER': { label: 'a user', hint: 'A specific person\'s Windows login name' },
              'GROUP': { label: 'a group', hint: 'A named set of users defined above' },
              'HOST': { label: 'a machine', hint: 'A specific computer by its network hostname' },
              'INTERNET': { label: 'a subnet', hint: 'An IP address range — use * as wildcard (e.g. 192.168.1.*)' },
            };

            const rulesEndRef = React.createRef<HTMLDivElement>();
            const scrollToRules = () => setTimeout(() => rulesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
            const addRuleAndScroll = (rule: typeof optRules[0]) => { setOptRules([...optRules, rule]); scrollToRules(); };

            // Parse an existing sw_d.opt file
            const importOptionsFile = (text: string) => {
              const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
              const newGroups: typeof optGroups = [];
              const newRules: typeof optRules = [];
              let foundTimeout = false;
              const newFeatureTimeouts: typeof optFeatureTimeouts = [];
              const newCustomUsers: string[] = [];

              for (const line of lines) {
                const parts = line.split(/\s+/);
                const cmd = parts[0]?.toUpperCase();

                if (cmd === 'TIMEOUTALL' && parts[1]) {
                  setOptTimeoutEnabled(true);
                  setOptTimeout(parseInt(parts[1]) || 3600);
                  foundTimeout = true;
                } else if (cmd === 'TIMEOUT' && parts[1] && parts[2]) {
                  newFeatureTimeouts.push({ feature: parts[1], seconds: parseInt(parts[2]) || 3600 });
                } else if (cmd === 'GROUP' && parts[1]) {
                  const users = parts.slice(2);
                  newGroups.push({ name: parts[1], users });
                  users.forEach(u => { if (!logUsers.includes(u) && !newCustomUsers.includes(u)) newCustomUsers.push(u); });
                } else if (['MAX', 'RESERVE'].includes(cmd) && parts.length >= 5) {
                  // MAX/RESERVE count feature TARGET target_name
                  const feature = parts[2].split(':')[0];
                  const versionMatch = parts[2].match(/:SWVERSION=(\d+)/i);
                  newRules.push({
                    type: cmd as any,
                    count: parseInt(parts[1]) || 1,
                    feature,
                    targetType: (parts[3]?.toUpperCase() || 'USER') as any,
                    groupOrUser: parts[4] || '',
                    versionFilter: versionMatch?.[1] || '',
                  });
                } else if (['INCLUDE', 'EXCLUDE', 'INCLUDE_BORROW', 'EXCLUDE_BORROW'].includes(cmd) && parts.length >= 4) {
                  // INCLUDE/EXCLUDE feature TARGET target_name
                  const feature = parts[1].split(':')[0];
                  const versionMatch = parts[1].match(/:SWVERSION=(\d+)/i);
                  newRules.push({
                    type: cmd as any,
                    count: 1,
                    feature,
                    targetType: (parts[2]?.toUpperCase() || 'USER') as any,
                    groupOrUser: parts[3] || '',
                    versionFilter: versionMatch?.[1] || '',
                  });
                }
              }

              if (!foundTimeout) { setOptTimeoutEnabled(false); }
              if (newFeatureTimeouts.length > 0) setOptFeatureTimeouts(newFeatureTimeouts);
              if (newGroups.length > 0) setOptGroups(newGroups);
              if (newRules.length > 0) setOptRules(newRules);
              if (newCustomUsers.length > 0) setCustomUsers(prev => [...new Set([...prev, ...newCustomUsers])]);
            };

            return (
              <div className="space-y-6 overflow-x-hidden">
                {/* Intro / what is this */}
                <div className="border-l-2 border-[#1871bd] bg-[#111827] px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-300 mb-1">The options file (<span className="font-mono-brand text-[#46b6e3]">sw_d.opt</span>) controls how your SolidNetWork licenses are distributed.</p>
                      <p className="text-xs text-slate-500">Build a new configuration or import an existing one to edit it.</p>
                      <p className="text-[10px] text-slate-600 mt-2">Place the generated file at: <span className="font-mono-brand text-slate-400">...\SolidNetWork License Manager\licenses\sw_d.opt</span> then restart the license service.</p>
                    </div>
                    <label className="shrink-0 cursor-pointer px-3 py-2 border border-dashed border-[#1871bd]/50 text-[11px] text-[#1871bd] hover:text-[#46b6e3] hover:border-[#46b6e3]/50 transition-colors flex items-center gap-1.5">
                      <Upload size={14} /> Import existing sw_d.opt
                      <input type="file" accept=".opt,.txt,text/plain,*/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => { if (typeof reader.result === 'string') importOptionsFile(reader.result); };
                          reader.readAsText(file);
                        }
                        e.target.value = '';
                      }} />
                    </label>
                  </div>
                </div>

                {/* Data-driven suggestions */}
                <div className="border border-slate-800 bg-[#111827] p-5">
                  <h3 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2"><Info size={13} className="text-[#1871bd]" /> Recommendations from Your Log Data</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-[#0c1220] border border-slate-800">
                      <p className="text-slate-400 mb-1">Your average session is <span className="text-white font-mono-brand">{formatDuration(avgSessionMins)}</span></p>
                      <p className="text-slate-500 text-[11px]">Suggested timeout: <span className="text-[#46b6e3] font-mono-brand">{avgSessionMins < 60 ? '30 min' : avgSessionMins < 240 ? '1 hour' : '2 hours'}</span></p>
                      {!optTimeoutEnabled && <p className="text-amber-400/70 text-[10px] mt-1">⚠ No timeout set — licenses held until SOLIDWORKS is closed. Users leaving it open overnight will block others.</p>}
                      <button onClick={() => { setOptTimeoutEnabled(true); setOptTimeout(avgSessionMins < 60 ? 1800 : avgSessionMins < 240 ? 3600 : 7200); }} className="text-[10px] text-[#1871bd] hover:text-[#46b6e3] mt-1">Apply this →</button>
                    </div>
                    <div className="p-3 bg-[#0c1220] border border-slate-800">
                      <p className="text-slate-400 mb-1"><span className={`font-mono-brand ${longSessionPct > 20 ? 'text-amber-400' : 'text-white'}`}>{longSessionPct}%</span> of sessions last 8+ hours</p>
                      {longSessionPct > 20 ? (
                        <>
                          <p className="text-amber-400/70 text-[11px]">Try a shorter timeout to reclaim seats left open overnight.</p>
                          <button onClick={() => { setOptTimeoutEnabled(true); setOptTimeout(1800); }} className="text-[10px] text-[#1871bd] hover:text-[#46b6e3] mt-1">Set 30 min timeout →</button>
                        </>
                      ) : (
                        <p className="text-slate-500 text-[11px]">Looks healthy — most users close SOLIDWORKS at end of day. No action needed.</p>
                      )}
                    </div>
                    <div className="p-3 bg-[#0c1220] border border-slate-800">
                      {(() => { const top3 = d.denialRatioByFeature.filter((f: any) => f.ratio > 0).slice(0, 3); return top3.length > 0 ? (
                        <>
                          <p className="text-slate-400 mb-2">Most denied features:</p>
                          {top3.map((f: any, i: number) => (
                            <div key={f.name} className="flex items-center justify-between mb-1.5">
                              <span className="text-red-400 font-mono-brand text-[11px]">{SNL_FEATURES[f.name.toLowerCase()] || f.name} <span className="text-slate-600">({f.ratio}%)</span></span>
                              <button onClick={() => addRuleAndScroll({ type: 'RESERVE', count: 1, feature: f.name, groupOrUser: '', targetType: 'USER', versionFilter: '' })} className="text-[10px] text-[#1871bd] hover:text-[#46b6e3] shrink-0">Reserve →</button>
                            </div>
                          ))}
                          <p className="text-slate-500 text-[10px] mt-1">Reserve seats for critical users or shorten timeouts to free idle licenses.</p>
                        </>
                      ) : (
                        <p className="text-slate-500 text-[11px]">✓ No denials recorded — your license pool is handling demand well.</p>
                      ); })()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left column: Configuration */}
                  <div className="space-y-6">

                    {/* Step 1: Timeout */}
                    <div className="border border-slate-800 bg-[#111827] p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-[#1871bd]/20 text-[#46b6e3] text-[10px] flex items-center justify-center font-bold">1</span>
                        <h3 className="text-sm font-semibold text-slate-300">Idle Timeout</h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2 ml-7">When a user leaves SOLIDWORKS idle, how long before their license is returned to the pool?</p>
                      <details className="text-[10px] text-slate-600 mb-4 ml-7">
                        <summary className="cursor-pointer hover:text-slate-400">How is "idle" measured?</summary>
                        <p className="mt-1 pl-2 border-l border-slate-800">No mouse or keyboard activity in SOLIDWORKS — minimizing it or switching to another app counts as idle. The app reports inactivity to the license server.</p>
                      </details>

                      {/* Global toggle */}
                      <div className="flex flex-wrap items-center gap-2 mb-3 ml-7">
                        <button onClick={() => setOptTimeoutEnabled(false)} className={`px-3 py-1.5 text-xs border transition-colors ${!optTimeoutEnabled ? 'border-[#1871bd] text-[#46b6e3] bg-[#1871bd]/10' : 'border-slate-800 text-slate-500 hover:text-white'}`}>No timeout</button>
                        {[
                          { v: 1800, label: '30 min' }, { v: 3600, label: '1 hour' }, { v: 7200, label: '2 hours' }, { v: 14400, label: '4 hours' }
                        ].map(o => (
                          <button key={o.v} onClick={() => { setOptTimeoutEnabled(true); setOptTimeout(o.v); }} className={`px-3 py-1.5 text-xs border transition-colors ${optTimeoutEnabled && optTimeout === o.v ? 'border-[#1871bd] text-[#46b6e3] bg-[#1871bd]/10' : 'border-slate-800 text-slate-500 hover:text-white'}`}>{o.label}</button>
                        ))}
                        {optTimeoutEnabled && ![1800, 3600, 7200, 14400].includes(optTimeout) && (
                          <span className="text-xs text-[#46b6e3] font-mono-brand">{formatDuration(optTimeout / 60)}</span>
                        )}
                      </div>
                      {optTimeoutEnabled && (
                        <div className="flex items-center gap-2 ml-7 mb-3">
                          <span className="text-[11px] text-slate-500">Custom:</span>
                          <input type="number" value={optTimeout} onChange={e => setOptTimeout(Math.max(900, Number(e.target.value)))} min={900} step={300}
                            className="bg-[#0c1220] border border-slate-800 text-white text-xs px-2 py-1 w-24 font-mono-brand focus:border-[#1871bd] focus:outline-none" />
                          <span className="text-[10px] text-slate-600">seconds (min 900)</span>
                        </div>
                      )}
                      {/* Per-feature timeouts */}
                      <div className="border-t border-slate-800/50 pt-3 mt-3 ml-7">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-[11px] text-slate-400">Different timeout for specific features?</span>
                            <p className="text-[10px] text-slate-600">e.g. Simulation licenses are expensive — reclaim them faster.</p>
                          </div>
                          <button onClick={() => setOptFeatureTimeouts([...optFeatureTimeouts, { feature: detectedFeatures[0] || 'solidworks', seconds: 1800 }])}
                            className="text-[11px] text-[#1871bd] hover:text-[#46b6e3] flex items-center gap-1 shrink-0"><Plus size={12} /> Add</button>
                        </div>
                        {optFeatureTimeouts.map((ft, fi) => (
                          <div key={fi} className="bg-[#0c1220] border border-slate-800 p-2 mb-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-slate-500">Return</span>
                              <select value={ft.feature} onChange={e => { const t = [...optFeatureTimeouts]; t[fi].feature = e.target.value; setOptFeatureTimeouts(t); }}
                                className="bg-[#111827] border border-slate-800 text-[#46b6e3] text-[11px] px-2 py-1 font-mono-brand focus:outline-none min-w-0 max-w-[160px]">
                                {detectedFeatures.map(f => <option key={f} value={f}>{SNL_FEATURES[f.toLowerCase()] || f}</option>)}
                              </select>
                              <span className="text-slate-500">after</span>
                              <button onClick={() => setOptFeatureTimeouts(optFeatureTimeouts.filter((_, i) => i !== fi))} className="text-slate-600 hover:text-red-400 ml-auto"><Trash2 size={12} /></button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {[{ v: 1800, l: '30m' }, { v: 3600, l: '60m' }, { v: 7200, l: '120m' }].map(o => (
                                <button key={o.v} onClick={() => { const t = [...optFeatureTimeouts]; t[fi].seconds = o.v; setOptFeatureTimeouts(t); }}
                                  className={`px-2 py-0.5 text-[10px] border ${ft.seconds === o.v ? 'border-[#1871bd] text-[#46b6e3]' : 'border-slate-800 text-slate-600 hover:text-white'}`}>{o.l}</button>
                              ))}
                              <input type="number" value={ft.seconds} min={900} step={300} onChange={e => { const t = [...optFeatureTimeouts]; t[fi].seconds = Number(e.target.value); setOptFeatureTimeouts(t); }}
                                className="bg-[#111827] border border-slate-800 text-white text-[10px] px-2 py-0.5 w-16 font-mono-brand focus:outline-none" />
                              <span className="text-slate-600 text-[10px]">sec</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Groups */}
                    <div className="border border-slate-800 bg-[#111827] p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-[#1871bd]/20 text-[#46b6e3] text-[10px] flex items-center justify-center font-bold">2</span>
                        <h3 className="text-sm font-semibold text-slate-300">User Groups</h3>
                        <span className="text-[10px] text-slate-600 ml-1">(optional)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-4 ml-7">Group users together so you can apply rules to entire teams at once — e.g. "Engineering" or "Chicago Office".</p>

                      <div className="space-y-3 ml-7">
                        {optGroups.map((group, gi) => (
                          <div key={gi} className="bg-[#0c1220] border border-slate-800 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] text-slate-500">Group name:</span>
                              <input type="text" value={group.name} onChange={e => { const g = [...optGroups]; g[gi].name = e.target.value.replace(/\s/g, '_'); setOptGroups(g); }}
                                className="bg-transparent border-b border-slate-700 text-white text-xs font-mono-brand px-1 py-0.5 w-32 focus:border-[#1871bd] focus:outline-none" />
                              <button onClick={() => setOptGroups(optGroups.filter((_, i) => i !== gi))} className="ml-auto text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                              {group.users.map(u => (
                                <span key={u} className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1871bd]/10 border border-[#1871bd]/30 text-[#46b6e3] text-[10px]">
                                  {u} {!logUsers.includes(u) && <span className="text-slate-600">(custom)</span>}
                                  <button onClick={() => { const g = [...optGroups]; g[gi].users = g[gi].users.filter(x => x !== u); setOptGroups(g); }}><X size={8} /></button>
                                </span>
                              ))}
                              {group.users.length === 0 && <span className="text-[10px] text-slate-600 italic">No members yet</span>}
                            </div>
                            <div className="flex gap-1">
                              <select value="" onChange={e => { if (e.target.value) { const g = [...optGroups]; g[gi].users.push(e.target.value); setOptGroups(g); } }}
                                className="bg-[#111827] border border-slate-800 text-[11px] text-slate-400 px-2 py-1 flex-1 focus:border-[#1871bd] focus:outline-none">
                                <option value="">+ Pick from log…</option>
                                {detectedUsers.filter(u => !group.users.includes(u)).map(u => (
                                  <option key={u} value={u}>{u} {d.userStats[u] ? `(${d.userStats[u].sessions} sessions)` : '(custom)'}</option>
                                ))}
                              </select>
                              <form className="flex gap-1" onSubmit={e => {
                                e.preventDefault();
                                const input = (e.target as HTMLFormElement).elements.namedItem('customUser') as HTMLInputElement;
                                const val = input.value.trim();
                                if (val && !group.users.includes(val)) {
                                  const g = [...optGroups]; g[gi].users.push(val); setOptGroups(g);
                                  if (!customUsers.includes(val)) setCustomUsers([...customUsers, val]);
                                  input.value = '';
                                }
                              }}>
                                <input name="customUser" type="text" placeholder="or type a name…" className="bg-[#111827] border border-slate-800 text-[11px] text-white px-2 py-1 w-28 focus:border-[#1871bd] focus:outline-none placeholder:text-slate-700" />
                                <button type="submit" className="text-[#1871bd] hover:text-[#46b6e3] px-1"><Plus size={12} /></button>
                              </form>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => setOptGroups([...optGroups, { name: `group${optGroups.length + 1}`, users: [] }])}
                          className="w-full py-2 border border-dashed border-slate-700 text-xs text-slate-500 hover:text-[#46b6e3] hover:border-[#1871bd]/50 transition-colors flex items-center justify-center gap-1">
                          <Plus size={14} /> Create a group
                        </button>
                      </div>
                    </div>

                    {/* Step 3: Rules */}
                    <div className="border border-slate-800 bg-[#111827] p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-5 h-5 rounded-full bg-[#1871bd]/20 text-[#46b6e3] text-[10px] flex items-center justify-center font-bold">3</span>
                        <h3 className="text-sm font-semibold text-slate-300">License Rules</h3>
                        <span className="text-[10px] text-slate-600 ml-1">(optional)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2 ml-7">Control who can use which features. Each rule applies to one target — a single user, machine, or group.</p>
                      <p className="text-[10px] text-slate-600 mb-4 ml-7">💡 Need to apply the same rule to multiple users? Create a Group in Step 2 and target the group instead of individual users. Much cleaner than multiple rules.</p>

                      <div className="space-y-3 ml-7">
                        {optRules.map((rule, ri) => {
                          const desc = ruleDescriptions[rule.type];
                          return (
                            <div key={ri} className="bg-[#0c1220] border border-slate-800 p-3">
                              {/* Row 1: Action + count */}
                              <div className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
                                <select value={rule.type} onChange={e => { const r = [...optRules]; r[ri].type = e.target.value as any; setOptRules(r); }}
                                  className="bg-[#111827] border border-slate-800 text-white text-[11px] px-2 py-1.5 focus:outline-none font-semibold max-w-[180px]">
                                  {Object.entries(ruleDescriptions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>

                                {(rule.type === 'MAX' || rule.type === 'RESERVE') && (
                                  <input type="number" value={rule.count} min={1} onChange={e => { const r = [...optRules]; r[ri].count = Number(e.target.value); setOptRules(r); }}
                                    className="bg-[#111827] border border-slate-800 text-white text-[11px] px-2 py-1.5 w-14 font-mono-brand focus:outline-none" />
                                )}

                                <span className="text-slate-500 shrink-0">of</span>

                                <select value={rule.feature} onChange={e => { const r = [...optRules]; r[ri].feature = e.target.value; setOptRules(r); }}
                                  className="bg-[#111827] border border-slate-800 text-[11px] text-[#46b6e3] px-2 py-1.5 font-mono-brand focus:outline-none min-w-0 max-w-[180px]">
                                  {detectedFeatures.map(f => <option key={f} value={f}>{SNL_FEATURES[f.toLowerCase()] || f}</option>)}
                                </select>

                                <div className="flex gap-1 ml-auto shrink-0">
                                  <button title="Duplicate rule" onClick={() => addRuleAndScroll({ ...rule })} className="text-slate-600 hover:text-[#46b6e3]"><Copy size={12} /></button>
                                  <button title="Delete rule" onClick={() => setOptRules(optRules.filter((_, i) => i !== ri))} className="text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                                </div>
                              </div>

                              {/* Row 2: Target */}
                              <div className="flex flex-wrap items-center gap-1.5 text-xs mb-2">
                                <span className="text-slate-500 shrink-0">for</span>
                                <select value={rule.targetType} onChange={e => { const r = [...optRules]; r[ri].targetType = e.target.value as any; if (e.target.value === 'HOST' || e.target.value === 'INTERNET') r[ri].groupOrUser = ''; setOptRules(r); }}
                                  className="bg-[#111827] border border-slate-800 text-[11px] text-slate-400 px-2 py-1.5 focus:outline-none">
                                  {Object.entries(targetLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>

                                {rule.targetType === 'GROUP' ? (
                                  <select value={rule.groupOrUser} onChange={e => { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); }}
                                    className="bg-[#111827] border border-slate-800 text-[11px] text-white px-2 py-1.5 focus:outline-none min-w-[80px]">
                                    {optGroups.length > 0 ? optGroups.map(g => <option key={g.name} value={g.name}>{g.name}</option>) : <option value="">Create a group first ↑</option>}
                                  </select>
                                ) : rule.targetType === 'USER' ? (
                                  <div className="flex gap-1 items-center flex-wrap">
                                    <select value="" onChange={e => { if (e.target.value) { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); } }}
                                      className="bg-[#111827] border border-slate-800 text-[11px] text-slate-400 px-2 py-1.5 focus:outline-none max-w-[140px]">
                                      <option value="">Pick from log…</option>
                                      {detectedUsers.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                    <span className="text-slate-600 text-[10px]">or</span>
                                    <input type="text" value={rule.groupOrUser} onChange={e => { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); }}
                                      onBlur={e => { const v = e.target.value.trim(); if (v && !customUsers.includes(v) && !logUsers.includes(v)) setCustomUsers([...customUsers, v]); }}
                                      placeholder="type a name"
                                      className="bg-[#111827] border border-slate-800 text-[11px] text-white px-2 py-1.5 font-mono-brand focus:outline-none w-28 placeholder:text-slate-700" />
                                  </div>
                                ) : rule.targetType === 'HOST' ? (
                                  <div className="flex gap-1 items-center flex-wrap">
                                    {detectedHosts.length > 0 && (
                                      <select value="" onChange={e => { if (e.target.value) { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); } }}
                                        className="bg-[#111827] border border-slate-800 text-[11px] text-slate-400 px-2 py-1.5 focus:outline-none max-w-[140px]">
                                        <option value="">Pick from log…</option>
                                        {detectedHosts.map(h => <option key={h} value={h}>{h}</option>)}
                                      </select>
                                    )}
                                    {detectedHosts.length > 0 && <span className="text-slate-600 text-[10px]">or</span>}
                                    <input type="text" value={rule.groupOrUser} onChange={e => { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); }}
                                      placeholder="type a hostname"
                                      className="bg-[#111827] border border-slate-800 text-[11px] text-white px-2 py-1.5 font-mono-brand focus:outline-none w-28 placeholder:text-slate-700" />
                                  </div>
                                ) : (
                                  <input type="text" value={rule.groupOrUser} onChange={e => { const r = [...optRules]; r[ri].groupOrUser = e.target.value; setOptRules(r); }}
                                    placeholder="192.168.1.*"
                                    className="bg-[#111827] border border-slate-800 text-[11px] text-white px-2 py-1.5 font-mono-brand focus:outline-none w-32 placeholder:text-slate-700" />
                                )}
                              </div>

                              {/* Hint: suggest group for multiple similar rules */}
                              {(() => {
                                const sameTypeFeature = optRules.filter((r, i) => i !== ri && r.type === rule.type && r.feature === rule.feature && r.targetType === 'USER');
                                return sameTypeFeature.length >= 1 && rule.targetType === 'USER' ? (
                                  <p className="text-[10px] text-amber-400/70 mb-2">💡 Tip: You have {sameTypeFeature.length + 1} similar rules for individual users. Consider creating a <strong>Group</strong> instead — add users to a group in Step 2, then use one rule for the whole group.</p>
                                ) : null;
                              })()}

                              {/* Version filter — admin control, not license type */}
                              <details className="text-[10px] mb-2">
                                <summary className="text-slate-600 cursor-pointer hover:text-slate-400">
                                  {rule.versionFilter ? <span className="text-purple-400">Version {rule.versionFilter} only</span> : 'Version restriction (optional)'}
                                </summary>
                                <div className="mt-1 pl-2 border-l border-slate-800">
                                  <p className="text-slate-600 mb-1">SW licenses aren't version-specific, but admins can control which version users are allowed to launch — useful for controlled rollouts.</p>
                                  <div className="flex items-center gap-2">
                                    <input type="text" value={rule.versionFilter} onChange={e => { const r = [...optRules]; r[ri].versionFilter = e.target.value.replace(/[^0-9]/g, ''); setOptRules(r); }}
                                      placeholder="e.g. 2025"
                                      className="bg-[#111827] border border-slate-800 text-purple-400 text-[10px] px-2 py-0.5 w-20 font-mono-brand focus:outline-none placeholder:text-slate-700" />
                                    {rule.versionFilter && <button onClick={() => { const r = [...optRules]; r[ri].versionFilter = ''; setOptRules(r); }} className="text-slate-600 hover:text-red-400">Clear</button>}
                                  </div>
                                </div>
                              </details>

                              {/* Hint */}
                              <p className="text-[10px] text-slate-600 mb-2">{desc?.hint}</p>

                              {/* Generated syntax preview */}
                              <div className="px-2 py-1 bg-[#111827] border border-slate-800/50 text-[10px] font-mono-brand text-slate-500 overflow-x-auto">
                                {(() => {
                                  const feat = rule.versionFilter ? `${rule.feature}:SWVERSION=${rule.versionFilter}` : rule.feature;
                                  return (rule.type === 'MAX' || rule.type === 'RESERVE')
                                    ? `${rule.type} ${rule.count} ${feat} ${rule.targetType} ${rule.groupOrUser || '???'}`
                                    : `${rule.type} ${feat} ${rule.targetType} ${rule.groupOrUser || '???'}`;
                                })()}
                              </div>
                            </div>
                          );
                        })}

                        {/* Scroll target for new rules */}
                        <div ref={rulesEndRef} />

                        {/* Quick-add buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => addRuleAndScroll({ type: 'RESERVE', count: 1, feature: detectedFeatures[0] || 'solidworks', groupOrUser: optGroups[0]?.name || '', targetType: optGroups.length > 0 ? 'GROUP' : 'USER', versionFilter: '' })}
                            className="py-2 px-3 border border-dashed border-slate-700 text-[11px] text-slate-500 hover:text-[#46b6e3] hover:border-[#1871bd]/50 transition-colors flex items-center gap-1">
                            <Plus size={12} /> Guarantee seats
                          </button>
                          <button onClick={() => addRuleAndScroll({ type: 'MAX', count: 3, feature: detectedFeatures[0] || 'solidworks', groupOrUser: optGroups[0]?.name || '', targetType: optGroups.length > 0 ? 'GROUP' : 'USER', versionFilter: '' })}
                            className="py-2 px-3 border border-dashed border-slate-700 text-[11px] text-slate-500 hover:text-[#46b6e3] hover:border-[#1871bd]/50 transition-colors flex items-center gap-1">
                            <Plus size={12} /> Cap usage
                          </button>
                          <button onClick={() => addRuleAndScroll({ type: 'EXCLUDE', count: 1, feature: detectedFeatures[0] || 'solidworks', groupOrUser: '', targetType: 'USER', versionFilter: '' })}
                            className="py-2 px-3 border border-dashed border-slate-700 text-[11px] text-slate-500 hover:text-[#46b6e3] hover:border-[#1871bd]/50 transition-colors flex items-center gap-1">
                            <Plus size={12} /> Block a user
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right column: Preview + Reference */}
                  <div className="space-y-6">
                    {/* Live Preview */}
                    <div className="border border-slate-800 bg-[#111827] lg:sticky lg:top-4">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0c1220]">
                        <div>
                          <span className="text-xs text-slate-400 font-mono-brand">sw_d.opt</span>
                          <span className="text-[10px] text-slate-600 ml-2">— live preview</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { navigator.clipboard.writeText(optionsText); setOptCopied(true); setTimeout(() => setOptCopied(false), 2000); }}
                            className="text-[11px] text-slate-500 hover:text-white flex items-center gap-1">
                            <Copy size={12} /> {optCopied ? 'Copied!' : 'Copy'}
                          </button>
                          <button onClick={() => {
                            const blob = new Blob([optionsText], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a'); a.href = url; a.download = 'sw_d.opt'; a.click();
                            URL.revokeObjectURL(url);
                          }} className="text-[11px] text-[#1871bd] hover:text-[#46b6e3] flex items-center gap-1">
                            <Download size={12} /> Download
                          </button>
                        </div>
                      </div>
                      <pre className="p-4 text-xs font-mono-brand text-slate-300 overflow-x-auto whitespace-pre leading-relaxed max-h-[400px] overflow-y-auto">
                        {optionsText}
                      </pre>
                      <div className="px-5 py-3 border-t border-slate-800 bg-[#0c1220]">
                        <p className="text-[10px] text-slate-600">After downloading, place this file alongside <span className="font-mono-brand">sw_d.lic</span> in your license manager's <span className="font-mono-brand">\licenses\</span> folder. Then stop and restart the SolidNetWork License Manager service for changes to take effect.</p>
                      </div>
                    </div>

                    {/* Detected Features from Log */}
                    <div className="border border-slate-800 bg-[#111827] p-5">
                      <h3 className="text-xs font-semibold text-slate-400 mb-3">Features Detected in Your Log</h3>
                      <div className="space-y-1">
                        {detectedFeatures.map(f => (
                          <div key={f} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/30">
                            <span className="font-mono-brand text-[#46b6e3]">{f}</span>
                            <span className="text-slate-500">{SNL_FEATURES[f.toLowerCase()] || 'Unknown feature'}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-600 mt-3">These are the feature codes found in your log file. Use them in rules above to control access.</p>
                    </div>

                    {/* Help & Resources (collapsible) */}
                    <details className="border border-slate-800 bg-[#111827]">
                      <summary className="px-5 py-3 text-xs font-semibold text-slate-400 cursor-pointer hover:text-slate-300 flex items-center gap-2">
                        <HelpCircle size={13} className="text-[#1871bd]" /> Help & Syntax Reference
                      </summary>
                      <div className="px-5 pb-4 space-y-3">
                        <div className="space-y-2 text-[11px]">
                          <p className="text-slate-500 text-[10px] mb-2">Each rule in the options file is a single line. Here's what each command does:</p>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">TIMEOUTALL 3600</span><p className="text-slate-500 mt-0.5">Return ALL idle licenses after 3600 seconds (1 hour). Minimum: 900 (15 min).</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">TIMEOUT solidworks 1800</span><p className="text-slate-500 mt-0.5">Override global timeout for a specific feature only.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">GROUP engineering user1 user2 user3</span><p className="text-slate-500 mt-0.5">Create a named group. Use Windows login names. No spaces in group name.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">RESERVE 2 solidworks GROUP engineering</span><p className="text-slate-500 mt-0.5">Set aside 2 SOLIDWORKS seats exclusively for the engineering group.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">MAX 3 solidworks GROUP interns</span><p className="text-slate-500 mt-0.5">The interns group can use at most 3 SOLIDWORKS seats at once.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">EXCLUDE solidworks USER john</span><p className="text-slate-500 mt-0.5">Block user john from checking out SOLIDWORKS entirely.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">INCLUDE solidworks:SWVERSION=2025 USER jane</span><p className="text-slate-500 mt-0.5">Only jane can use SOLIDWORKS 2025 specifically. Others can use other versions.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">RESERVE 1 solidworks HOST workstation1</span><p className="text-slate-500 mt-0.5">Reserve a license for a specific machine by its network hostname.</p></div>
                          <div className="p-2 bg-[#0c1220] border border-slate-800"><span className="font-mono-brand text-amber-400">EXCLUDE solidworks INTERNET 10.0.2.*</span><p className="text-slate-500 mt-0.5">Block an entire subnet from using a feature. Wildcards allowed.</p></div>
                        </div>

                        <div className="pt-3 border-t border-slate-800/50 space-y-1.5">
                          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">SolidWorks KB Articles</p>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000104415" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Reserve licenses for a PC, host, user, or group →</a>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000117182" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Control licenses by location / IP subnet →</a>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000120029" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Allocate license pools across groups →</a>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000105107" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Set static TCP port for firewall →</a>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000109458" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Preserve log history across restarts →</a>
                          <a href="https://support.3ds.com/knowledge-base/?q=docid:QA00000117707" target="_blank" rel="noopener" className="block text-[10px] text-[#1871bd] hover:text-[#46b6e3]">Troubleshooting files reference →</a>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            );
          })()}
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
