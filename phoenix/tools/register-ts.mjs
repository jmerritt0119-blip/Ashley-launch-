// Installs the resolver hook. Used as `node --import ./tools/register-ts.mjs …`
// so a script can import the app's TypeScript source directly.
import { register } from "node:module";
register("./ts-hooks.mjs", import.meta.url);
