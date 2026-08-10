/**
 * an alias for the front door: the root serves the landing page outright
 * (the wall moved to /gate), and this route survives for old links, the
 * nav anchors previews may still hold, and anything already published
 * pointing at /about.
 */
export { default } from "../page";
