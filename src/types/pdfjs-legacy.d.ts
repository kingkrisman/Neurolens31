/**
 * The legacy build has no types of its own.
 *
 * It is the same API as the package root — pdf.js publishes it as the same
 * library compiled for older browsers — so the call site casts the namespace
 * to `typeof import("pdfjs-dist")` and gets the real types from there. This
 * declaration exists only so the deep path resolves at all.
 */
declare module "pdfjs-dist/legacy/build/pdf.min.js";
