export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <div className="leading-none">
        <p className={`${compact ? 'text-lg' : 'text-3xl'} font-black uppercase tracking-wide text-white`}>
          abdallah atwan
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.28em] text-cyan-200">Alliance Strategy</p>
      </div>
      <span className={`${compact ? 'px-3 py-1 text-lg' : 'px-4 py-2 text-2xl'} rounded-md bg-red-600 font-black text-white shadow-[0_0_24px_rgba(220,38,38,0.42)]`}>
        GOV
      </span>
    </div>
  );
}
