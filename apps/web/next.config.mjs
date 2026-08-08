/** @type {import('next').NextConfig} */
const nextConfig = {
  // the site is fully static content; nothing here launches or manages
  // identities, and there is no server, no analytics, no data collection
  output: "export",
  transpilePackages: ["@mortal/schema", "@mortal/blueprints", "@mortal/wall"],
};

export default nextConfig;
