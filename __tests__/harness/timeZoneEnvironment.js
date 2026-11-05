/**
 * The phone's time zone for one test file (the device boundary for local time). Use it with the docblock
 *
 *   @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 *   @jest-environment-options {"timeZone": "Asia/Tokyo"}
 *
 * A test file cannot pin the zone itself: its `process.env` is a copy, so `process.env.TZ = ...` there never
 * reaches the worker's clock. This sets the worker's TZ for the file and puts it back afterwards, because a
 * worker runs other files after this one.
 */
const { TestEnvironment } = require('jest-environment-node');

module.exports = class TimeZoneEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    this.timeZone = config.projectConfig.testEnvironmentOptions.timeZone;
    if (!this.timeZone) throw new Error('timeZoneEnvironment needs @jest-environment-options {"timeZone": "..."}');
  }

  async setup() {
    this.previousTimeZone = process.env.TZ;
    process.env.TZ = this.timeZone;
    await super.setup();
  }

  async teardown() {
    if (this.previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTimeZone;
    await super.teardown();
  }
};
