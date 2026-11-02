// Keep built files at the repository root for the existing branch-based Pages site.
import {cp,readdir,rm} from 'node:fs/promises';
await rm('assets',{recursive:true,force:true});
for(const name of await readdir('dist'))await cp('dist/'+name,name,{recursive:true});
