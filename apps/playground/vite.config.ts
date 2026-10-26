import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fetch-doctor/react': path.resolve(import.meta.dirname, '../../packages/react/src/index.ts'),
      '@fetch-doctor/core': path.resolve(import.meta.dirname, '../../packages/core/src/index.ts'),
      '@fetch-doctor/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
