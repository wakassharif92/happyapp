import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions cap the request body at 1MB by default — a normal
    // phone photo (Report/Team Report forms, Support Chat's image
    // upload, all of which submit FormData straight to a server action)
    // routinely blows past that, and the whole request just fails
    // before the action's own code ever runs. Raised to cover a typical
    // phone photo with room to spare.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
