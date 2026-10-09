"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMinutes = 5 }: { intervalMinutes?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [minutesAgo, setMinutesAgo] = useState(0);

  const refreshData = () => {
    startTransition(() => {
      router.refresh();
      setLastUpdated(new Date());
      setMinutesAgo(0);
    });
  };

  useEffect(() => {
    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(() => {
      refreshData();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [intervalMinutes]);

  useEffect(() => {
    const timer = setInterval(() => {
      const diffMin = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
      setMinutesAgo(diffMin);
    }, 30000);

    return () => clearInterval(timer);
  }, [lastUpdated]);

  return (
    <div className="flex items-center gap-2.5 text-xs text-[var(--color-mute)]">
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
        <span
          className={`h-2 w-2 rounded-full transition-colors ${
            isPending ? "bg-[var(--color-oak)] animate-ping" : "bg-[var(--color-good)]"
          }`}
          title="Atualização automática da página"
        />
        <span>
          {isPending
            ? "Atualizando dados..."
            : minutesAgo === 0
              ? `Atualizado agora · a cada ${intervalMinutes} min`
              : `Atualizado há ${minutesAgo}m · a cada ${intervalMinutes} min`}
        </span>
      </span>
      <button
        type="button"
        onClick={refreshData}
        disabled={isPending}
        className="rounded-md border border-[var(--color-line-strong)] bg-white px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink)] shadow-2xs transition hover:bg-[var(--color-surface)] disabled:opacity-50"
        title="Buscar vendas mais recentes imediatamente"
      >
        ↻ Atualizar agora
      </button>
    </div>
  );
}
