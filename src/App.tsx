import { ChangeEvent, FormEvent, MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Activity,
  BarChart3,
  Crown,
  Download,
  Edit3,
  Loader2,
  LogOut,
  Medal,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { Login } from './components/Login';
import type { Member, MemberInsert, MemberRole, MemberUpdate } from './types/database';

type GroupId = 1 | 2 | 3 | 4;
type MemberForm = {
  name: string;
  total_power: string;
  legion_1: string;
  legion_2: string;
  legion_3: string;
  legion_4: string;
  group_id: GroupId;
  role: MemberRole;
};

const emptyForm: MemberForm = {
  name: '',
  total_power: '',
  legion_1: '',
  legion_2: '',
  legion_3: '',
  legion_4: '',
  group_id: 1,
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

const roleLabels: Record<MemberRole, string> = {
  Leader: 'القائد | Leader',
  Deputy: 'النائب | Deputy',
  Member: 'عضو | Member',
};

function numberValue(value: string) {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function formatPower(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
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

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem('samd-authenticated') === 'true');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<MemberForm>(emptyForm);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!authenticated) return;

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
  }, [authenticated]);

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

  function openCreate(groupId: GroupId = 1) {
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
      [name]: name === 'group_id' ? (Number(value) as GroupId) : value,
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

  async function autoBalance() {
    setBalancing(true);
    setError('');

    const totals: Record<GroupId, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const updates: Array<{ member: Member; group_id: GroupId }> = [];
    const sorted = [...members].sort((a, b) => b.total_power - a.total_power);

    for (const member of sorted) {
      const target = groups.reduce((lowest, group) => (totals[group.id] < totals[lowest] ? group.id : lowest), 1 as GroupId);
      totals[target] += member.total_power;
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
    setAuthenticated(false);
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[linear-gradient(120deg,rgba(8,47,73,0.22),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(225,29,72,0.13),transparent_24%),linear-gradient(180deg,#020617,#0f172a_52%,#020617)]" />
      <div className="fixed inset-0 -z-10 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.75)_1px,transparent_1px)] [background-size:36px_36px]" />

      <div ref={dashboardRef} className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8" dir="rtl">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-cyan-300" dir="ltr">
              <Radio size={15} /> Strategic Alliance Command
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">لوحة إدارة التحالف الاستراتيجي</h1>
            <p className="mt-2 text-sm text-slate-400" dir="ltr">
              Live bilingual military operations dashboard
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="command-btn bg-cyan-300 text-slate-950 hover:bg-cyan-200" onClick={() => openCreate()}>
              <Plus size={17} /> عضو جديد | Add
            </button>
            <button className="command-btn border border-emerald-300/50 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20" onClick={autoBalance} disabled={balancing || members.length === 0}>
              {balancing ? <Loader2 className="animate-spin" size={17} /> : <RefreshCw size={17} />}
              توزيع تلقائي | Auto-Balance
            </button>
            <button className="command-btn border border-slate-600 bg-slate-900 text-slate-200 hover:border-cyan-300/60" onClick={() => exportNode(dashboardRef.current, 'alliance-dashboard.png')}>
              <Download size={17} /> snapshot
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

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<Activity />} label="قوة التحالف | Total Power" value={formatPower(stats.totalPower)} />
          <Stat icon={<Shield />} label="أقوى مجموعة | Strongest" value={`${stats.strongest.ar} · ${formatPower(stats.strongest.power)}`} />
          <Stat icon={<Users />} label="عدد الأعضاء | Members" value={formatPower(stats.memberCount)} />
          <Stat icon={<BarChart3 />} label="متوسط القوة | Average" value={formatPower(stats.averagePower)} />
        </section>

        {loading ? (
          <div className="grid min-h-[45vh] place-items-center text-cyan-200">
            <Loader2 className="animate-spin" size={38} />
          </div>
        ) : (
          <section className="grid gap-4 xl:grid-cols-4">
            {groups.map((group) => (
              <GroupColumn
                key={group.id}
                group={group}
                members={groupedMembers[group.id]}
                power={stats.groupPowers.find((item) => item.id === group.id)?.power ?? 0}
                onCreate={() => openCreate(group.id)}
                onEdit={openEdit}
                onDelete={deleteMember}
                onQuickUpdate={quickUpdate}
                onExport={() => exportNode(groupRefs.current[group.id], `group-${group.id}.png`)}
                groupRef={(node) => {
                  groupRefs.current[group.id] = node;
                }}
                cardRefs={cardRefs}
              />
            ))}
          </section>
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
              <Field label="القوة الكلية | Total Power" name="total_power" value={form.total_power} onChange={updateForm} inputMode="numeric" />
              <Field label="الفيلق 1 | Legion 1" name="legion_1" value={form.legion_1} onChange={updateForm} inputMode="numeric" />
              <Field label="الفيلق 2 | Legion 2" name="legion_2" value={form.legion_2} onChange={updateForm} inputMode="numeric" />
              <Field label="الفيلق 3 | Legion 3" name="legion_3" value={form.legion_3} onChange={updateForm} inputMode="numeric" />
              <Field label="الفيلق 4 | Legion 4" name="legion_4" value={form.legion_4} onChange={updateForm} inputMode="numeric" />
              <Select label="المجموعة | Group" name="group_id" value={String(form.group_id)} onChange={updateForm} options={groups.map((group) => ({ value: String(group.id), label: `${group.ar} | ${group.en}` }))} />
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
  groupRef,
  cardRefs,
}: {
  group: (typeof groups)[number];
  members: Member[];
  power: number;
  onCreate: () => void;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
  onQuickUpdate: (member: Member, update: MemberUpdate) => void;
  onExport: () => void;
  groupRef: (node: HTMLDivElement | null) => void;
  cardRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
  const leaders = members.filter((member) => member.role !== 'Member');
  const roster = members.filter((member) => member.role === 'Member');

  return (
    <article ref={groupRef} className={`min-h-[620px] border ${group.border} ${group.shadow} bg-slate-950/82 p-3`}>
      <div className={`mb-3 border ${group.border} ${group.bg} p-3`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={`text-xl font-black ${group.accent}`}>{group.ar}</h2>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400" dir="ltr">
              {group.en}
            </p>
          </div>
          <div className="flex gap-1">
            <button className="icon-btn" onClick={onCreate} title="إضافة عضو | Add member">
              <Plus size={16} />
            </button>
            <button className="icon-btn" onClick={onExport} title="تصدير المجموعة | Export group">
              <Download size={16} />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-slate-700 bg-slate-950/55 p-2">
            <p className="text-slate-500">القوة | Power</p>
            <p className="font-bold text-slate-100" dir="ltr">
              {formatPower(power)}
            </p>
          </div>
          <div className="border border-slate-700 bg-slate-950/55 p-2">
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
}: {
  member: Member;
  elevated?: boolean;
  onEdit: (member: Member) => void;
  onDelete: (member: Member) => void;
  onQuickUpdate: (member: Member, update: MemberUpdate) => void;
  onExport: () => void;
  cardRef: (node: HTMLDivElement | null) => void;
}) {
  const isLeader = member.role === 'Leader';

  return (
    <div ref={cardRef} className={`border bg-slate-900/88 p-3 ${elevated ? 'border-cyan-300/60 shadow-cyanGlow' : 'border-slate-800'}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`${elevated ? 'text-lg' : 'text-base'} truncate font-black text-slate-50`}>{member.name}</h3>
            <span className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${isLeader ? 'border-amber-300/60 bg-amber-300/10 text-amber-200' : elevated ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-200' : 'border-slate-700 text-slate-300'}`}>
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

      <div className="mb-3 border border-slate-800 bg-slate-950/60 p-2">
        <p className="text-xs text-slate-500">القوة الكلية | Total Power</p>
        <p className="text-xl font-black text-cyan-100" dir="ltr">
          {formatPower(member.total_power)}
        </p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        {[member.legion_1, member.legion_2, member.legion_3, member.legion_4].map((value, index) => (
          <div key={index} className="border border-slate-800 bg-slate-950/50 p-2">
            <p className="text-slate-500">L{index + 1}</p>
            <p className="font-bold text-slate-200" dir="ltr">
              {formatPower(value)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <select className="mini-select" value={member.role} onChange={(event) => onQuickUpdate(member, { role: event.target.value as MemberRole })}>
            {(Object.keys(roleLabels) as MemberRole[]).map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
          <select className="mini-select" value={member.group_id} onChange={(event) => onQuickUpdate(member, { group_id: Number(event.target.value) as GroupId })}>
            {groups.map((group) => (
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
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  inputMode?: 'numeric';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-slate-300">{label}</span>
      <input name={name} value={value} onChange={onChange} inputMode={inputMode} className="field" />
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
