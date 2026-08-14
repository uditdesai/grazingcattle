import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Our workspace packages ship raw TypeScript (no build step of their
  // own) — this tells Next.js to run them through its own compiler rather
  // than expecting pre-built JS in node_modules.
  transpilePackages: ["@grazingcattle/game-types", "@grazingcattle/simulation"],
};

export default nextConfig;
