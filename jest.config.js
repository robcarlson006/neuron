module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^pdfjs-dist/legacy/build/pdf.worker.min.mjs\\?url$': '<rootDir>/tests/__mocks__/pdfWorkerUrl.ts',
    '\\.(css|less|sass|scss)$': '<rootDir>/tests/__mocks__/styleMock.ts',
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/tests/__mocks__/fileMock.ts'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.test.tsx',
    '<rootDir>/tests/components/**/*.test.tsx',
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.tsx'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
}
