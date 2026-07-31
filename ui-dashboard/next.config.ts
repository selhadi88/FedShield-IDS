import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-ignore
  allowedDevOrigins: ['192.168.56.1', '192.168.1.62', 'localhost', '127.0.0.1', '10.0.233.85', '10.0.233.1', '192.168.1.58'],
};

export default nextConfig;
