/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build self-contained server for Docker / EasyPanel
  output: "standalone",
  experimental: {
    // Keep these out of the bundle so native/engine files load from node_modules at runtime
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "pg"],
  },
};

export default nextConfig;
