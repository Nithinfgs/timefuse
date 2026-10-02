import { X509Certificate } from 'node:crypto';
import { daysBetween, startOfDay } from '../dates.js';
import { inWindow, isTestPath, lineAt } from './util.js';

const PEM = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
const JWT = /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*/g;

/** @param {string} subject */
function commonName(subject) {
  const cn = /CN=([^\n]+)/.exec(subject);
  return cn ? cn[1].trim() : subject.split('\n')[0].trim() || 'unnamed certificate';
}

/** @type {import('./util.js').Detector} */
export const certificates = {
  id: 'cert-expiry',
  appliesTo: () => true,
  scan({ path, text }, ctx) {
    if (!text.includes('BEGIN CERTIFICATE')) return [];
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    for (const m of text.matchAll(PEM)) {
      let cert;
      try {
        cert = new X509Certificate(m[0]);
      } catch {
        continue; // truncated or templated PEM
      }
      const date = startOfDay(cert.validToDate);
      if (!inWindow(date, ctx)) continue;
      const gone = daysBetween(date, ctx.asOf) <= 0;
      out.push({
        rule: 'cert-expiry',
        date,
        file: path,
        line: lineAt(text, m.index ?? 0),
        confidence: isTestPath(path) ? 'medium' : 'high',
        title: `Certificate "${commonName(cert.subject)}" ${gone ? 'has expired' : 'expires'}`,
        fix: 'Renew it, or load it from your secret store so rotation does not need a commit.',
      });
    }
    return out;
  },
};

/**
 * Decode a JWT payload without verifying anything. We only read `exp`.
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJwtPayload(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** @type {import('./util.js').Detector} */
export const jwts = {
  id: 'jwt-expiry',
  appliesTo: () => true,
  scan({ path, text }, ctx) {
    if (!text.includes('eyJ')) return [];
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    const testy = isTestPath(path);
    for (const m of text.matchAll(JWT)) {
      const payload = decodeJwtPayload(m[0]);
      const exp = payload?.exp;
      if (typeof exp !== 'number' || !Number.isFinite(exp)) continue;
      const date = startOfDay(new Date(exp * 1000));
      if (!inWindow(date, ctx)) continue;
      const gone = daysBetween(date, ctx.asOf) <= 0;
      if (testy && gone) continue; // expired tokens in tests are usually deliberate
      out.push({
        rule: 'jwt-expiry',
        date,
        file: path,
        line: lineAt(text, m.index ?? 0),
        confidence: testy ? 'medium' : 'high',
        title: `Hard-coded JWT (${m[0].slice(0, 10)}…) ${gone ? 'has expired' : 'expires'}`,
        fix: 'Tokens that live in source code also leak; issue them at runtime instead.',
      });
    }
    return out;
  },
};
