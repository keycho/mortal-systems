/** @type {import('next').NextConfig} */
const nextConfig = {
  // the site is static content; nothing here launches or manages identities
  transpilePackages: ["@mortal/schema"],
};

export default nextConfig;
