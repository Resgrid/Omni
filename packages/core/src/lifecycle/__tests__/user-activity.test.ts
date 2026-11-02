import { getLastUserActivityAt, recordUserActivity, resetUserActivityForTests } from '../user-activity';

describe('user activity', () => {
  it('keeps the latest touch time and never moves backwards', () => {
    resetUserActivityForTests(1_000);
    expect(getLastUserActivityAt()).toBe(1_000);
    recordUserActivity(5_000);
    expect(getLastUserActivityAt()).toBe(5_000);
    recordUserActivity(4_000);
    expect(getLastUserActivityAt()).toBe(5_000);
  });
});
