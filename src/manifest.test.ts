import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Manifest verification — SC-006.
 *
 * "Model setup occupies one menu entry and one primary route, down from three
 * menu entries and four routes, with zero components left exported but
 * unreachable."
 *
 * This is a property of package.json's customFields.clarion and of
 * src/index.ts, not of any rendered tree — no component test can reach it.
 * Both files are read here as plain data.
 *
 * Contract: specs/064-model-setup-interface/contracts/frontend-model-setup.md §5.1
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_JSON_PATH = path.resolve(__dirname, '..', 'package.json');
const INDEX_TS_PATH = path.resolve(__dirname, 'index.ts');

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
const indexSource = fs.readFileSync(INDEX_TS_PATH, 'utf-8');

const clarion = pkg.customFields?.clarion ?? {};
const routes: Array<{ path: string; element: string }> = clarion.routes ?? [];
const menuEntries: Array<{ name: string; path: string }> = clarion.menu?.entries ?? [];
const apiList: string[] = clarion.api ?? [];

const MODEL_SETUP_PATH = '/clarion-app/llm-client/model-setup';
const LEGACY_PATHS = [
  '/clarion-app/llm-client/servers',
  '/clarion-app/llm-client/servers/:id/models',
  '/clarion-app/llm-client/models',
  '/clarion-app/llm-client/settings',
];

// ---------------------------------------------------------------------------
// index.ts parsed as data: which names are exported, and which local module
// (relative specifier, e.g. './Servers') each one traces back to.
// ---------------------------------------------------------------------------

/** local binding name -> relative module specifier it came from, per `import` statements. */
function parseImportBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>();
  const importRegex = /import\s+(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*from\s*['"](\.[^'"]+)['"]\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(source)) !== null) {
    const [, defaultName, namedList, modulePath] = m;
    if (defaultName) {
      bindings.set(defaultName, modulePath);
    }
    if (namedList) {
      for (const raw of namedList.split(',')) {
        const item = raw.trim();
        if (!item) continue;
        const asMatch = item.match(/^(\S+)\s+as\s+(\S+)$/);
        const localName = asMatch ? asMatch[2] : item;
        bindings.set(localName, modulePath);
      }
    }
  }
  return bindings;
}

/** exported name -> relative module specifier (or null if it can't be traced), per `export { ... } [from '...']` statements. */
function parseExportedNames(source: string, importBindings: Map<string, string>): Map<string, string | null> {
  const exported = new Map<string, string | null>();
  const exportRegex = /export\s*\{([^}]+)\}\s*(from\s*['"](\.[^'"]+)['"])?\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = exportRegex.exec(source)) !== null) {
    const [, list, , fromPath] = m;
    for (const raw of list.split(',')) {
      const item = raw.trim();
      if (!item) continue;
      const asMatch = item.match(/^(\S+)\s+as\s+(\S+)$/);
      const originName = asMatch ? asMatch[1] : item;
      const exportedName = asMatch ? asMatch[2] : item;
      const modulePath = fromPath ?? importBindings.get(originName) ?? null;
      exported.set(exportedName, modulePath);
    }
  }
  return exported;
}

const importBindings = parseImportBindings(indexSource);
const exportedNameToModule = parseExportedNames(indexSource, importBindings);
const exportedNames = new Set(exportedNameToModule.keys());

// ---------------------------------------------------------------------------
// Route elements parsed as data.
// ---------------------------------------------------------------------------

function componentNameFromElement(element: string): string {
  const m = element.match(/^<\s*([A-Za-z0-9_]+)/);
  if (!m) {
    throw new Error(`manifest.test.ts: could not parse a component name out of route element "${element}"`);
  }
  return m[1];
}

const routeElementNames = new Set(routes.map((r) => componentNameFromElement(r.element)));

// ---------------------------------------------------------------------------
// Reachability: which src/ modules are transitively imported starting from
// the modules of the components named in routes. Used to decide whether an
// exported-but-not-routed, exported-but-not-api-listed component (like
// ApiCallConfirmation, which Conversation.tsx renders inline) still counts
// as "reachable" for SC-006 purposes.
// ---------------------------------------------------------------------------

function resolveModuleFile(specifier: string): string | null {
  const base = path.resolve(__dirname, specifier);
  for (const ext of ['.tsx', '.ts']) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findLocalImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const re = /from\s*['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    specifiers.push(m[1]);
  }
  return specifiers;
}

function computeReachableModules(rootSpecifiers: string[]): Set<string> {
  const visited = new Set<string>();
  const queue = [...rootSpecifiers];
  while (queue.length > 0) {
    const spec = queue.shift()!;
    const file = resolveModuleFile(spec);
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const content = fs.readFileSync(file, 'utf-8');
    for (const child of findLocalImportSpecifiers(content)) {
      queue.push(child);
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

describe('manifest — customFields.clarion menu/routes (SC-006, FR-002/003/004)', () => {
  it('has exactly one "Model Setup" menu entry, pointing at the model-setup route', () => {
    const modelSetupEntries = menuEntries.filter((e) => e.name === 'Model Setup');
    expect(modelSetupEntries.length).toBe(1);
    expect(modelSetupEntries[0]?.path).toBe(MODEL_SETUP_PATH);
  });

  it.each(['Servers', 'Models', 'Settings'])('has no "%s" menu entry', (forbiddenName) => {
    expect(menuEntries.some((e) => e.name === forbiddenName)).toBe(false);
  });

  it('exactly one route declares <ModelSetup />', () => {
    const modelSetupRoutes = routes.filter((r) => componentNameFromElement(r.element) === 'ModelSetup');
    expect(modelSetupRoutes.length).toBe(1);
    expect(modelSetupRoutes[0]?.path).toBe(MODEL_SETUP_PATH);
  });

  it.each(LEGACY_PATHS)('legacy path %s declares <ModelSetupRedirect />', (legacyPath) => {
    const route = routes.find((r) => r.path === legacyPath);
    expect(route, `expected a route entry for ${legacyPath}`).toBeTruthy();
    expect(componentNameFromElement(route!.element)).toBe('ModelSetupRedirect');
  });
});

describe('manifest — index.ts export/route consistency (SC-006)', () => {
  it('every component named in a route element is exported from index.ts', () => {
    const missing = [...routeElementNames].filter((name) => !exportedNames.has(name));
    expect(missing, `route elements not exported from index.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('every component exported from index.ts is named by a route or listed in customFields.clarion.api — zero exports left unreachable', () => {
    const rootSpecifiers = [...routeElementNames]
      .map((name) => exportedNameToModule.get(name))
      .filter((m): m is string => !!m);
    const reachableModules = computeReachableModules(rootSpecifiers);

    const unreachable: string[] = [];
    for (const name of exportedNames) {
      if (routeElementNames.has(name)) continue;
      if (apiList.includes(name)) continue;
      const modulePath = exportedNameToModule.get(name);
      const resolvedFile = modulePath ? resolveModuleFile(modulePath) : null;
      if (resolvedFile && reachableModules.has(resolvedFile)) continue;
      unreachable.push(name);
    }

    expect(unreachable, `exported from index.ts but neither routed nor api-listed nor reachable: ${unreachable.join(', ')}`).toEqual([]);
  });
});

describe('manifest — customFields.clarion.api (FR-003a)', () => {
  it('contains llmClientServerStatusApi', () => {
    expect(apiList).toContain('llmClientServerStatusApi');
  });

  /**
   * 096-agent-sharing, contracts/frontend-agent-sharing.md §1 — the one
   * `package.json` entry this feature's new `agentShareApi.ts` slice
   * cannot skip, per 070-run-execution-graph's own reconciliation lesson
   * (`llmClientRunApi` shipped exported but unlisted here, so its
   * reducer/middleware were never registered in the host's generated
   * store despite every package-scoped test passing). Confirmed red here
   * against the current `package.json`, which does not yet list it, before
   * the entry is added.
   */
  it('contains llmClientAgentShareApi', () => {
    expect(apiList).toContain('llmClientAgentShareApi');
  });

  it('does not contain llmClientUserSettingApi', () => {
    expect(apiList).not.toContain('llmClientUserSettingApi');
  });

  /**
   * 097-subagent-model, contracts/frontend-subagent-model.md §1 — the one
   * `package.json` entry this feature's new `agentHelperApi.ts` slice
   * cannot skip, per 070-run-execution-graph's own reconciliation lesson
   * (`llmClientRunApi` shipped exported but unlisted here, so its
   * reducer/middleware were never registered in the host's generated
   * store despite every package-scoped test passing). Confirmed red here
   * against the current `package.json`, which does not yet list it, before
   * the entry is added.
   */
  it('contains llmClientAgentHelperApi', () => {
    expect(apiList).toContain('llmClientAgentHelperApi');
  });

  /**
   * 098-delegation-protocol, contracts/delegation-protocol-api.md §4 — the
   * one `package.json` entry this feature's new `delegationApi.ts` slice
   * cannot skip, per 070-run-execution-graph's own reconciliation lesson
   * (`llmClientRunApi` shipped exported but unlisted here, so its
   * reducer/middleware were never registered in the host's generated
   * store despite every package-scoped test passing). Confirmed red here
   * against the current `package.json`, which does not yet list it, before
   * the entry is added (tasks.md T032).
   */
  it('contains llmClientDelegationApi', () => {
    expect(apiList).toContain('llmClientDelegationApi');
  });

  /**
   * Every RTK Query slice this package exports must also be declared here.
   * The host app generates its store — reducers, middleware, and
   * `resetApiState` wiring — solely from this list
   * (`frontend/vite-plugins/dynamicStore.ts`), so a slice that is exported
   * but unlisted is never registered: every hook that uses it throws at
   * runtime in the host, while every test in this package passes, because
   * each test builds its own `configureStore` with the slice registered by
   * hand. That is exactly how `llmClientRunApi` (spec 070) shipped
   * unregistered — the reachability check above cannot catch it, since
   * `runApi.ts` is transitively imported by a routed component.
   *
   * The "unreachable" assertion above intentionally accepts either routing or
   * api-listing; this one is the stricter rule for API slices specifically.
   */
  it('lists every *Api module exported from index.ts', () => {
    const missing = [...exportedNameToModule.entries()]
      // The slice binding itself (`llmClientRunApi` from `./runApi`), not the
      // hooks a slice module also exports (`useConfirmApiCallMutation`).
      .filter(([name, modulePath]) => !!modulePath && /Api$/.test(modulePath) && /Api$/.test(name))
      .map(([name]) => name)
      .filter((name) => !apiList.includes(name));

    expect(missing, `exported from index.ts but missing from customFields.clarion.api: ${missing.join(', ')}`).toEqual([]);
  });
});
