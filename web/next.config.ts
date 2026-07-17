import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Unngår at Turbopack gjetter feil workspace-rot pga. en urelatert
    // package-lock.json i hjemmemappa (utenfor dette prosjektet).
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
