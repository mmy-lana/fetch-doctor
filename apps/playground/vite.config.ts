import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fetch-doctor/react': path.resolve(__dirname, '../../packages/react/src/index.ts'),
      '@fetch-doctor/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@fetch-doctor/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
