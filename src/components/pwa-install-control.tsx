"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches;
}

export function PwaInstallControl() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneMode);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setDeferredPrompt(null);
      setIsStandalone(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (isStandalone) {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
        App instalado
      </span>
    );
  }

  if (!deferredPrompt) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;

        if (result.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      }}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
    >
      Instalar app
    </button>
  );
}
