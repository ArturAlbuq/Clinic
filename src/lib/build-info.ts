import packageJson from "../../package.json";

function getShortCommitSha(commitSha?: string | null) {
  if (!commitSha) {
    return null;
  }

  return commitSha.slice(0, 7);
}

export function getBuildInfo() {
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    null;

  const deploymentUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    null;

  return {
    appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    commitSha,
    deploymentUrl,
    shortCommitSha: getShortCommitSha(commitSha),
    version: packageJson.version,
  };
}
