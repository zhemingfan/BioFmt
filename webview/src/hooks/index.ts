// SPDX-License-Identifier: GPL-3.0-or-later

export { useScrollHandler } from './useScrollHandler';
// useRegionProvider is lazy-loaded only by IndexedPreviewWrapper to avoid
// module-level side effects on every preview (see App.tsx)
