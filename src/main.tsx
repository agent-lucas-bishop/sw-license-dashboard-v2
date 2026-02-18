
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

  // Aggregations
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

const StatCard = ({ title, value, icon: Icon, trend, color }: any) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl bg-opacity-10 dark:bg-opacity-20`} style={{ backgroundColor: color + '20' }}>
        <Icon size={24} style={{ color }} />
      </div>
      {trend && (
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div>
      <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{title}</h3>
      <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
    </div>
  </div>
);

const ExecutiveSummary = ({ data }: { data: DashboardData }) => {
  const topApp = Object.entries(data.featureStats).sort((a,b) => b[1].checkouts - a[1].checkouts)[0];
  const topDenied = Object.entries(data.featureStats).sort((a,b) => b[1].denials - a[1].denials)[0];
  const totalSessions = data.sessions.length;
  const totalDenials = data.denials.length;
  const totalCheckoutsAttempted = totalSessions + totalDenials;
  const denialRate = totalCheckoutsAttempted > 0 ? ((totalDenials / totalCheckoutsAttempted) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#1e2943] to-[#1871bd] p-8 rounded-xl text-white shadow-sm">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Info size={24} /> Executive Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <p className="text-slate-200 text-lg leading-relaxed">
              Log analysis for <span className="font-semibold text-white">{data.metadata.serverName}</span> complete. 
              We've identified <span className="font-semibold text-white">{totalSessions.toLocaleString()}</span> successful sessions. 
              The feature <span className="font-semibold text-white">"{topApp?.[0] || 'N/A'}"</span> dominates usage.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                <p className="text-[10px] uppercase text-slate-300 font-bold">Health Status</p>
                <p className={`text-xl font-bold ${Number(denialRate) > 10 || data.errors.filter(e => e.type === 'ERROR').length > 5 ? 'text-red-400' : Number(denialRate) > 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {Number(denialRate) > 10 || data.errors.filter(e => e.type === 'ERROR').length > 5 ? 'At Risk' : Number(denialRate) > 5 ? 'Warning' : 'Healthy'}
                </p>
              </div>
              <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                <p className="text-[10px] uppercase text-slate-300 font-bold">Denial Threshold</p>
                <p className={`text-xl font-bold ${Number(denialRate) > 5 ? 'text-red-400' : 'text-green-400'}`}>{denialRate}%</p>
              </div>
              <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                <p className="text-[10px] uppercase text-slate-300 font-bold">Active Assets</p>
                <p className="text-xl font-bold">{Object.keys(data.featureStats).length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 p-6 rounded-lg backdrop-blur-md border border-white/10">
            <h4 className="font-semibold mb-3 flex items-center gap-2 text-blue-300 uppercase tracking-widest text-xs">
              <ShieldAlert size={14} /> Key Insights & Alerts
            </h4>
            <ul className="space-y-3 text-sm text-slate-200">
              {totalDenials > 20 && (
                <li className="flex gap-2 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <span><strong>License Scarcity:</strong> Frequent denials for "{topDenied?.[0]}". Recommendation: Purchase additional seats to reduce engineer downtime.</span>
                </li>
              )}
              {totalSessions < 10 && (
                <li className="flex gap-2 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <span><strong>Inventory Bloat:</strong> Low license utilization detected. Review maintenance contracts for potential cost savings.</span>
                </li>
              )}
              {data.errors.length > 5 && (
                <li className="flex gap-2 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span><strong>System Instability:</strong> Multiple daemon crashes or re-reads detected. Check server resources.</span>
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
  const reportRef = useRef<HTMLDivElement>(null);

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
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-16 mb-8" />
          <h1 className="text-4xl md:text-6xl font-black mb-4 tracking-tighter">
            SNL <span className="text-[#1871bd]">License Parser</span>
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 mb-12 max-w-2xl font-medium">
            Professional dashboard for SolidWorks CAD Administrators. Visualize licensing health, track denials, and optimize your software spend instantly.
          </p>
          
          <label className="group relative cursor-pointer w-full max-w-lg">
            <div className={`
              border-2 border-dashed rounded-xl p-16 text-center transition-all duration-300
              ${isDarkMode ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-[#1871bd]' : 'border-slate-300 bg-white hover:border-[#1871bd] shadow-lg'}
            `}>
              <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                <Upload size={32} className="text-[#1871bd]" />
              </div>
              <span className="text-2xl font-bold block mb-2">Select License Log</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">Drag & drop your <strong>lmgrd.log</strong> here</p>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".log,.txt" />
            </div>
            {isParsing && (
              <div className="absolute inset-0 bg-slate-900/80 rounded-xl flex items-center justify-center flex-col gap-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="font-bold">Parsing Data Points...</p>
              </div>
            )}
          </label>
          
          <p className="mt-6 text-xs text-slate-500 dark:text-slate-500 tracking-wide">🔒 100% client-side · your data never leaves the browser</p>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-8 text-left w-full">
            {[
              { icon: ShieldAlert, title: 'Denial Analysis', desc: 'Identify which engineers are being blocked and why.' },
              { icon: Clock, title: 'Consumption Stats', desc: 'Detailed breakdown of session length and top applications.' },
              { icon: FileDown, title: 'PDF Reporting', desc: 'Generate executive summaries ready for management review.' }
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-xl bg-white/5 border border-white/5 dark:border-slate-800 dark:bg-slate-800/40 shadow-sm backdrop-blur-sm">
                <div className="p-3 bg-blue-500/10 rounded-lg w-fit mb-4">
                  <f.icon className="text-[#1871bd]" size={24} />
                </div>
                <h3 className="font-bold text-xl mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#0f172a] text-white' : 'bg-slate-50 text-slate-900'} transition-colors duration-300 flex overflow-hidden`}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/ellison-logo.png" alt="Ellison" className="h-6" />
          <span className="font-bold text-sm">SNL Parser</span>
        </div>
        <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Nav Overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMobileNavOpen(false)}>
          <div className="absolute top-14 left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 space-y-1" onClick={e => e.stopPropagation()}>
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all ${
                  activeTab === item.id 
                    ? 'bg-[#1871bd] text-white font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2 flex gap-2">
              <button onClick={() => setData(null)} className="flex-1 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">Change Log</button>
              <button onClick={() => { downloadMasterPDF(); setMobileNavOpen(false); }} className="flex-1 px-3 py-2 rounded-lg bg-[#1871bd] text-white text-xs font-bold">Export PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-200 dark:border-slate-800 p-8 flex flex-col hidden lg:flex sticky top-0 h-screen bg-white dark:bg-[#0f172a] z-20">
        <div className="flex items-center gap-3 mb-12 px-2">
          <img src="/ellison-logo.png" alt="Ellison Technologies" className="h-8" />
          <h2 className="font-black text-xl tracking-tighter">SNL Parser</h2>
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
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all duration-200 ${
                activeTab === item.id 
                  ? 'bg-[#1871bd] text-white shadow-sm shadow-blue-500/30 font-bold scale-[1.02]' 
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
            className="w-full flex items-center gap-4 px-5 py-4 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-bold text-sm">{isDarkMode ? 'Switch to Light' : 'Switch to Dark'}</span>
          </button>
          
          <div className="p-5 rounded-xl bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Server Metadata</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Host</span>
                <span className="text-xs font-bold truncate ml-2">{data.metadata.serverName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">FlexLM</span>
                <span className="text-xs font-bold">v{data.metadata.flexVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">Port</span>
                <span className="text-xs font-bold">{data.metadata.port}</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 pt-16 lg:p-10 lg:pt-10 max-w-7xl mx-auto w-full overflow-y-auto">
        {/* Header */}
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
              className="px-6 py-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm font-bold transition-all border border-slate-200 dark:border-slate-700"
            >
              Change Log
            </button>
            <button 
              onClick={downloadMasterPDF}
              className="px-6 py-3 rounded-lg bg-[#1871bd] hover:bg-blue-700 text-white text-sm font-bold shadow-sm shadow-blue-500/20 transition-all flex items-center gap-3"
            >
              <Printer size={18} /> Export PDF
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

              <ExecutiveSummary data={data} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Activity size={120} />
                  </div>
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <Activity size={24} className="text-[#1871bd]" /> License Checkout Trend
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.timeSeriesUsage}>
                        <defs>
                          <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.brandMid} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={COLORS.brandMid} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="time" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: isDarkMode ? '#1e2943' : '#fff', border: 'none', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
                          itemStyle={{ fontWeight: 'bold' }}
                        />
                        <Area type="monotone" dataKey="count" stroke={COLORS.brandMid} fillOpacity={1} fill="url(#colorUsage)" strokeWidth={4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <LayoutDashboard size={24} className="text-[#46b6e3]" /> Demand by Feature
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={topFeaturesBySessions}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} width={100} tickLine={false} axisLine={false} />
                        <Tooltip 
                          cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' }}
                          contentStyle={{ backgroundColor: isDarkMode ? '#1e2943' : '#fff', border: 'none', borderRadius: '15px' }}
                        />
                        <Bar dataKey="value" fill={COLORS.brandMid} radius={[0, 10, 10, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'licenses' && (
            <div className="space-y-10">
               <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
                <div className="p-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                  <h3 className="text-2xl font-black">Feature Inventory & Health</h3>
                  <p className="text-slate-500 text-sm mt-1">Detailed utilization breakdown across all detected SolidWorks features.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100/50 dark:bg-slate-900/30">
                      <tr>
                        <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-500">License Name</th>
                        <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-500">Checkouts</th>
                        <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-500">Usage Time</th>
                        <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-500">Denials</th>
                        <th className="px-8 py-5 text-xs font-black uppercase tracking-widest text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {(Object.entries(data.featureStats) as [string, { checkouts: number; denials: number; totalDuration: number }][]).map(([name, stats]) => (
                        <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-8 py-6 font-bold text-sm">{name}</td>
                          <td className="px-8 py-6 text-sm">{stats.checkouts.toLocaleString()}</td>
                          <td className="px-8 py-6 text-sm">{formatDuration(stats.totalDuration)}</td>
                          <td className={`px-8 py-6 text-sm font-black ${stats.denials > 0 ? 'text-red-500' : 'text-slate-400'}`}>{stats.denials}</td>
                          <td className="px-8 py-6">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
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
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                 <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
                    <div className="p-8 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                      <h3 className="text-2xl font-black">Consumption by User</h3>
                      <div className="relative w-64">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Filter names..." className="w-full pl-12 pr-6 py-3 bg-slate-100 dark:bg-slate-900/50 rounded-lg text-xs outline-none focus:ring-2 ring-[#1871bd]" />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100/50 dark:bg-slate-900/30">
                          <tr>
                            <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Username</th>
                            <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Total Sessions</th>
                            <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Avg Duration</th>
                            <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Denials</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {(Object.entries(data.userStats) as [string, { sessions: number; totalDuration: number; denials: number }][]).sort((a,b) => b[1].sessions - a[1].sessions).map(([name, stats]) => (
                            <tr key={name} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              <td className="px-8 py-6 text-sm font-black flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] text-slate-500">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                {name}
                              </td>
                              <td className="px-8 py-6 text-sm">{stats.sessions}</td>
                              <td className="px-8 py-6 text-sm font-medium">{formatDuration(stats.totalDuration / (stats.sessions || 1))}</td>
                              <td className="px-8 py-6 text-sm font-black text-red-500/80">{stats.denials}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col">
                    <h3 className="text-xl font-black mb-8">Top Power Users</h3>
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
            </div>
          )}

          {activeTab === 'denials' && (
            <div className="space-y-12">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                    <ShieldAlert size={24} className="text-red-500" /> Denial Heatmap (Daily)
                  </h3>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.denialsByDay}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="time" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1e2943' : '#fff', border: 'none', borderRadius: '15px' }} />
                        <Bar dataKey="count" fill={COLORS.error} radius={[10, 10, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md">
                  <h3 className="text-xl font-black mb-8">Most Common Denial Reasons</h3>
                  <div className="space-y-6">
                    {Array.from(new Set(data.denials.map(d => d.reason))).slice(0, 5).map(reason => {
                      const count = data.denials.filter(d => d.reason === reason).length;
                      const percentage = Math.round((count / (data.denials.length || 1)) * 100);
                      return (
                        <div key={reason} className="group">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{reason}</p>
                            <span className="text-xs font-black text-red-500">{count} Events</span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
                <div className="p-8 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-2xl font-black">Denial Audit Trail</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100/50 dark:bg-slate-900/30">
                      <tr>
                        <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Timestamp</th>
                        <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">User</th>
                        <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Requested Feature</th>
                        <th className="px-8 py-5 text-xs font-black uppercase text-slate-500">Reason / Return Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {data.denials.slice(0, 50).map((d, i) => (
                        <tr key={i} className="hover:bg-red-50/30 dark:hover:bg-red-900/10 transition-colors">
                          <td className="px-8 py-5 text-xs font-medium text-slate-400 font-mono">{d.time}</td>
                          <td className="px-8 py-5 text-sm font-bold">{d.user}</td>
                          <td className="px-8 py-5 text-sm font-medium text-blue-500">{d.feature}</td>
                          <td className="px-8 py-5 text-sm text-red-500 font-bold">{d.reason}</td>
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
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Fatal Errors</p>
                  <p className="text-5xl font-black text-red-500">{data.errors.filter(e => e.type === 'ERROR').length}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Unsupported Features</p>
                  <p className="text-5xl font-black text-amber-500">{data.errors.filter(e => e.type === 'UNSUPPORTED').length}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-2">Analyzed Lines</p>
                  <p className="text-5xl font-black text-blue-500">{data.entries.length.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
                <div className="p-8 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/80">
                  <h3 className="text-xl font-black">System Event Trace</h3>
                  <div className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl text-[10px] font-black uppercase">Debug View</div>
                </div>
                <div className="p-4 max-h-[600px] overflow-y-auto font-mono text-[11px] bg-slate-50 dark:bg-slate-900/50">
                  {data.errors.map((err, i) => (
                    <div key={i} className="py-2.5 px-6 flex gap-6 hover:bg-slate-200 dark:hover:bg-slate-800/60 rounded-lg group transition-all">
                      <span className="text-slate-400 whitespace-nowrap">{err.time}</span>
                      <span className={`font-black ${err.type === 'ERROR' ? 'text-red-500' : 'text-amber-500'}`}>[{err.type}]</span>
                      <span className="text-slate-600 dark:text-slate-300 break-all">{err.raw}</span>
                    </div>
                  ))}
                  {data.errors.length === 0 && (
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
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md group hover:scale-[1.02] transition-transform">
                  <div className="p-6 bg-blue-100 dark:bg-blue-900/30 rounded-xl w-fit mb-8 group-hover:rotate-6 transition-transform">
                    <FileDown size={48} className="text-[#1871bd]" />
                  </div>
                  <h3 className="text-2xl font-black mb-4">Executive Performance Report</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Compiles all high-level metrics, usage charts, and system health alerts into a professional multi-page PDF document suitable for IT management and procurement stakeholders.
                  </p>
                  <button 
                    onClick={downloadMasterPDF}
                    className="w-full py-5 bg-[#1871bd] hover:bg-blue-700 text-white font-black rounded-xl shadow-sm shadow-blue-500/30 transition-all flex items-center justify-center gap-4 text-lg"
                  >
                    <Printer size={22} /> Generate Executive PDF
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-800 p-10 rounded-xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col">
                  <div className="p-6 bg-purple-100 dark:bg-purple-900/30 rounded-xl w-fit mb-8">
                    <Database size={48} className="text-purple-600" />
                  </div>
                  <h3 className="text-2xl font-black mb-4">Raw Data Insights (CSV)</h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed font-medium">
                    Need further custom analysis? Export the structured dataset for PowerBI, Excel, or internal auditing tools.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-auto">
                    <button className="py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      Session Table
                    </button>
                    <button className="py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 font-black text-xs rounded-lg transition-all tracking-widest uppercase">
                      User Statistics
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-[#1e2943] border border-blue-500/20 p-10 rounded-xl shadow-md relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 p-10 opacity-10 rotate-12">
                   <Server size={300} className="text-white" />
                </div>
                <div className="flex gap-8 items-start relative z-10">
                  <div className="p-5 bg-blue-500/20 rounded-lg border border-blue-500/40">
                    <Info className="text-blue-300" size={32} />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-white mb-2 tracking-tight">Optimization Recommendation</h4>
                    <p className="text-blue-100/70 max-w-2xl leading-relaxed font-medium">
                      {(() => {
                        const dr = data ? ((data.denials.length / ((data.sessions.length + data.denials.length) || 1)) * 100) : 0;
                        const longSessions = data ? data.sessions.filter(s => (s.duration || 0) > 480).length : 0;
                        const longPct = data ? Math.round((longSessions / (data.sessions.length || 1)) * 100) : 0;
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
