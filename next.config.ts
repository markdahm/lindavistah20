import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack's on-disk dev cache is an LSM tree that is never pruned. Left
    // on, it grew to 223 MB of memory-mapped tables between May and September
    // 2026; the compaction that finally merged them ran for 63 seconds and
    // took the machine down with it (see LESSONS.md, 2026-09-04). The app is
    // small enough that the cold-start saving is not worth that failure mode.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
