/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/search": [
      "./data/autumn26/ultimate-expanded.json",
      "./data/autumn26/embeddings.int16.gz",
    ],
  },
};

export default nextConfig;
