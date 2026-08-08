import { PHASE_PRODUCTION_BUILD } from "next/constants.js";

/**
 * the wall api url is baked into the bundle, so getting it wrong is a
 * deploy that cannot be fixed by changing a setting: it has to be built
 * again. the deployed site once spent three builds asking
 * http://127.0.0.1:4925 for its data while the variable was set
 * correctly in vercel, because turborepo's strict environment mode
 * stripped it before next ever ran and next inlines only what it can see.
 * so the value is checked here, at the one moment it is still possible
 * to refuse.
 */

const VAR = "NEXT_PUBLIC_WALL_API_URL";

/** a deploy is where a wrong url reaches the public; a local build is not */
function isDeployBuild(env) {
  return Boolean(env.VERCEL || env.WALL_STRICT_ENV === "1");
}

function assertWallApiUrl(env) {
  const value = env[VAR];
  const deploy = isDeployBuild(env);

  if (!value) {
    const message = [
      "",
      `================ ${VAR} is missing ================`,
      "the wall pages bake this url into the bundle at build time, so a",
      "build without it produces a site that can never reach the wall.",
      "",
      "if it IS set in the deploy platform and you are still reading this,",
      "the value is being dropped between the platform and next. the usual",
      "culprit is turborepo: declaring globalPassThroughEnv turns on strict",
      "environment mode, and a variable no task declares is removed before",
      "the task runs. turbo.json's build task declares NEXT_PUBLIC_* for",
      "exactly this reason.",
      "==========================================================",
      "",
    ].join("\n");
    if (deploy) {
      throw new Error(message);
    }
    // a local build is allowed to proceed: the localhost fallback is
    // compiled out of production bundles either way, so nothing here can
    // reach the public. it still says so, loudly.
    console.warn(message);
    console.warn(`local build: continuing without ${VAR}; the wall pages will have no api origin.`);
    return;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${VAR} is not a url: ${JSON.stringify(value)}`);
  }
  if (deploy && url.protocol !== "https:") {
    throw new Error(
      `${VAR} must be https on a deploy build (got ${url.protocol}//). the wall pages are served over https and a browser will refuse mixed content.`
    );
  }
  if (deploy && /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    throw new Error(
      `${VAR} points at ${url.hostname}, which is the viewer's own machine, not the wall.`
    );
  }
  console.log(`wall api: ${url.origin}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // the site is fully static content; nothing here launches or manages
  // identities, and there is no server, no analytics, no data collection
  output: "export",
  transpilePackages: ["@mortal/schema", "@mortal/blueprints", "@mortal/wall"],
};

export default function config(phase) {
  if (phase === PHASE_PRODUCTION_BUILD) assertWallApiUrl(process.env);
  return nextConfig;
}
