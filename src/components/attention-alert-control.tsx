"use client";

import { useSyncExternalStore } from "react";

type Props = {
  notificationPermission: NotificationPermission | "unsupported";
  onRequestPermission: () => Promise<NotificationPermission | "unsupported">;
};

function subscribe() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function AttentionAlertControl({
  notificationPermission,
  onRequestPermission,
}: Props) {
  const isClient = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!isClient || notificationPermission === "unsupported") {
    return null;
  }

  if (notificationPermission === "granted") {
    return (
      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
        Notificacoes ativas
      </span>
    );
  }

  if (notificationPermission === "denied") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
        Notificacoes bloqueadas
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onRequestPermission();
      }}
      className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-50"
    >
      Ativar notificacoes
    </button>
  );
}
