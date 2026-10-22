/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Vite build and development server configuration with React plugin integration.
*/

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.VITE_HOST || '0.0.0.0';
  const port = parseInt(env.VITE_PORT || env.PORT || '1111', 10);

  // Check for SSL certificates in backend directory
  const backendDir = path.resolve(__dirname, '../backend');
  const certPath = path.resolve(backendDir, 'cert.pem');
  const keyPath = path.resolve(backendDir, 'key.pem');
  const hasSsl = fs.existsSync(certPath) && fs.existsSync(keyPath);

  let proxyTarget = env.VITE_PROXY_TARGET || (hasSsl ? 'https://127.0.0.1:1110' : 'http://127.0.0.1:1110');
  if (hasSsl && proxyTarget.startsWith('http://')) {
    proxyTarget = proxyTarget.replace('http://', 'https://');
  }

  return {
    plugins: [react()],
    server: {
      host,
      port,
      open: true,
      ...(hasSsl ? {
        https: {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        }
      } : {}),
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false, // Required for self-signed certificates
          configure: (proxy) => {
            proxy.on('error', (err, _req, _res) => {
              console.warn('[Vite Proxy] Backend connection error:', err.message);
            });
          }
        }
      }
    }
  };
});

