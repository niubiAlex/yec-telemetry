/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  // Installers live in the yec-installers Blob store. Served through this
  // domain too, so clients that cannot reach the Blob host directly can still
  // download (yec.askheadline.com/dl/...).
  async rewrites() {
    return [{ source: "/dl/:path*", destination: "https://rs0hfs39m2puj2ay.public.blob.vercel-storage.com/:path*" }];
  },
};
