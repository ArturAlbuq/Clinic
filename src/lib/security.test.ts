import assert from "node:assert/strict";
import test from "node:test";
import { buildSecurityHeaders } from "@/lib/security-headers";
import {
  MANAGER_APPROVAL_MAX_FAILED_ATTEMPTS,
  MANAGER_APPROVAL_WINDOW_MINUTES,
  getManagerApprovalWindowStart,
  isManagerApprovalRateLimited,
  normalizeManagerEmail,
} from "@/lib/manager-approval";

test("buildSecurityHeaders inclui hardening e origem do Supabase", () => {
  const headers = buildSecurityHeaders({
    isDevelopment: false,
    supabaseUrl: "https://clinic.supabase.co",
  });
  const policy = headers.find(
    (header) => header.key === "Content-Security-Policy",
  )?.value;

  assert.ok(policy);
  assert.match(policy ?? "", /default-src 'self'/);
  assert.match(policy ?? "", /frame-ancestors 'none'/);
  assert.match(policy ?? "", /object-src 'none'/);
  assert.match(
    policy ?? "",
    /connect-src 'self' https:\/\/clinic\.supabase\.co wss:\/\/clinic\.supabase\.co/,
  );
  assert.doesNotMatch(policy ?? "", /unsafe-eval/);
});

test("buildSecurityHeaders define os headers centrais do app shell", () => {
  const headers = buildSecurityHeaders({
    isDevelopment: false,
    supabaseUrl: "https://clinic.supabase.co",
  });

  assert.deepEqual(
    headers.map((header) => header.key),
    [
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ],
  );
});

test("normalizeManagerEmail padroniza o email gerencial", () => {
  assert.equal(
    normalizeManagerEmail("  Admin@Clinic.Local "),
    "admin@clinic.local",
  );
});

test("getManagerApprovalWindowStart usa a janela de lockout definida", () => {
  const nowMs = Date.parse("2026-03-29T21:00:00.000Z");
  const expected = new Date(
    nowMs - MANAGER_APPROVAL_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  assert.equal(getManagerApprovalWindowStart(nowMs), expected);
  assert.equal(MANAGER_APPROVAL_MAX_FAILED_ATTEMPTS, 5);
  assert.equal(isManagerApprovalRateLimited(4), false);
  assert.equal(isManagerApprovalRateLimited(5), true);
});
