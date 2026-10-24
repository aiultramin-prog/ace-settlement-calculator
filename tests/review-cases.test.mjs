import test from 'node:test';
import assert from 'node:assert/strict';
import {parseText, calculate} from '../docs/engine.mjs';
import {createLocalApi} from '../docs/local-store.mjs';

const settle = raw => calculate(parseText(raw));

test('직수가 합계 뒤에 있어도 일반 지급으로 확정하지 않는다', () => {
  for (const raw of ['쿨노래방 1개 총5만원 직수', '킹스맨 1개 총6만원 직수']) {
    const result = settle(raw);
    assert.ok(result.total === null || result.total < 0, `${raw}: ${result.total}`);
  }
});

test('직수 한 건의 명시된 총액을 기본 금액으로 조용히 덮어쓰지 않는다', () => {
  const result = settle('쿨노래방 직수 1개 총6만원');
  assert.ok(result.total === null || result.total === -20000);
});

test('개수 앞의 취소·직수 부정도 확인이 필요한 내역으로 남긴다', () => {
  for (const raw of ['쿨노래방 취소 1개', '쿨노래방 직수 없음 1개', '쿨노래방 노쇼 1개', '쿨노래방 직수 못받음 1개', '쿨노래방 직수예정 1개']) {
    const result = settle(raw);
    assert.equal(result.total, null, raw);
    assert.ok(result.unresolved > 0, raw);
    assert.ok(result.rows.some(row => row.source.includes(raw)), raw);
  }
});

test('개수 앞 복합 금액을 일부만 읽어 직수 금액으로 확정하지 않는다', () => {
  for (const [raw, expected] of [
    ['쿨노래방 직수 6만5천원 1개', -25000],
    ['쿨노래방 직수 5만5천 1개', -15000],
    ['쿨노래방 직수 육만원 1개', -20000],
  ]) {
    const result = settle(raw);
    assert.ok(result.total === null || result.total === expected, `${raw}: ${result.total}`);
  }
});

test('직접 받은 내역을 일반 지급으로 조용히 확정하지 않는다', () => {
  const result = settle('쿨노래방 직접받음 1개 5만원');
  assert.ok(result.total === null || result.total === -10000);
});

test('혼합 반개·직수 계산은 각 작업의 금액표와 받은 총액을 구분한다', () => {
  const result = settle('쿨노래방 한개반 직수\n킹스맨 반개직수 3만원\n쿨노래방 2개 직수 10만원\n도파민 1개');
  assert.equal(result.total, -30000);
  assert.equal(result.direction, 'collect');
  assert.deepEqual(result.rows.map(row => row.amount), [-25000, -15000, -20000, 30000]);
  assert.match(result.copy_text, /선수에게 받을 돈 30,000원/);
});

test('뒤의 직수 메모가 어느 작업인지 불명확하면 최종 금액을 확정하지 않는다', () => {
  const result = settle('쿨노래방 1개\n킹스맨 1개\n직수');
  assert.equal(result.total, null);
  assert.equal(result.rows.filter(row => row.quantity === '1').length, 2);
  assert.ok(result.rows.some(row => row.source === '직수'));
});

test('기존 브라우저의 사용자 단가와 별칭을 유지하고 과거 기록을 재계산하지 않는다', async () => {
  const snapshot = {
    raw: '쿨노래방 직수 1개', copy_text: '이전에 저장한 결과 42,000원',
    total: 42000, subtotal: 42000, unresolved: 0, dates: {}, player: '',
  };
  const old = {
    rates: {'쿨노래방': {amount: 42000, note: '기존 사용자 단가'}},
    aliases: {'쿨': '쿨노래방'},
    records: [{id: 'old', created_at: '2026-01-01T00:00:00Z', snapshot}],
  };
  const values = new Map([['ace-settlement-github-v1', JSON.stringify(old)]]);
  const api = createLocalApi({getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)});
  assert.equal((await api('/api/parse', {raw: '쿨 직수 1개'})).total, -8000);
  assert.deepEqual((await api('/api/records/old')).snapshot, snapshot);
  await api('/api/rates', {name: '쿨노래방', amount: 43000, receipt_amount: 50000});
  assert.equal((await api('/api/parse', {raw: '쿨 직수 1개'})).total, -7000);
  assert.deepEqual((await api('/api/records/old')).snapshot, snapshot);
});
