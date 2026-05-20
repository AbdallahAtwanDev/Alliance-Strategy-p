import { FormEvent, useState } from 'react';
import { LockKeyhole, RadioTower, ShieldCheck } from 'lucide-react';

type LoginProps = {
  onLogin: () => void;
};

const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '19200519200@@';

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      localStorage.setItem('samd-authenticated', 'true');
      onLogin();
      return;
    }

    setError('بيانات الدخول غير صحيحة | Invalid command credentials');
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-4">
      <section className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(244,63,94,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.4),rgba(2,6,23,1))]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md border border-cyan-400/30 bg-slate-950/88 p-8 shadow-cyanGlow backdrop-blur"
      >
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300" dir="ltr">
              Strategic Alliance
            </p>
            <h1 className="mt-3 text-3xl font-black">بوابة القيادة</h1>
            <p className="mt-2 text-sm text-slate-400" dir="ltr">
              Military Command Access Gate
            </p>
          </div>
          <div className="grid h-14 w-14 place-items-center border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
            <RadioTower size={28} />
          </div>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm text-slate-300">اسم المستخدم | Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300"
            autoComplete="username"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-2 block text-sm text-slate-300">كلمة المرور | Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-300"
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error && <p className="mb-4 border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 bg-cyan-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-200"
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
