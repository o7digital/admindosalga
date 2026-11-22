import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({ resolve(specifier, context, nextResolve) {
  let target;
  if (specifier.startsWith('@/')) target = path.join(root, specifier.slice(2));
  else if (specifier.startsWith('.') && !path.extname(specifier) && !context.parentURL?.includes('/node_modules/')
    && context.parentURL?.startsWith(pathToFileURL(root).href)) target = fileURLToPath(new URL(specifier, context.parentURL));
  if (target && !path.extname(target) && fs.existsSync(`${target}.js`)) target += '.js';
  return nextResolve(target ? pathToFileURL(target).href : specifier, context);
} });
