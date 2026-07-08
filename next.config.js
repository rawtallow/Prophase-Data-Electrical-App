/** @type {import('next').NextConfig} */

// Security headers applied to every response. script-src needs
// 'unsafe-inline' because Next.js App Router injects inline bootstrap
// scripts; the CSP still blocks external script hosts, framing, plugins,
// and non-self connections.
//
// 'unsafe-eval' is added to script-src ONLY outside production: Next.js dev
// mode's webpack devtool (eval-source-map) wraps every module in eval() to
// support fast rebuilds, and a strict CSP silently blocks that, which kills
// hydration in `next dev` with no console error. The production build
// (what Vercel actually serves) never calls eval(), so prod keeps the
// stricter policy.
const scriptSrc = process.env.NODE_ENV === 'production' ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
// upgrade-insecure-requests makes the browser rewrite every same-origin
// http:// navigation to https:// — correct on Vercel (always TLS), but it
// breaks `next dev` over plain HTTP: post-login navigation gets rewritten
// to https://localhost, which has nothing listening and fails outright, so
// you can never actually reach an authenticated page locally.
const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
];
if (process.env.NODE_ENV === 'production') cspDirectives.push('upgrade-insecure-requests');
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspDirectives.join('; ')
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
  }
];

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  }
};

module.exports = nextConfig;
