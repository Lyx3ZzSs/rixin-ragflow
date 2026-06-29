import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@parent/(.*)$': '<rootDir>/../src/$1',
    '\\.(css|less|scss|sass)$': '<rootDir>/test/style-mock.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
        ],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  collectCoverageFrom: [],
};

export default config;
