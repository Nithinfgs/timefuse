import { eolFinding, lines } from './util.js';

/** Docker image name -> [endoflife.date slug, display label]. */
const IMAGES = /** @type {Record<string, [string, string]>} */ ({
  node: ['nodejs', 'Node.js'],
  python: ['python', 'Python'],
  golang: ['go', 'Go'],
  ruby: ['ruby', 'Ruby'],
  php: ['php', 'PHP'],
  postgres: ['postgresql', 'PostgreSQL'],
  mysql: ['mysql', 'MySQL'],
  mongo: ['mongodb', 'MongoDB'],
  redis: ['redis', 'Redis'],
  nginx: ['nginx', 'nginx'],
  ubuntu: ['ubuntu', 'Ubuntu'],
  debian: ['debian', 'Debian'],
  alpine: ['alpine-linux', 'Alpine'],
});

/** .tool-versions / asdf plugin name -> slug + label. */
const TOOL_VERSIONS = /** @type {Record<string, [string, string]>} */ ({
  nodejs: ['nodejs', 'Node.js'],
  python: ['python', 'Python'],
  golang: ['go', 'Go'],
  ruby: ['ruby', 'Ruby'],
  php: ['php', 'PHP'],
  postgres: ['postgresql', 'PostgreSQL'],
});

/** GitHub Actions setup-* inputs. */
const SETUP_KEYS = /** @type {Record<string, [string, string]>} */ ({
  'node-version': ['nodejs', 'Node.js'],
  'python-version': ['python', 'Python'],
  'go-version': ['go', 'Go'],
  'ruby-version': ['ruby', 'Ruby'],
  'php-version': ['php', 'PHP'],
});

/** @param {string} raw */
function cleanVersion(raw) {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/^(python-|ruby-|node-|go)/i, '');
}

/** True when the string looks like a concrete version rather than an alias. */
/** @param {string} v */
function concrete(v) {
  return /^v?\d+(\.\d+|\.x|\.\*)*$/i.test(v);
}

/**
 * Pull the pinned major out of a semver range, but only when the range really
 * pins one release line ("20", "^20.1", "~18.2", "20.x"). Open-ended ranges
 * (">=18") are a support floor, not a pin, so they are ignored.
 * @param {string} range
 */
function pinnedFromRange(range) {
  const m = /^\s*[\^~=]?\s*v?(\d+(?:\.\d+)*)(?:\.x|\.\*)?\s*$/.exec(range);
  return m ? m[1] : null;
}

/** @type {import('./util.js').Detector} */
export const versionFiles = {
  id: 'runtime-eol',
  appliesTo: (p) =>
    /(^|\/)(\.nvmrc|\.node-version|\.python-version|\.ruby-version|\.tool-versions|runtime\.txt|go\.mod|package\.json|Pipfile|requirements[^/]*\.txt|Gemfile\.lock)$/.test(p),
  scan({ path, text }, ctx) {
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    const base = path.split('/').pop() ?? path;
    /** @param {string} product @param {string} label @param {string} version @param {number} line @param {string} where @param {'high'|'medium'} [confidence] */
    const push = (product, label, version, line, where, confidence = 'high') => {
      const f = eolFinding(ctx, { product, label, version, file: path, line, rule: 'runtime-eol', where, confidence });
      if (f) out.push(f);
    };

    if (base === '.nvmrc' || base === '.node-version') {
      for (const [n, l] of lines(text)) {
        const v = cleanVersion(l);
        if (concrete(v)) push('nodejs', 'Node.js', v, n, base);
      }
    } else if (base === '.python-version') {
      for (const [n, l] of lines(text)) {
        const v = cleanVersion(l);
        if (concrete(v)) push('python', 'Python', v, n, base);
      }
    } else if (base === '.ruby-version') {
      for (const [n, l] of lines(text)) {
        const v = cleanVersion(l);
        if (concrete(v)) push('ruby', 'Ruby', v, n, base);
      }
    } else if (base === 'runtime.txt') {
      for (const [n, l] of lines(text)) {
        const m = /^python-(\d+\.\d+(?:\.\d+)?)/.exec(l.trim());
        if (m) push('python', 'Python', m[1], n, 'runtime.txt');
      }
    } else if (base === '.tool-versions') {
      for (const [n, l] of lines(text)) {
        const m = /^\s*([a-z]+)\s+(\S+)/.exec(l);
        const tool = m && TOOL_VERSIONS[m[1]];
        if (m && tool && concrete(m[2])) push(tool[0], tool[1], m[2], n, '.tool-versions');
      }
    } else if (base === 'go.mod') {
      for (const [n, l] of lines(text)) {
        const m = /^go\s+(\d+\.\d+)/.exec(l.trim());
        if (m) push('go', 'Go', m[1], n, 'go.mod', 'medium');
      }
    } else if (base === 'Pipfile') {
      for (const [n, l] of lines(text)) {
        const m = /^python_version\s*=\s*["'](\d+\.\d+)["']/.exec(l.trim());
        if (m) push('python', 'Python', m[1], n, 'Pipfile');
      }
    } else if (base === 'package.json') {
      for (const [n, l] of lines(text)) {
        const m = /"node"\s*:\s*"([^"]+)"/.exec(l);
        const pinned = m && pinnedFromRange(m[1]);
        if (pinned) push('nodejs', 'Node.js', pinned, n, 'package.json engines');
      }
    } else if (/^requirements/.test(base)) {
      for (const [n, l] of lines(text)) {
        const m = /^django\s*==\s*(\d+\.\d+)/i.exec(l.trim());
        if (m) push('django', 'Django', m[1], n, base);
      }
    } else if (base === 'Gemfile.lock') {
      for (const [n, l] of lines(text)) {
        const m = /^\s{4}rails \((\d+\.\d+)/.exec(l);
        if (m) push('rails', 'Rails', m[1], n, 'Gemfile.lock');
      }
    }
    return out;
  },
};

/**
 * Split "registry.io/library/node:20-alpine@sha256:..." into name + tag.
 * @param {string} ref
 */
export function parseImageRef(ref) {
  const noDigest = ref.split('@')[0];
  const slash = noDigest.lastIndexOf('/');
  const colon = noDigest.indexOf(':', slash + 1);
  const nameFull = colon === -1 ? noDigest : noDigest.slice(0, colon);
  const tag = colon === -1 ? '' : noDigest.slice(colon + 1);
  const name = nameFull.split('/').pop() ?? nameFull;
  return { name: name.toLowerCase(), tag };
}

/** Image tags -> version, e.g. "20-alpine" -> "20", "bookworm-slim" -> "bookworm". */
/** @param {string} tag */
function tagVersion(tag) {
  const m = /^v?(\d+(?:\.\d+)*)/.exec(tag);
  if (m) return m[1];
  const word = /^([a-z]+)(?:-|$)/.exec(tag);
  return word ? word[1] : null;
}

/** @type {import('./util.js').Detector} */
export const containerImages = {
  id: 'image-eol',
  appliesTo: (p) => /(^|\/)(Dockerfile[^/]*|[^/]*\.dockerfile|[^/]*\.ya?ml)$/i.test(p),
  scan({ path, text }, ctx) {
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    const isDockerfile = /dockerfile/i.test(path);
    for (const [n, l] of lines(text)) {
      let ref = null;
      if (isDockerfile) {
        const m = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(l);
        if (m) ref = m[1];
      } else {
        const m = /^\s*-?\s*image:\s*["']?([^\s"'#]+)/.exec(l);
        if (m) ref = m[1];
      }
      if (!ref || ref.includes('$')) continue;
      const { name, tag } = parseImageRef(ref);
      const entry = IMAGES[name];
      const version = tagVersion(tag);
      if (!entry || !version) continue;
      const f = eolFinding(ctx, {
        product: entry[0], label: entry[1], version, file: path, line: n,
        rule: 'image-eol', where: `image ${name}:${tag}`,
      });
      if (f) out.push(f);
    }
    return out;
  },
};

/**
 * Collect the version values of a `key:` in a workflow file: scalar, inline
 * list, or block list. Returns [line, value] pairs.
 * @param {Array<[number, string]>} ls
 * @param {number} idx index of the line holding the key
 * @param {string} rest text after the colon
 * @returns {Array<[number, string]>}
 */
function workflowValues(ls, idx, rest) {
  const value = rest.replace(/\s+#.*$/, '').trim();
  const n = ls[idx][0];
  if (value.startsWith('[')) {
    return value.replace(/^\[|\]$/g, '').split(',').map((v) => /** @type {[number,string]} */ ([n, cleanVersion(v)]));
  }
  if (value) return [[n, cleanVersion(value)]];
  /** @type {Array<[number, string]>} */
  const vals = [];
  for (let j = idx + 1; j < ls.length; j++) {
    const m = /^\s*-\s*(.+?)\s*(?:#.*)?$/.exec(ls[j][1]);
    if (!m) break;
    vals.push([ls[j][0], cleanVersion(m[1])]);
  }
  return vals;
}

/** @type {import('./util.js').Detector} */
export const workflowSetup = {
  id: 'runtime-eol',
  appliesTo: (p) => /(^|\/)\.github\/(workflows\/[^/]+|actions\/[^/]+\/action)\.ya?ml$/.test(p),
  scan({ path, text }, ctx) {
    /** @type {import('./util.js').Finding[]} */
    const out = [];
    const ls = lines(text);
    ls.forEach(([, l], idx) => {
      const m = /^\s*-?\s*([a-z]+-version)\s*:\s*(.*)$/.exec(l);
      const entry = m && SETUP_KEYS[m[1]];
      if (!m || !entry) return;
      const values = workflowValues(ls, idx, m[2]);
      for (const [n, v] of values) {
        if (!concrete(v)) continue;
        const f = eolFinding(ctx, {
          product: entry[0], label: entry[1], version: v, file: path, line: n,
          rule: 'runtime-eol', where: `CI ${m[1]}`,
          // A matrix of several versions is usually deliberate compatibility testing.
          confidence: values.length > 1 ? 'medium' : 'high',
        });
        if (f) out.push(f);
      }
    });
    return out;
  },
};
