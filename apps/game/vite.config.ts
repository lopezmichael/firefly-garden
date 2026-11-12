import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: portal zips and the Capacitor shell serve the build
  // from an arbitrary subdirectory.
  base: './',
  build: { target: 'es2022' },
});
