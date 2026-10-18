import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emailsMatch,
  optOutBlocked,
  phoneKey,
  phoneMatches,
  validateContact,
} from '../src/lib/contacts.js';

/**
 * Contact identity matching decides whether a website enquiry and an inbound WhatsApp
 * message become one person or two junk records, so the matchers are pure and tested
 * directly. INTERNATIONAL FORMATTING IS THE TRAP: the same phone number arrives with a
 * country code from WhatsApp, a local format from the form, and punctuation from everywhere.
 */

test('phoneKey keeps the last ten digits, deleting the country code', () => {
  assert.equal(phoneKey('+92 300 1234567'), '3001234567');
  assert.equal(phoneKey('0300-1234567'), '3001234567');
  assert.equal(phoneKey('(92) 300 1234567'), '3001234567');
  assert.equal(phoneKey('+923001234567'), '3001234567');
});

test('an incomplete phone is still usable at seven digits or more', () => {
  assert.equal(phoneKey('9300123'), '9300123');
  assert.equal(phoneKey('+92 300 12'), '9230012');
});

test('a too-short phone yields nothing', () => {
  assert.equal(phoneKey('123456'), '');
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey(null), '');
});

test('the same person matches across formatting', () => {
  assert.equal(phoneMatches('+923001234567', '0300 1234567'), true);
  assert.equal(phoneMatches('(0300) 123-4567', '+923001234567'), true);
});

test('a different person does not match, however the number is written', () => {
  assert.equal(phoneMatches('+923001234567', '+923007654321'), false);
});

test('a partial phone never matches a complete one other way around', () => {
  assert.equal(phoneMatches('1234567', '+923001234567'), false);
  assert.equal(phoneMatches('', '+923001234567'), false);
});

test('email matching is exact and case blind', () => {
  assert.equal(emailsMatch('BILAL@Northwind.example', 'bilal@northwind.example'), true);
  assert.equal(emailsMatch('bilal@northwind.example', 'bilkal@northwind.example'), false);
  assert.equal(emailsMatch('', 'bilal@northwind.example'), false);
  assert.equal(emailsMatch(' ', null), false);
});

test('validation wants a name and a well-formed identity', () => {
  assert.equal(validateContact({}).errors.name.length > 0, true);
  assert.equal(validateContact({ name: 'B' }).errors.name.length > 0, true);
  assert.deepEqual(validateContact({ name: 'Bilal Ahmed', email: 'not an email' }).errors, {
    email: 'Enter a valid email address',
  });
  assert.deepEqual(validateContact({ name: 'Bilal Ahmed', phone: '+923001234567' }).errors, {});
  assert.deepEqual(
    validateContact({ name: 'Bilal Ahmed', email: 'bilal@northwind.example', phone: '+923001234567' }).errors,
    {},
  );
});

test('validation accepts a later fill-in, not required on a patch', () => {
  const { errors } = validateContact({ name: 'Bilal Ahmed' }, { partial: true });

  assert.equal(Object.keys(errors).length, 0);
});

test('an opt-out stops messaging, and its absence does not', () => {
  assert.equal(optOutBlocked({ optOut: { whatsapp: true, at: '2026-10-18', reason: 'STOP' } }), true);
  assert.equal(optOutBlocked({ optOut: { whatsapp: false, at: null, reason: null } }), false);
  assert.equal(optOutBlocked(null), false);
});
