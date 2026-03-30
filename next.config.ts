import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const securityHeaders = buildSecurityHeaders({
  isDevelopment: process.env.NODE_ENV !== "production",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
