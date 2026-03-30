"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AttentionAlertOptions = {
  alertIds: string[];
  body: string;
  count: number;
  title: string;
};

type AppBadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

type AttentionPermission = NotificationPermission | "unsupported";

function getNotificationPermission(): AttentionPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function useAttentionAlert(options: AttentionAlertOptions) {
  const { alertIds, body, count, title } = options;
  const [notificationPermission, setNotificationPermission] = useState<AttentionPermission>(
    getNotificationPermission,
  );
  const hasInitializedRef = useRef(false);
  const lastAlertKeyRef = useRef("");
  const originalFaviconHrefRef = useRef("");
  const originalTitleRef = useRef("");
  const previousPermissionRef = useRef<AttentionPermission>(notificationPermission);
  const titleIntervalRef = useRef<number | null>(null);

  const clearVisualSignals = useCallback(() => {
    if (titleIntervalRef.current !== null) {
      window.clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
    }

    if (originalTitleRef.current) {
      document.title = originalTitleRef.current;
    }

    if (originalFaviconHrefRef.current) {
      setFaviconHref(originalFaviconHrefRef.current);
    }

    void clearAppBadge();
  }, []);

  function startVisualAlert(alertTitle: string, alertCount: number) {
    const baseTitle = originalTitleRef.current || document.title;
    const originalFaviconHref =
      originalFaviconHrefRef.current || getOrCreateFaviconLink().href;
    const alertFaviconHref = createAlertFaviconHref(alertCount);
    let showAlert = true;

    document.title = `! ${alertTitle}`;
    setFaviconHref(alertFaviconHref);

    if (titleIntervalRef.current !== null) {
      window.clearInterval(titleIntervalRef.current);
    }

    titleIntervalRef.current = window.setInterval(() => {
      document.title = showAlert ? `! ${alertTitle}` : baseTitle;
      setFaviconHref(showAlert ? alertFaviconHref : originalFaviconHref);
      showAlert = !showAlert;
    }, 1200);
  }

  useEffect(() => {
    originalTitleRef.current = document.title;
    originalFaviconHrefRef.current = getOrCreateFaviconLink().href;

    return () => {
      if (titleIntervalRef.current !== null) {
        window.clearInterval(titleIntervalRef.current);
      }

      document.title = originalTitleRef.current || document.title;
      if (originalFaviconHrefRef.current) {
        setFaviconHref(originalFaviconHrefRef.current);
      }
      void clearAppBadge();
    };
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        clearVisualSignals();
      }
    }

    function handleFocus() {
      clearVisualSignals();
    }

    function handlePointerDown() {
      if (document.visibilityState === "visible") {
        clearVisualSignals();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [clearVisualSignals]);

  useEffect(() => {
    const alertKey = [...alertIds].sort().join("|");

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      lastAlertKeyRef.current = alertKey;
      return;
    }

    if (!alertKey) {
      lastAlertKeyRef.current = "";

      if (titleIntervalRef.current !== null) {
        clearVisualSignals();
      }

      return;
    }

    if (alertKey === lastAlertKeyRef.current) {
      return;
    }

    lastAlertKeyRef.current = alertKey;
    showSystemNotification(notificationPermission, title, body, alertKey);
    startVisualAlert(title, count);
    void setAppBadge(count);
  }, [
    alertIds,
    body,
    clearVisualSignals,
    count,
    notificationPermission,
    title,
  ]);

  useEffect(() => {
    if (
      notificationPermission === "granted" &&
      previousPermissionRef.current !== "granted" &&
      alertIds.length
    ) {
      showSystemNotification(notificationPermission, title, body, [...alertIds].sort().join("|"));
      startVisualAlert(title, count);
      void setAppBadge(count);
    }

    previousPermissionRef.current = notificationPermission;
  }, [alertIds, body, count, notificationPermission, title]);

  async function requestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return "unsupported";
    }

    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  }

  return {
    notificationPermission,
    requestNotificationPermission,
  };
}

async function setAppBadge(count: number) {
  const appBadgeNavigator = navigator as AppBadgeNavigator;

  if (!appBadgeNavigator.setAppBadge) {
    return;
  }

  try {
    await appBadgeNavigator.setAppBadge(count > 0 ? count : undefined);
  } catch {
    return;
  }
}

async function clearAppBadge() {
  const appBadgeNavigator = navigator as AppBadgeNavigator;

  if (appBadgeNavigator.clearAppBadge) {
    try {
      await appBadgeNavigator.clearAppBadge();
    } catch {
      return;
    }

    return;
  }

  if (appBadgeNavigator.setAppBadge) {
    try {
      await appBadgeNavigator.setAppBadge(0);
    } catch {
      return;
    }
  }
}

function showSystemNotification(
  permission: AttentionPermission,
  title: string,
  body: string,
  alertKey: string,
) {
  if (permission !== "granted" || typeof window === "undefined") {
    return;
  }

  try {
    const notification = new window.Notification(title, {
      badge: "/favicon.ico",
      body,
      icon: "/favicon.ico",
      requireInteraction: true,
      silent: false,
      tag: `clinic-attention-alert:${alertKey}`,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    return;
  }
}

function getOrCreateFaviconLink() {
  const existingLink = document.querySelector<HTMLLinkElement>("link[rel*='icon']");

  if (existingLink) {
    return existingLink;
  }

  const nextLink = document.createElement("link");
  nextLink.rel = "icon";
  document.head.appendChild(nextLink);
  return nextLink;
}

function setFaviconHref(href: string) {
  getOrCreateFaviconLink().href = href;
}

function createAlertFaviconHref(count: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const context = canvas.getContext("2d");

  if (!context) {
    return "/favicon.ico";
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f59e0b";
  context.beginPath();
  context.roundRect(4, 4, 56, 56, 16);
  context.fill();

  context.fillStyle = "#7c2d12";
  context.font = "bold 28px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(Math.min(count, 99)), 32, 34);

  return canvas.toDataURL("image/png");
}
