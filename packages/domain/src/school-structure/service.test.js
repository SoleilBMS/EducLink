const test = require('node:test');
const assert = require('node:assert/strict');

const { SchoolStructureRepository } = require('./repository');
const { SchoolStructureService } = require('./service');

function createService() {
  const repository = new SchoolStructureRepository({
    school: [{ id: 'school-a', tenant_id: 'school-a', name: 'School A', created_at: '', updated_at: '' }],
    academic_year: [
      {
        id: 'year-a-1',
        tenant_id: 'school-a',
        school_id: 'school-a',
        name: '2025-2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
        is_current: true,
        created_at: '',
        updated_at: ''
      }
    ]
  });

  return new SchoolStructureService(repository);
}

test('create/update/list academic year for tenant', () => {
  const service = createService();

  const created = service.create('academic_year', 'school-a', {
    school_id: 'school-a',
    name: '2026-2027',
    start_date: '2026-09-01',
    end_date: '2027-06-30',
    is_current: false
  });

  assert.equal(created.ok, true);
  assert.equal(service.list('academic_year', 'school-a').length, 2);

  const updated = service.update('academic_year', 'school-a', created.data.id, {
    name: '2026/2027'
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.data.name, '2026/2027');
});

test('tenant isolation blocks cross-tenant update/delete', () => {
  const service = createService();

  const update = service.update('academic_year', 'school-b', 'year-a-1', { name: 'hack' });
  assert.equal(update.ok, false);
  assert.equal(update.code, 'NOT_FOUND');

  const deletion = service.delete('academic_year', 'school-b', 'year-a-1');
  assert.equal(deletion.ok, false);
  assert.equal(deletion.code, 'NOT_FOUND');
});

test('validation rejects invalid term dates', () => {
  const service = createService();
  const result = service.create('term', 'school-a', {
    academic_year_id: 'year-a-1',
    name: 'T1',
    start_date: 'invalid',
    end_date: '2026-12-01',
    order_index: 1
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.ok(result.errors.some((error) => error.includes('start_date')));
});
