import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@nrs/collision",
    "@nrs/db",
    "@nrs/domain",
    "@nrs/geometry",
    "@nrs/guidance",
    "@nrs/planner",
    "@nrs/playback",
    "@nrs/simulator",
    "@nrs/vehicle-catalog",
    "@nrs/vehicle-model",
  ],
};

export default nextConfig;
