import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pg memakai dynamic require — jangan di-bundle oleh Turbopack.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
