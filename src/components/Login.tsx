import { FormEvent, useState } from 'react';
import { LockKeyhole, RadioTower, ShieldCheck } from 'lucide-react';
import { BrandMark } from './BrandMark';

export type AuthMode = 'admin' | 'viewer';

type LoginProps = {
  onLogin: (mode: AuthMode, username: string) => void;
};

const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '19200519200@@';
const VIEWER_PASSWORD = 'GOVNUM1';

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      localStorage.setItem('samd-authenticated', 'true');
      localStorage.setItem('samd-auth-mode', 'admin');
      onLogin('admin', username);
      return;
    }

    if (username.trim() && password === VIEWER_PASSWORD) {
      localStorage.setItem('samd-authenticated', 'true');
      localStorage.setItem('samd-auth-mode', 'viewer');
      onLogin('viewer', username.trim());
      return;
    }

    setError('بيانات الدخول غير صحيحة | Invalid command credentials');
  }

  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-slate-950 px-4 text-slate-100">
      <section className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(34,211,238,0.26),transparent_32%),radial-gradient(circle_at_82%_12%,rgba(220,38,38,0.22),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.16),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.34),rgba(2,6,23,1))]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:38px_38px]" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-lg border border-cyan-300/30 bg-slate-950/82 p-7 shadow-[0_0_46px_rgba(34,211,238,0.2)] backdrop-blur-xl"
      >
        <div className="mb-7">
          <BrandMark />
        </div>

        <div className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300" dir="ltr">
              Strategic Alliance
            </p>
            <h1 className="mt-3 text-3xl font-black">بوابة القيادة</h1>
            <p className="mt-2 text-sm text-slate-400" dir="ltr">
              Military Command Access Gate
            </p>
          </div>
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
            <RadioTower size={28} />
          </div>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm text-slate-300">اسم المستخدم | Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300"
            autoComplete="username"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-sm text-slate-300">كلمة المرور | Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300"
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mb-4 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-200"
        >
          <ShieldCheck size={18} />
          دخول غرفة العمليات | Enter Command
        </button>

        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500" dir="ltr">
          <LockKeyhole size={14} />
          Local admin gate active. Supabase realtime online.
        </div>
      </form>
    </main>
  );
}
