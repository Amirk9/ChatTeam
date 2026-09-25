// Tailwind v4 is wired via @tailwindcss/vite (see vite.config.js) and needs
// no PostCSS plugins. This explicit empty config exists to STOP Vite/PostCSS
// config lookup from walking up into the parent folder, which belongs to a
// different project (Tailwind v3) and would otherwise hijack our CSS build.
export default {};
