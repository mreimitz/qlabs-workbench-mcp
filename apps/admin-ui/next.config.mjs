const nextConfig = {
  images: {
    localPatterns: [
      { pathname: "/api/assets/files/**" },
      { pathname: "/api/qps-assets/file" },
    ],
  },
  output: "standalone",
};

export default nextConfig;
