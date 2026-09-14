/**
 * A stand-in for an optional dependency that only exists outside a browser.
 *
 * pdf.js's legacy build imports node-canvas so it can rasterise pages in Node.
 * This reader only ever runs in a browser, where that branch can never be
 * taken, so the bundler is pointed here instead of failing to resolve a package
 * that was never installed.
 */
export default {};
