module.exports = {
  bail: false,
  verbose: true,
  testMatch: [
    // '**/packages/**/__tests__/**/*.test.js'

    '**/packages/api/**/__tests__/**/*.test.js',
    '**/packages/core/**/__tests__/**/*.test.js',
    '**/packages/errors/**/__tests__/**/*.test.js',
    '**/packages/framework/**/__tests__/**/*.test.js',
    '**/packages/internal-tracker/**/__tests__/**/*.test.js',
    '**/packages/pages/**/__tests__/**/*.test.js',
    '**/packages/rpc/**/__tests__/**/*.test.js',
    '**/packages/tracker/**/__tests__/**/*.test.js',
    '**/packages/vfs/**/__tests__/**/*.test.js',

  ],
  moduleFileExtensions: [
    'js',
    'json'
  ],
  coverageDirectory: '<rootDir>/.coverage',
  collectCoverageFrom: [
    'packages/**/lib/**/*.js',
    '!**/node_modules/**'
  ],
  watchman: false,
  setupTestFrameworkScriptFile: 'jest-extended'
}
