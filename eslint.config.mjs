import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.es2020,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            ...reactHooks.configs['recommended-latest'].rules,
            // TypeScript already flags genuinely undefined identifiers (and does so more
            // accurately than eslint's core rule, which false-positives on JSX intrinsics,
            // ambient/global declarations, and other TS-only constructs) — recommended
            // by typescript-eslint's own docs for exactly this reason.
            'no-undef': 'off',
            // Matches this codebase's existing convention (e.g. serverApi.ts's
            // `onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => ...`)
            // of naming a positionally-required-but-unused parameter with a
            // leading underscore rather than suppressing the rule outright.
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                },
            ],
            // Permits `a() ?? b()`/`a() || b()` as a bare statement — used in this
            // codebase's tests to evaluate a fallback lookup purely for its
            // side effect (e.g. a throwing getBy* query driving waitFor's retry).
            '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
        },
    },
    {
        files: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            // Test files in this codebase type mocks (RTK Query base-query
            // stand-ins, event payloads, captured request bodies) with `any`
            // pervasively and idiomatically — narrowly scoped to *.test.* so
            // real source code still gets the full strictness above.
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
);
