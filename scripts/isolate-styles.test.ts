import { expect, test } from 'bun:test'
import { isolateStyles } from './isolate-styles'

test('widget registrations and animations cannot replace host Tailwind variables or keyframes', () => {
  expect(
    isolateStyles(`
@property --tw-shadow { syntax: "*"; inherits: false; }
.animate-pulse { --tw-enter-opacity: 0; animation: pulse 2s infinite, enter var(--tw-duration); }
@keyframes pulse { to { opacity: .5; } }
@keyframes enter { from { opacity: var(--tw-enter-opacity); } }
`),
  ).toBe(`
@property --lc-tw-shadow { syntax: "*"; inherits: false; }
.animate-pulse { --lc-tw-enter-opacity: 0; animation: lc-pulse 2s infinite, lc-enter var(--lc-tw-duration); }
@keyframes lc-pulse { to { opacity: .5; } }
@keyframes lc-enter { from { opacity: var(--lc-tw-enter-opacity); } }
`)
})
