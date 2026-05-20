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
import type { Member, MemberInsert, MemberRole, MemberUpdate } from './types/database';

type GroupId = 1 | 2 | 3 | 4;
type AssignmentId = 0 | GroupId;
type GroupPowerRanges = Record<GroupId, { min: string; max: string }>;
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

const groups: Array<{
  id: GroupId;
  ar: string;
  en: string;
  accent: string;
  border: string;
  shadow: string;
  bg: string;
}> = [
  { id: 1, ar: 'المجموعة الأولى', en: 'Group 1', accent: 'text-cyan-200', border: 'border-cyan-300/60', shadow: 'shadow-cyanGlow', bg: 'bg-cyan-300/10' },
  { id: 2, ar: 'المجموعة الثانية', en: 'Group 2', accent: 'text-emerald-200', border: 'border-emerald-300/60', shadow: 'shadow-emeraldGlow', bg: 'bg-emerald-300/10' },
  { id: 3, ar: 'المجموعة الثالثة', en: 'Group 3', accent: 'text-amber-200', border: 'border-amber-300/60', shadow: 'shadow-amberGlow', bg: 'bg-amber-300/10' },
  { id: 4, ar: 'المجموعة الرابعة', en: 'Group 4', accent: 'text-rose-200', border: 'border-rose-300/60', shadow: 'shadow-roseGlow', bg: 'bg-rose-300/10' },
];

const unassignedGroup = {
  id: 0 as const,
  ar: 'قائمة الانتظار',
  en: 'Unassigned Pool',
  accent: 'text-violet-200',
  border: 'border-violet-300/60',
  shadow: 'shadow-[0_0_22px_rgba(196,181,253,0.22)]',
  bg: 'bg-violet-300/10',
};

const defaultGroupPowerRanges: GroupPowerRanges = {
  1: { min: '0', max: '50M' },
  2: { min: '50M', max: '100M' },
  3: { min: '100M', max: '200M' },
  4: { min: '200M', max: '999B' },
};

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
  return {
    name: form.name.trim(),
    total_power: numberValue(form.total_power),
    legion_1: numberValue(form.legion_1),
    legion_2: numberValue(form.legion_2),
    legion_3: numberValue(form.legion_3),
    legion_4: numberValue(form.legion_4),
    group_id: form.group_id,
    role: form.role,
  };
}

function loadPowerRanges(): GroupPowerRanges {
  try {
    const saved = localStorage.getItem('samd-power-ranges');
    if (!saved) return defaultGroupPowerRanges;
    return { ...defaultGroupPowerRanges, ...JSON.parse(saved) } as GroupPowerRanges;
  } catch {
    return defaultGroupPowerRanges;
  }
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

async function exportAllianceExcel(groupedMembers: Record<GroupId, Member[]>) {
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [excelExporting, setExcelExporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const [powerRanges, setPowerRanges] = useState<GroupPowerRanges>(loadPowerRanges);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!authMode) return;

    async function loadMembers() {
      setLoading(true);
      const { data, error: loadError } = await supabase.from('members').select('*').order('created_at', { ascending: true });
      if (loadError) {
        setError(loadError.message);
      } else {
        setMembers(data ?? []);
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authMode]);

  useEffect(() => {
    localStorage.setItem('samd-power-ranges', JSON.stringify(powerRanges));
  }, [powerRanges]);

  const groupedMembers = useMemo(() => {
    return groups.reduce<Record<GroupId, Member[]>>(
      (acc, group) => {
        acc[group.id] = members
          .filter((member) => member.group_id === group.id)
          .sort((a, b) => {
            const rank = { Leader: 0, Deputy: 1, Member: 2 };
            return rank[a.role] - rank[b.role] || b.total_power - a.total_power || a.name.localeCompare(b.name);
          });
        return acc;
      },
      { 1: [], 2: [], 3: [], 4: [] },
    );
  }, [members]);

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
  }, [groupedMembers, members]);

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
      ? await supabase.from('members').update(payload as MemberUpdate).eq('id', editing.id)
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
    const { error: updateError } = await supabase.from('members').update(update).eq('id', member.id);
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

  function updatePowerRange(groupId: GroupId, key: 'min' | 'max', value: string) {
    setPowerRanges((current) => ({
      ...current,
      [groupId]: {
        ...current[groupId],
        [key]: value,
      },
    }));
  }

  async function autoBalance() {
    setBalancing(true);
    setError('');

    const totals: Record<GroupId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const updates: Array<{ member: Member; group_id: AssignmentId }> = [];
    const sorted = [...members].sort((a, b) => b.total_power - a.total_power);

    for (const member of sorted) {
      const matchingGroups = groups.filter((group) => {
        const min = numberValue(powerRanges[group.id].min);
        const max = numberValue(powerRanges[group.id].max);
        return member.total_power >= min && member.total_power <= max;
      });
      const target =
        matchingGroups.length > 0
          ? matchingGroups.reduce((lowest, group) => (totals[group.id] < totals[lowest] ? group.id : lowest), matchingGroups[0].id)
          : 0;

      if (target !== 0) totals[target] += member.total_power;
      if (member.group_id !== target) updates.push({ member, group_id: target });
    }

    for (const update of updates) {
      const { error: updateError } = await supabase.from('members').update({ group_id: update.group_id }).eq('id', update.member.id);
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
    return <Login onLogin={(mode) => setAuthMode(mode)} />;
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
          </div>

          <div className="flex flex-wrap gap-2">
            {!isViewer && (
              <>
                <button className="command-btn bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => openCreate()}>
                  <Plus size={17} /> عضو جديد في الانتظار | Add to Pool
                </button>
                <button className="command-btn border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" onClick={autoBalance} disabled={balancing || members.length === 0}>
                  {balancing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
                  توزيع تلقائي | Auto-Balance
                </button>
              </>
            )}
            <button className="command-btn border border-slate-600 bg-slate-900 text-slate-200 hover:border-cyan-300/60" onClick={() => exportNode(dashboardRef.current, 'alliance-dashboard.png')}>
              <Download size={17} /> snapshot
            </button>
            <button className="command-btn border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" onClick={() => void runExcelExport('all', () => exportAllianceExcel(groupedMembers))} disabled={excelExporting !== null}>
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

        {!isViewer && <section className="mb-5 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-50">
                <SlidersHorizontal size={18} className="text-cyan-200" />
                قواعد التوزيع التلقائي | Auto Power Rules
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                حدد مدى القوة لكل مجموعة. أي عضو خارج كل المديات سيبقى في قائمة الانتظار.
              </p>
            </div>
            <button className="small-btn" onClick={() => setPowerRanges(defaultGroupPowerRanges)}>
              Reset
            </button>
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
                      value={powerRanges[group.id].min}
                      onChange={(event) => updatePowerRange(group.id, 'min', event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-400">إلى | Max</span>
                    <input
                      className="field py-2"
                      inputMode="decimal"
                      value={powerRanges[group.id].max}
                      onChange={(event) => updatePowerRange(group.id, 'max', event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>}

        {loading ? (
          <div className="grid min-h-[45vh] place-items-center text-cyan-200">
            <Loader2 className="animate-spin" size={38} />
          </div>
        ) : (
          <>
          {!isViewer && <section className="mb-4">
            <GroupColumn
              group={unassignedGroup}
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
          </section>}
          <section className="grid gap-4 xl:grid-cols-4">
            {groups.map((group) => (
              <GroupColumn
                key={group.id}
                group={group}
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
              <Field label="الاسم | Name" name="name" value={form.name} onChange={updateForm} />
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
  group: (typeof groups)[number] | typeof unassignedGroup;
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
  elevated = false,
  onEdit,
  onDelete,
  onQuickUpdate,
  onExport,
  cardRef,
  readOnly,
}: {
  member: Member;
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
        {[member.legion_1, member.legion_2, member.legion_3, member.legion_4].map((value, index) => (
          <div key={index} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
            <p className="text-slate-500">L{index + 1}</p>
            <p className="font-bold text-slate-200" dir="ltr">
              {formatPower(value)}
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
