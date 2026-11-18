import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanFields, validatePlanIds } from '../public/validation.js';

const T = '3F2B8C1E-5D4A-4B7E-9C2D-1A2B3C4D5E6F';

test('tenant and space IDs are optional UUIDs, stored in lower case', () => {
  assert.deepEqual(validatePlanIds({ tenantId: ` ${T} `, spaceId: '' }).value, { tenantId: T.toLowerCase(), spaceId: null });
  assert.deepEqual(validatePlanIds({ spaceId: null }).value, { spaceId: null });
  assert.deepEqual(validatePlanIds({}).value, {});
  assert.match(validatePlanIds({ tenantId: 'abc' }).error, /Tenant ID must be a UUID/);
  assert.match(validatePlanIds({ spaceId: '3f2b8c1e5d4a4b7e9c2d1a2b3c4d5e6f' }).error, /Space ID must be a UUID/);
});

test('new floor plans: IDs default to empty', () => {
  assert.deepEqual(validatePlanFields({ name: 'A', width: 1, height: 2 }).value, { name: 'A', width: 1, height: 2, tenantId: null, spaceId: null });
  assert.equal(validatePlanFields({ name: 'A', width: 1, height: 2, tenantId: T }).value.tenantId, T.toLowerCase());
  assert.match(validatePlanFields({ name: 'A', width: 1, height: 2, spaceId: 'x' }).error, /Space ID/);
});
