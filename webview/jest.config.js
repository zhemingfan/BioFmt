// SPDX-License-Identifier: GPL-3.0-or-later

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Jest runs in CommonJS; the build tsconfig targets ESNext modules.
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020', 'dom', 'dom.iterable'],
        },
      },
    ],
  },
};
