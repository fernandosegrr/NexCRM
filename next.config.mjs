/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build self-contained server for Docker / EasyPanel
  output: "standalone",
  experimental: {
    // Habilita src/instrumentation.ts (en Next 14 no es default; sí en Next 15)
    instrumentationHook: true,
    // Keep these out of the bundle so native/engine files load from node_modules at runtime
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs", "pg"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
