// expect(...) for the Node tests, with the matchers the browser tests use (Playwright's names), so a test
// reads the same in both places
import assert from 'node:assert/strict';

const matchObject = (actual, expected) => {
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `expected an object, got ${JSON.stringify(actual)}`);
    for (const [k, v] of Object.entries(expected)) matchObject(actual[k], v);
  } else assert.deepEqual(actual, expected);
};

function matchers(actual, not) {
  const check = (ok, message) => assert.ok(not ? !ok : ok, (not ? 'not: ' : '') + message);
  return {
    toBe: e => (not ? assert.notStrictEqual(actual, e) : assert.strictEqual(actual, e)),
    toEqual: e => (not ? assert.notDeepStrictEqual(actual, e) : assert.deepStrictEqual(actual, e)),
    toMatchObject: e => matchObject(actual, e),
    toBeGreaterThan: e => check(actual > e, `${actual} > ${e}`),
    toBeGreaterThanOrEqual: e => check(actual >= e, `${actual} >= ${e}`),
    toBeLessThan: e => check(actual < e, `${actual} < ${e}`),
    toBeLessThanOrEqual: e => check(actual <= e, `${actual} <= ${e}`),
    toBeCloseTo: (e, digits = 2) => check(Math.abs(actual - e) < 10 ** -digits / 2, `${actual} close to ${e}`),
    toContain: e => check(actual.includes(e), `${JSON.stringify(actual)} contains ${JSON.stringify(e)}`),
    toHaveLength: e => check(actual.length === e, `length ${actual.length} is ${e}`),
    toBeUndefined: () => check(actual === undefined, `${actual} is undefined`)
  };
}

export function expect(actual) {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) });
}
