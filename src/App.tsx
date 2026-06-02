import { ChangeEvent, FormEvent, MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Activity,
  BarChart3,
  Crown,
  Download,
  Edit3,
  FileSpreadsheet,
  Loader2,
  LogOut,
  Medal,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { BrandMark } from './components/BrandMark';
import { Login, type AuthMode } from './components/Login';
import type { LoginEvent, Member, MemberInsert, MemberRole, MemberUpdate } from './types/database';

type GroupId = number;
type AssignmentId = number;
type GroupPowerRanges = Record<number, { min: string; max: string }>;
type DashboardSettings = {
  group_count?: number;
  power_ranges?: Record<string, { min: string; max: string }>;
};
type MemberForm = {
  name: string;
  total_power: string;
  legion_1: string;
  legion_2: string;
  legion_3: string;
  legion_4: string;
  group_id: AssignmentId;
  role: MemberRole;
};

type MemberSnapshot = Pick<Member, 'legion_1' | 'legion_2' | 'legion_3' | 'legion_4' | 'total_power' | 'group_id' | 'role' | 'name'>;

const emptyForm: MemberForm = {
  name: '',
  total_power: '',
  legion_1: '',
  legion_2: '',
  legion_3: '',
  legion_4: '',
  group_id: 0,
  role: 'Member',
};

type GroupDefinition = {
  id: GroupId;
  ar: string;
  en: string;
  accent: string;
  border: string;
  shadow: string;
  bg: string;
};

const SETTINGS_KEY = 'dashboard_config';

const groupStyles = [
  { accent: 'text-cyan-200', border: 'border-cyan-300/60', shadow: 'shadow-cyanGlow', bg: 'bg-cyan-300/10' },
  { accent: 'text-emerald-200', border: 'border-emerald-300/60', shadow: 'shadow-emeraldGlow', bg: 'bg-emerald-300/10' },
  { accent: 'text-amber-200', border: 'border-amber-300/60', shadow: 'shadow-amberGlow', bg: 'bg-amber-300/10' },
  { accent: 'text-rose-200', border: 'border-rose-300/60', shadow: 'shadow-roseGlow', bg: 'bg-rose-300/10' },
  { accent: 'text-violet-200', border: 'border-violet-300/60', shadow: 'shadow-[0_0_22px_rgba(196,181,253,0.22)]', bg: 'bg-violet-300/10' },
  { accent: 'text-sky-200', border: 'border-sky-300/60', shadow: 'shadow-[0_0_22px_rgba(125,211,252,0.22)]', bg: 'bg-sky-300/10' },
];

function createGroups(count: number): GroupDefinition[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const style = groupStyles[index % groupStyles.length];
    return {
      id,
      ar: `المجموعة ${id}`,
      en: `Group ${id}`,
      ...style,
    };
  });
}

const unassignedGroup = {
  id: 0 as const,
  ar: 'قائمة الانتظار',
  en: 'Unassigned Pool',
  accent: 'text-violet-200',
  border: 'border-violet-300/60',
  shadow: 'shadow-[0_0_22px_rgba(196,181,253,0.22)]',
  bg: 'bg-violet-300/10',
};

function defaultRangeForGroup(groupId: number) {
  const start = (groupId - 1) * 50;
  const end = groupId * 50;
  return { min: groupId === 1 ? '0' : `${start}M`, max: `${end}M` };
}

function autoBalancePower(member: Member) {
  return member.legion_1 ?? 0;
}

function groupRange(groupId: GroupId, powerRanges: GroupPowerRanges) {
  const range = powerRanges[groupId] ?? defaultRangeForGroup(groupId);
  const min = numberValue(range.min);
  const max = numberValue(range.max);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function rangeDistance(power: number, min: number, max: number) {
  if (power >= min && power <= max) return 0;
  return power < min ? min - power : power - max;
}

function bestGroupForPower(power: number, groups: GroupDefinition[], powerRanges: GroupPowerRanges, totals: Record<GroupId, number>) {
  return groups.reduce((best, group) => {
    const bestRange = groupRange(best.id, powerRanges);
    const currentRange = groupRange(group.id, powerRanges);
    const bestDistance = rangeDistance(power, bestRange.min, bestRange.max);
    const currentDistance = rangeDistance(power, currentRange.min, currentRange.max);

    if (currentDistance < bestDistance) return group;
    if (currentDistance > bestDistance) return best;
    return totals[group.id] < totals[best.id] ? group : best;
  }, groups[0]);
}

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '');
}

function editDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function memberNameMatchScore(query: string, member: Member) {
  const normalizedQuery = normalizeName(query);
  const normalizedName = normalizeName(member.name);
  if (normalizedQuery.length < 2 || normalizedName.length === 0) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.includes(normalizedQuery)) return 90 - Math.max(0, normalizedName.length - normalizedQuery.length);
  if (normalizedQuery.includes(normalizedName)) return 80 - Math.max(0, normalizedQuery.length - normalizedName.length);

  const distance = editDistance(normalizedQuery, normalizedName);
  const allowedDistance = Math.max(1, Math.floor(Math.max(normalizedQuery.length, normalizedName.length) * 0.3));
  return distance <= allowedDistance ? 70 - distance : 0;
}

function defaultPowerRanges(count: number): GroupPowerRanges {
  return createGroups(count).reduce<GroupPowerRanges>((acc, group) => {
    acc[group.id] = defaultRangeForGroup(group.id);
    return acc;
  }, {});
}

function normalizeGroupCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.round(parsed), 24) : 4;
}

function normalizePowerRanges(value: DashboardSettings['power_ranges'] | undefined, groupCount: number): GroupPowerRanges {
  const defaults = defaultPowerRanges(groupCount);
  if (!value) return defaults;

  return Object.entries(value).reduce<GroupPowerRanges>(
    (acc, [key, range]) => {
      const id = Number(key);
      if (Number.isFinite(id) && id > 0) {
        acc[id] = {
          min: range?.min ?? defaultRangeForGroup(id).min,
          max: range?.max ?? defaultRangeForGroup(id).max,
        };
      }
      return acc;
    },
    { ...defaults },
  );
}

const roleLabels: Record<MemberRole, string> = {
  Leader: 'القائد | Leader',
  Deputy: 'النائب | Deputy',
  Member: 'عضو | Member',
};

function numberValue(value: string) {
  const normalized = value.trim().replace(/,/g, '').replace(/\s/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kKmMbBtTم])?$/);
  if (!match) return 0;

  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === 'k'
      ? 1_000
      : suffix === 'm' || suffix === 'م'
        ? 1_000_000
        : suffix === 'b'
          ? 1_000_000_000
          : suffix === 't'
            ? 1_000_000_000_000
            : 1;
  const parsed = Number(match[1]) * multiplier;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function formatPower(value: number) {
  const abs = Math.abs(value);
  const units = [
    { value: 1_000_000_000_000, suffix: 'T' },
    { value: 1_000_000_000, suffix: 'B' },
    { value: 1_000_000, suffix: 'M' },
    { value: 1_000, suffix: 'K' },
  ];
  const unit = units.find((item) => abs >= item.value);
  if (!unit) return new Intl.NumberFormat('en-US').format(value);

  const compact = value / unit.value;
  const formatted = compact >= 100 ? compact.toFixed(0) : compact >= 10 ? compact.toFixed(1) : compact.toFixed(2);
  return `${formatted.replace(/\.0+$|(\.\d*[1-9])0+$/, '$1')}${unit.suffix}`;
}

function formFromMember(member: Member): MemberForm {
  return {
    name: member.name,
    total_power: String(member.total_power ?? 0),
    legion_1: String(member.legion_1 ?? 0),
    legion_2: String(member.legion_2 ?? 0),
    legion_3: String(member.legion_3 ?? 0),
    legion_4: String(member.legion_4 ?? 0),
    group_id: member.group_id,
    role: member.role,
  };
}

function payloadFromForm(form: MemberForm): MemberInsert {
  const legion_1 = numberValue(form.legion_1);
  const legion_2 = numberValue(form.legion_2);
  const legion_3 = numberValue(form.legion_3);
  const legion_4 = numberValue(form.legion_4);
  const total_power = numberValue(form.total_power);
  return {
    name: form.name.trim(),
    total_power,
    legion_1,
    legion_2,
    legion_3,
    legion_4,
    previous_legion_1: legion_1,
    previous_legion_2: legion_2,
    previous_legion_3: legion_3,
    previous_legion_4: legion_4,
    group_id: form.group_id,
    role: form.role,
    updated_at: new Date().toISOString(),
  };
}

function withUpdatedAt<T extends Record<string, unknown>>(value: T) {
  return {
    ...value,
    updated_at: new Date().toISOString(),
  };
}

function snapshotForUpdate(member: Member, update: MemberUpdate) {
  return withUpdatedAt({
    ...update,
    previous_legion_1: member.legion_1,
    previous_legion_2: member.legion_2,
    previous_legion_3: member.legion_3,
    previous_legion_4: member.legion_4,
  });
}

function loadPowerRanges(groupCount: number): GroupPowerRanges {
  try {
    const saved = localStorage.getItem('samd-power-ranges');
    if (!saved) return defaultPowerRanges(groupCount);
    return { ...defaultPowerRanges(groupCount), ...JSON.parse(saved) } as GroupPowerRanges;
  } catch {
    return defaultPowerRanges(groupCount);
  }
}

function loadGroupCount() {
  const saved = Number(localStorage.getItem('samd-group-count'));
  return normalizeGroupCount(saved);
}

function legionDelta(current: number, previous: number) {
  return current - previous;
}

function formatDelta(value: number) {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${formatPower(value)}`;
}

async function exportNode(node: HTMLElement | null, fileName: string) {
  if (!node) return;
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#020617',
  });
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

function excelRowsForGroup(groupName: string, members: Member[]) {
  const leader = members.find((member) => member.role === 'Leader');
  const deputy = members.find((member) => member.role === 'Deputy');
  const regularMembers = members.filter((member) => member.role === 'Member');
  const header = ['الاسم', 'القوة الإجمالية', 'الفيلق الأول', 'الفيلق الثاني', 'الفيلق الثالث'];
  const memberRow = (member: Member) => [
    member.name,
    formatPower(member.total_power),
    formatPower(member.legion_1),
    formatPower(member.legion_2),
    formatPower(member.legion_3),
  ];

  return [
    ['abdallah atwan GOV'],
    [groupName],
    [],
    ['القائد'],
    header,
    ...(leader ? [memberRow(leader)] : [['لا يوجد قائد', '', '', '', '']]),
    [],
    ['النائب'],
    header,
    ...(deputy ? [memberRow(deputy)] : [['لا يوجد نائب', '', '', '', '']]),
    [],
    ['الأعضاء'],
    header,
    ...regularMembers.map(memberRow),
  ];
}

async function buildGroupWorksheet(groupName: string, members: Member[]) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('المجموعة', {
    views: [{ rightToLeft: true, showGridLines: false }],
  });

  worksheet.columns = [
    { width: 30 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];

  excelRowsForGroup(groupName, members).forEach((row) => worksheet.addRow(row));

  worksheet.mergeCells('A1:E1');
  worksheet.mergeCells('A2:E2');

  const border = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
  const fills = {
    brand: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDC2626' } },
    title: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } },
    section: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0E7490' } },
    header: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0F2FE' } },
    soft: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } },
  };

  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber <= 2 ? 28 : 22;
    row.eachCell((cell) => {
      cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
      cell.border = { top: border, left: border, bottom: border, right: border };
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF0F172A' } };
      cell.fill = fills.soft;
    });
  });

  worksheet.getCell('A1').fill = fills.brand;
  worksheet.getCell('A1').font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A2').fill = fills.title;
  worksheet.getCell('A2').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };

  [4, 8, 12].forEach((rowNumber) => {
    worksheet.mergeCells(`A${rowNumber}:E${rowNumber}`);
    const cell = worksheet.getCell(`A${rowNumber}`);
    cell.fill = fills.section;
    cell.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  });

  [5, 9, 13].forEach((rowNumber) => {
    worksheet.getRow(rowNumber).eachCell((cell) => {
      cell.fill = fills.header;
      cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0F172A' } };
    });
  });

  worksheet.autoFilter = { from: 'A13', to: 'E13' };
  worksheet.views = [{ rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: 2 }];

  return workbook;
}

async function exportGroupExcel(groupName: string, members: Member[], fileName: string) {
  const workbook = await buildGroupWorksheet(groupName, members);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, fileName);
}

async function exportAllianceExcel(groups: GroupDefinition[], groupedMembers: Record<GroupId, Member[]>) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'abdallah atwan GOV';

  for (const group of groups) {
    const groupWorkbook = await buildGroupWorksheet(group.ar, groupedMembers[group.id]);
    const source = groupWorkbook.getWorksheet('المجموعة');
    if (!source) continue;
    const worksheet = workbook.addWorksheet(group.ar, {
      views: [{ rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: 2 }],
    });
    worksheet.model = { ...source.model, id: worksheet.id, name: group.ar };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, 'مجموعات-التحالف.xlsx');
}

function downloadBlob(data: BlobPart, fileName: string) {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(() => {
    const savedMode = localStorage.getItem('samd-auth-mode') as AuthMode | null;
    if (savedMode === 'admin' || savedMode === 'viewer') return savedMode;
    return localStorage.getItem('samd-authenticated') === 'true' ? 'admin' : null;
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [groupCount, setGroupCount] = useState(loadGroupCount);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [excelExporting, setExcelExporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [powerRanges, setPowerRanges] = useState<GroupPowerRanges>(() => loadPowerRanges(groupCount));
  const dashboardRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const groups = useMemo(() => createGroups(groupCount), [groupCount]);
  const nameMatches = useMemo(() => {
    if (!modalOpen || editing) return [];
    return members
      .map((member) => ({ member, score: memberNameMatchScore(form.name, member) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name))
      .slice(0, 5)
      .map((item) => item.member);
  }, [editing, form.name, members, modalOpen]);

  useEffect(() => {
    if (!authMode) return;

    async function loadMembers() {
      setLoading(true);
      const [{ data, error: loadError }, { data: eventsData }, { data: settingsData }] = await Promise.all([
        supabase.from('members').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('login_events').select('*').order('created_at', { ascending: false }).limit(12),
        supabase.from('app_settings').select('*').eq('key', SETTINGS_KEY).maybeSingle(),
      ]);
      if (loadError) {
        setError(loadError.message);
      } else {
        setMembers(data ?? []);
        setLoginEvents(eventsData ?? []);
        if (settingsData?.value) {
          const settings = settingsData.value as DashboardSettings;
          const nextCount = normalizeGroupCount(settings.group_count);
          setGroupCount(nextCount);
          setPowerRanges(normalizePowerRanges(settings.power_ranges, nextCount));
          localStorage.setItem('samd-group-count', String(nextCount));
          localStorage.setItem('samd-power-ranges', JSON.stringify(normalizePowerRanges(settings.power_ranges, nextCount)));
        }
      }
      setLoading(false);
    }

    void loadMembers();

    const channel = supabase
      .channel('members-realtime-command')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (payload) => {
        setMembers((current) => {
          if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Member;
            return current.some((member) => member.id === inserted.id) ? current : [...current, inserted];
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Member;
            return current.map((member) => (member.id === updated.id ? updated : member));
          }

          if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Pick<Member, 'id'>;
            return current.filter((member) => member.id !== deleted.id);
          }

          return current;
        });
      })
      .subscribe();

    const loginChannel = supabase
      .channel('login-events-realtime-command')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_events' }, (payload) => {
        setLoginEvents((current) => [payload.new as LoginEvent, ...current].slice(0, 12));
      })
      .subscribe();

    const settingsChannel = supabase
      .channel('app-settings-realtime-command')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (payload) => {
        const setting = payload.new as { key?: string; value?: DashboardSettings };
        if (setting.key !== SETTINGS_KEY || !setting.value) return;
        const nextCount = normalizeGroupCount(setting.value.group_count);
        const nextRanges = normalizePowerRanges(setting.value.power_ranges, nextCount);
        setGroupCount(nextCount);
        setPowerRanges(nextRanges);
        localStorage.setItem('samd-group-count', String(nextCount));
        localStorage.setItem('samd-power-ranges', JSON.stringify(nextRanges));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(loginChannel);
      void supabase.removeChannel(settingsChannel);
    };
  }, [authMode]);

  useEffect(() => {
    localStorage.setItem('samd-power-ranges', JSON.stringify(powerRanges));
  }, [powerRanges]);

  useEffect(() => {
    localStorage.setItem('samd-group-count', String(groupCount));
    setPowerRanges((current) => ({ ...defaultPowerRanges(groupCount), ...current }));
  }, [groupCount]);

  async function saveDashboardSettings(nextGroupCount: number, nextPowerRanges: GroupPowerRanges) {
    localStorage.setItem('samd-group-count', String(nextGroupCount));
    localStorage.setItem('samd-power-ranges', JSON.stringify(nextPowerRanges));

    const { error: settingsError } = await supabase.from('app_settings').upsert({
      key: SETTINGS_KEY,
      value: {
        group_count: nextGroupCount,
        power_ranges: nextPowerRanges,
      },
      updated_at: new Date().toISOString(),
    });

    if (settingsError) setError(settingsError.message);
  }

  const groupedMembers = useMemo(() => {
    return groups.reduce<Record<GroupId, Member[]>>((acc, group) => {
        acc[group.id] = members
          .filter((member) => member.group_id === group.id)
          .sort((a, b) => {
            const rank = { Leader: 0, Deputy: 1, Member: 2 };
            return rank[a.role] - rank[b.role] || b.total_power - a.total_power || a.name.localeCompare(b.name);
          });
        return acc;
      }, {});
  }, [groups, members]);

  const stats = useMemo(() => {
    const totalPower = members.reduce((sum, member) => sum + member.total_power, 0);
    const groupPowers = groups.map((group) => ({
      ...group,
      power: groupedMembers[group.id].reduce((sum, member) => sum + member.total_power, 0),
    }));
    const strongest = groupPowers.reduce((best, group) => (group.power > best.power ? group : best), groupPowers[0]);

    return {
      totalPower,
      strongest,
      memberCount: members.length,
      averagePower: members.length ? Math.round(totalPower / members.length) : 0,
      groupPowers,
    };
  }, [groupedMembers, groups, members]);

  const latestDataUpdate = useMemo(() => {
    return members.reduce<string | null>((latest, member) => {
      const current = member.updated_at ?? member.created_at;
      if (!current) return latest;
      if (!latest) return current;
      return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
    }, null);
  }, [members]);

  function openCreate(groupId: AssignmentId = 0) {
    setEditing(null);
    setForm({ ...emptyForm, group_id: groupId });
    setModalOpen(true);
  }

  function openEdit(member: Member) {
    setEditing(member);
    setForm(formFromMember(member));
    setModalOpen(true);
  }

  function useExistingMember(member: Member) {
    setEditing(member);
    setForm(formFromMember(member));
  }

  function updateForm(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === 'group_id' ? (Number(value) as AssignmentId) : value,
    }));
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = payloadFromForm(form);
    if (!payload.name) {
      setError('اسم العضو مطلوب | Member name is required');
      return;
    }

    setSaving(true);
    setError('');
    const response = editing
      ? await supabase.from('members').update(snapshotForUpdate(editing, payload as MemberUpdate)).eq('id', editing.id)
      : await supabase.from('members').insert(payload);

    if (response.error) {
      setError(response.error.message);
    } else {
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
    }
    setSaving(false);
  }

  async function deleteMember(member: Member) {
    const confirmed = window.confirm(`حذف ${member.name}؟ | Delete ${member.name}?`);
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from('members').delete().eq('id', member.id);
    if (deleteError) setError(deleteError.message);
  }

  async function quickUpdate(member: Member, update: MemberUpdate) {
    const { error: updateError } = await supabase.from('members').update(snapshotForUpdate(member, update)).eq('id', member.id);
    if (updateError) setError(updateError.message);
  }

  async function runExcelExport(key: string, action: () => Promise<void>) {
    setExcelExporting(key);
    setError('');
    try {
      await action();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'تعذر إنشاء ملف Excel');
    } finally {
      setExcelExporting(null);
    }
  }

  async function recordLogin(mode: AuthMode, username: string) {
    const { error: loginError } = await supabase.from('login_events').insert({ mode, username });
    if (loginError) {
      setError(loginError.message);
    }
  }

  function updatePowerRange(groupId: GroupId, key: 'min' | 'max', value: string) {
    const nextPowerRanges = {
      ...powerRanges,
      [groupId]: {
        ...(powerRanges[groupId] ?? defaultRangeForGroup(groupId)),
        [key]: value,
      },
    };
    setPowerRanges(nextPowerRanges);
    void saveDashboardSettings(groupCount, nextPowerRanges);
  }

  function updateGroupCount(value: string) {
    const nextGroupCount = normalizeGroupCount(value);
    const nextPowerRanges = { ...defaultPowerRanges(nextGroupCount), ...powerRanges };
    setGroupCount(nextGroupCount);
    setPowerRanges(nextPowerRanges);
    void saveDashboardSettings(nextGroupCount, nextPowerRanges);
  }

  function resetPowerRanges() {
    const nextPowerRanges = defaultPowerRanges(groupCount);
    setPowerRanges(nextPowerRanges);
    void saveDashboardSettings(groupCount, nextPowerRanges);
  }

  async function autoBalance() {
    setBalancing(true);
    setError('');

    const totals = groups.reduce<Record<GroupId, number>>((acc, group) => {
      acc[group.id] = 0;
      return acc;
    }, {});
    const updates: Array<{ member: Member; group_id: AssignmentId }> = [];
    const sorted = [...members].sort((a, b) => autoBalancePower(b) - autoBalancePower(a));

    for (const member of sorted) {
      const memberPower = autoBalancePower(member);
      const target = bestGroupForPower(memberPower, groups, powerRanges, totals).id;

      totals[target] += memberPower;
      if (member.group_id !== target) updates.push({ member, group_id: target });
    }

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('members')
        .update(snapshotForUpdate(update.member, { group_id: update.group_id }))
        .eq('id', update.member.id);
      if (updateError) {
        setError(updateError.message);
        break;
      }
    }

    setBalancing(false);
  }

  function logout() {
    localStorage.removeItem('samd-authenticated');
    localStorage.removeItem('samd-auth-mode');
    setAuthMode(null);
  }

  if (!authMode) {
    return (
      <Login
        onLogin={(mode, username) => {
          setAuthMode(mode);
          void recordLogin(mode, username);
        }}
      />
    );
  }

  const isViewer = authMode === 'viewer';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_8%_12%,rgba(34,211,238,0.2),transparent_28%),radial-gradient(circle_at_86%_10%,rgba(220,38,38,0.18),transparent_25%),radial-gradient(circle_at_55%_100%,rgba(16,185,129,0.12),transparent_26%),linear-gradient(180deg,#020617,#111827_48%,#020617)]" />
      <div className="fixed inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.75)_1px,transparent_1px)] [background-size:32px_32px]" />

      <div ref={dashboardRef} className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8" dir="rtl">
        <header className="mb-5 flex flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/66 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-4">
              <BrandMark compact />
            </div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-cyan-300" dir="ltr">
              <Radio size={15} /> Strategic Alliance Command
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">لوحة إدارة التحالف الاستراتيجي</h1>
            <p className="mt-2 text-sm text-slate-400" dir="ltr">
              Live bilingual military operations dashboard
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500" dir="ltr">
              <span>Last data update: {latestDataUpdate ? new Date(latestDataUpdate).toLocaleString() : 'n/a'}</span>
              {members[0] && (
                <span>
                  Latest L1 delta: {formatDelta(legionDelta(members[0].legion_1, members[0].previous_legion_1 ?? members[0].legion_1))}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isViewer && (
              <button className="command-btn bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => openCreate()}>
                <Plus size={17} /> عضو جديد في الانتظار | Add to Pool
              </button>
            )}
            <button className="command-btn border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" onClick={autoBalance} disabled={balancing || members.length === 0}>
              {balancing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
              توزيع تلقائي | Auto-Balance
            </button>
            <button className="command-btn border border-slate-600 bg-slate-900 text-slate-200 hover:border-cyan-300/60" onClick={() => exportNode(dashboardRef.current, 'alliance-dashboard.png')}>
              <Download size={17} /> snapshot
            </button>
            <button className="command-btn border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" onClick={() => void runExcelExport('all', () => exportAllianceExcel(groups, groupedMembers))} disabled={excelExporting !== null}>
              {excelExporting === 'all' ? <Loader2 className="animate-spin" size={17} /> : <FileSpreadsheet size={17} />} Excel
            </button>
            <button className="icon-btn" onClick={logout} title="خروج | Logout">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 flex items-center justify-between gap-3 border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        {!isViewer && (
          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat icon={<Activity />} label="قوة التحالف | Total Power" value={formatPower(stats.totalPower)} />
            <Stat icon={<Shield />} label="أقوى مجموعة | Strongest" value={`${stats.strongest.ar} · ${formatPower(stats.strongest.power)}`} />
            <Stat icon={<Users />} label="عدد الأعضاء | Members" value={formatPower(stats.memberCount)} />
            <Stat icon={<BarChart3 />} label="متوسط القوة | Average" value={formatPower(stats.averagePower)} />
          </section>
        )}

        {authMode === 'admin' && (
          <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-50">سجل الدخول</h2>
                <p className="text-sm text-slate-400">آخر من دخل لوحة التحالف</p>
              </div>
              <span className="rounded-md bg-red-600 px-3 py-1 text-sm font-black text-white">GOV</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {loginEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className="font-black text-cyan-100">{event.username}</p>
                  <p className="mt-1 text-sm text-slate-400">{event.mode === 'admin' ? 'أدمن' : 'مشاهد'}</p>
                  <p className="mt-2 text-xs text-slate-500" dir="ltr">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              {loginEvents.length === 0 && <p className="text-sm text-slate-500">لا توجد تسجيلات دخول بعد</p>}
            </div>
          </section>
        )}

        <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-50">
                <SlidersHorizontal size={18} className="text-cyan-200" />
                قواعد التوزيع التلقائي | Auto Power Rules
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                حدد عدد المجموعات ومدى قوة الفيلق الأول لكل مجموعة. أي عضو خارج المديات سينتقل لأقل مجموعة حملًا.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-400">عدد المجموعات</span>
                <input
                  className="field w-28 py-2"
                  inputMode="numeric"
                  value={groupCount}
                  onChange={(event) => updateGroupCount(event.target.value)}
                />
              </label>
              <button className="small-btn" onClick={resetPowerRanges}>
                Reset
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {groups.map((group) => (
              <div key={group.id} className={`border ${group.border} ${group.bg} p-3`}>
                <p className={`mb-3 font-black ${group.accent}`}>
                  {group.ar} | {group.en}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">من | Min</span>
                    <input
                      className="field py-2"
                      inputMode="decimal"
                      value={(powerRanges[group.id] ?? defaultRangeForGroup(group.id)).min}
                      onChange={(event) => updatePowerRange(group.id, 'min', event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">إلى | Max</span>
                    <input
                      className="field py-2"
                      inputMode="decimal"
                      value={(powerRanges[group.id] ?? defaultRangeForGroup(group.id)).max}
                      onChange={(event) => updatePowerRange(group.id, 'max', event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        {loading ? (
          <div className="grid min-h-[45vh] place-items-center text-cyan-200">
            <Loader2 className="animate-spin" size={38} />
          </div>
        ) : (
          <>
          <section className="mb-4">
            <GroupColumn
              group={unassignedGroup}
              groups={groups}
              members={members
                .filter((member) => member.group_id === 0)
                .sort((a, b) => b.total_power - a.total_power || a.name.localeCompare(b.name))}
              power={members.filter((member) => member.group_id === 0).reduce((sum, member) => sum + member.total_power, 0)}
              onCreate={() => openCreate(0)}
              onEdit={openEdit}
              onDelete={deleteMember}
              onQuickUpdate={quickUpdate}
              onExport={() => exportNode(groupRefs.current[0], 'unassigned-pool.png')}
              onExcelExport={() => runExcelExport('group-0', () => exportGroupExcel(unassignedGroup.ar, members.filter((member) => member.group_id === 0), 'قائمة-الانتظار.xlsx'))}
              excelExporting={excelExporting === 'group-0'}
              groupRef={(node) => {
                groupRefs.current[0] = node;
              }}
              cardRefs={cardRefs}
              readOnly={isViewer}
            />
          </section>
          <section className="grid gap-4 xl:grid-cols-4">
            {groups.map((group) => (
              <GroupColumn
                key={group.id}
                group={group}
                groups={groups}
                members={groupedMembers[group.id]}
                power={stats.groupPowers.find((item) => item.id === group.id)?.power ?? 0}
                onCreate={() => openCreate(0)}
                onEdit={openEdit}
                onDelete={deleteMember}
                onQuickUpdate={quickUpdate}
                onExport={() => exportNode(groupRefs.current[group.id], `group-${group.id}.png`)}
                onExcelExport={() => runExcelExport(`group-${group.id}`, () => exportGroupExcel(group.ar, groupedMembers[group.id], `${group.ar}.xlsx`))}
                excelExporting={excelExporting === `group-${group.id}`}
                groupRef={(node) => {
                  groupRefs.current[group.id] = node;
                }}
                cardRefs={cardRefs}
                readOnly={isViewer}
              />
            ))}
          </section>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <form onSubmit={saveMember} className="w-full max-w-2xl border border-cyan-300/40 bg-slate-950 p-5 shadow-cyanGlow">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-2xl font-black">{editing ? 'تعديل عضو | Edit Member' : 'إضافة عضو | Add Member'}</h2>
                <p className="mt-1 text-sm text-slate-400">أدخل بيانات القوة والتوزيع القتالي | Enter tactical power data</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SmartNameField value={form.name} onChange={updateForm} matches={nameMatches} onUseExisting={useExistingMember} />
              <Field label="القوة الكلية | Total Power" name="total_power" value={form.total_power} onChange={updateForm} inputMode="decimal" placeholder="مثال: 22M" />
              <Field label="الفيلق 1 | Legion 1" name="legion_1" value={form.legion_1} onChange={updateForm} inputMode="decimal" placeholder="مثال: 5.5M" />
              <Field label="الفيلق 2 | Legion 2" name="legion_2" value={form.legion_2} onChange={updateForm} inputMode="decimal" placeholder="مثال: 3M" />
              <Field label="الفيلق 3 | Legion 3" name="legion_3" value={form.legion_3} onChange={updateForm} inputMode="decimal" placeholder="مثال: 900K" />
              <Field label="الفيلق 4 | Legion 4" name="legion_4" value={form.legion_4} onChange={updateForm} inputMode="decimal" placeholder="مثال: 1.2M" />
              <Select label="المجموعة | Group" name="group_id" value={String(form.group_id)} onChange={updateForm} options={[unassignedGroup, ...groups].map((group) => ({ value: String(group.id), label: `${group.ar} | ${group.en}` }))} />
              <Select label="الدور | Role" name="role" value={form.role} onChange={updateForm} options={(Object.keys(roleLabels) as MemberRole[]).map((role) => ({ value: role, label: roleLabels[role] }))} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="command-btn border border-slate-700 bg-slate-900 text-slate-200" onClick={() => setModalOpen(false)}>
                إلغاء | Cancel
              </button>
              <button type="submit" className="command-btn bg-cyan-300 text-slate-950 hover:bg-cyan-200" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                حفظ | Save
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-slate-900/78 p-4">
      <div className="mb-3 flex items-center justify-between text-cyan-200">
        {icon}
        <span className="text-xs uppercase tracking-[0.24em]" dir="ltr">
          LIVE
        </span>
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-50" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function GroupColumn({
  group,
  groups,
  members,
  power,
  onCreate,
  onEdit,
  onDelete,
  onQuickUpdate,
  onExport,
  onExcelExport,
  excelExporting,
  groupRef,
  cardRefs,
  readOnly,
}: {
  group: GroupDefinition | typeof unassignedGroup;
  groups: GroupDefinition[];
  members: Member[];
  power: number;
  onCreate: () => void;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
  onQuickUpdate: (member: Member, update: MemberUpdate) => void;
  onExport: () => void;
  onExcelExport: () => void;
  excelExporting: boolean;
  groupRef: (node: HTMLDivElement | null) => void;
  cardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  readOnly: boolean;
}) {
  const leaders = members.filter((member) => member.role !== 'Member');
  const roster = members.filter((member) => member.role === 'Member');

  return (
    <article ref={groupRef} className={`min-h-[620px] rounded-lg border ${group.border} ${group.shadow} bg-slate-950/82 p-3`}>
      <div className={`mb-3 rounded-lg border ${group.border} ${group.bg} p-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-xl font-black ${group.accent}`}>{group.ar}</h2>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400" dir="ltr">
              {group.en}
            </p>
          </div>
          <div className="flex gap-1">
            {!readOnly && (
              <button className="icon-btn" onClick={onCreate} title="إضافة عضو | Add member">
                <Plus size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={onExport} title="تصدير المجموعة | Export group">
              <Download size={16} />
            </button>
            <button className="icon-btn" onClick={onExcelExport} disabled={excelExporting} title="تحميل Excel للمجموعة | Export group Excel">
              {excelExporting ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-700 bg-slate-950/55 p-2">
            <p className="text-slate-500">القوة | Power</p>
            <p className="font-bold text-slate-100" dir="ltr">
              {formatPower(power)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/55 p-2">
            <p className="text-slate-500">الأعضاء | Units</p>
            <p className="font-bold text-slate-100" dir="ltr">
              {members.length}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {leaders.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            groups={groups}
            elevated
            onEdit={onEdit}
            onDelete={onDelete}
            onQuickUpdate={onQuickUpdate}
            onExport={() => exportNode(cardRefs.current[member.id], `${member.name}-card.png`)}
            readOnly={readOnly}
            cardRef={(node) => {
              cardRefs.current[member.id] = node;
            }}
          />
        ))}

        <div className="pt-2">
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500" dir="ltr">
            Active Roster
          </p>
          <div className="space-y-2">
            {roster.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                groups={groups}
                onEdit={onEdit}
                onDelete={onDelete}
                onQuickUpdate={onQuickUpdate}
                onExport={() => exportNode(cardRefs.current[member.id], `${member.name}-card.png`)}
                readOnly={readOnly}
                cardRef={(node) => {
                  cardRefs.current[member.id] = node;
                }}
              />
            ))}
            {members.length === 0 && (
              <div className="border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">
                لا توجد وحدات بعد | No units assigned
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function MemberCard({
  member,
  groups,
  elevated = false,
  onEdit,
  onDelete,
  onQuickUpdate,
  onExport,
  cardRef,
  readOnly,
}: {
  member: Member;
  groups: GroupDefinition[];
  elevated?: boolean;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
  onQuickUpdate: (member: Member, update: MemberUpdate) => void;
  onExport: () => void;
  cardRef: (node: HTMLDivElement | null) => void;
  readOnly: boolean;
}) {
  const isLeader = member.role === 'Leader';

  return (
    <div ref={cardRef} className={`rounded-lg border bg-slate-900/88 p-3 ${elevated ? 'border-cyan-300/60 shadow-cyanGlow' : 'border-slate-800'}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`${elevated ? 'text-lg' : 'text-base'} truncate font-black text-slate-50`}>{member.name}</h3>
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${isLeader ? 'border-amber-300/60 bg-amber-300/10 text-amber-200' : elevated ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-200' : 'border-slate-700 text-slate-300'}`}>
              {isLeader ? <Crown size={12} /> : elevated ? <Medal size={12} /> : <Shield size={12} />}
              {roleLabels[member.role]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500" dir="ltr">
            ID {member.id.slice(0, 8)}
          </p>
        </div>
        <button className="icon-btn" onClick={onExport} title="تصدير البطاقة | Export card">
          <Download size={15} />
        </button>
      </div>

      <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
        <p className="text-xs text-slate-500">القوة الكلية | Total Power</p>
        <p className="text-xl font-black text-cyan-100" dir="ltr">
          {formatPower(member.total_power)}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        {[
          [member.legion_1, member.previous_legion_1],
          [member.legion_2, member.previous_legion_2],
          [member.legion_3, member.previous_legion_3],
          [member.legion_4, member.previous_legion_4],
        ].map(([value, previous], index) => (
          <div key={index} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            <p className="text-slate-500">L{index + 1}</p>
            <p className="font-bold text-slate-200" dir="ltr">
              {formatPower(value)}
            </p>
            <p className={`mt-1 text-[11px] ${legionDelta(value, previous ?? value) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`} dir="ltr">
              {formatDelta(legionDelta(value, previous ?? value))}
            </p>
          </div>
        ))}
      </div>

      {!readOnly && <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select className="mini-select" value={member.role} onChange={(event) => onQuickUpdate(member, { role: event.target.value as MemberRole })}>
            {(Object.keys(roleLabels) as MemberRole[]).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          <select className="mini-select" value={member.group_id} onChange={(event) => onQuickUpdate(member, { group_id: Number(event.target.value) as AssignmentId })}>
            {[unassignedGroup, ...groups].map((group) => (
              <option key={group.id} value={group.id}>
                {group.en}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="small-btn" onClick={() => onEdit(member)}>
            <Edit3 size={14} /> تعديل
          </button>
          <button className="small-btn border-rose-400/40 text-rose-200 hover:bg-rose-500/10" onClick={() => onDelete(member)}>
            <Trash2 size={14} /> حذف
          </button>
        </div>
      </div>}
    </div>
  );
}

function SmartNameField({
  value,
  onChange,
  matches,
  onUseExisting,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  matches: Member[];
  onUseExisting: (member: Member) => void;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-2 block text-sm text-slate-300">الاسم | Name</span>
      <input name="name" value={value} onChange={onChange} className="field" />
      {matches.length > 0 && (
        <div className="mt-3 space-y-2 border border-cyan-300/25 bg-cyan-300/5 p-3">
          <p className="text-xs text-cyan-100">أسماء مشابهة موجودة | Similar saved members</p>
          {matches.map((member) => (
            <button
              key={member.id}
              type="button"
              className="w-full border border-slate-700 bg-slate-900/80 p-3 text-right transition hover:border-cyan-300/60 hover:bg-cyan-300/10"
              onClick={() => onUseExisting(member)}
            >
              <span className="block font-black text-slate-50">{member.name}</span>
              <span className="mt-1 block text-xs text-slate-400" dir="ltr">
                Total {formatPower(member.total_power)} · L1 {formatPower(member.legion_1)} · L2 {formatPower(member.legion_2)} · L3 {formatPower(member.legion_3)} · L4{' '}
                {formatPower(member.legion_4)}
              </span>
            </button>
          ))}
          <p className="text-xs text-slate-400">لإضافته كاسم جديد، أكمل الحفظ بدون اختيار أي اسم من القائمة.</p>
        </div>
      )}
    </label>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  inputMode?: 'numeric' | 'decimal' | 'text';
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input name={name} value={value} onChange={onChange} inputMode={inputMode} placeholder={placeholder} className="field" />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <select name={name} value={value} onChange={onChange} className="field">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
