const DEFAULT_CONNECT_SOURCES = ["'self'"];

function getSupabaseConnectSources(supabaseUrl?: string) {
  if (!supabaseUrl) {
    return [];
  }

  try {
    const origin = new URL(supabaseUrl).origin;
    const websocketOrigin = origin.replace(/^http/i, "ws");

    return [origin, websocketOrigin];
  } catch {
    return [];
  }
}

export function buildSecurityHeaders(options?: {
  isDevelopment?: boolean;
  supabaseUrl?: string;
}) {
  const isDevelopment = options?.isDevelopment ?? false;
  const connectSources = new Set([
    ...DEFAULT_CONNECT_SOURCES,
    ...getSupabaseConnectSources(options?.supabaseUrl),
  ]);

  if (isDevelopment) {
    connectSources.add("ws:");
    connectSources.add("wss:");
  }

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${Array.from(connectSources).join(" ")}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' blob: data:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");

  return [
    {
      key: "Content-Security-Policy",
      value: csp,
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=()",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
  ];
}

