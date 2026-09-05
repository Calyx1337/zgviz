import {defineConfig} from 'vite';
const proxy={
 '/zgviz/live/closures.json':{target:'https://calyx.hr',changeOrigin:true},
 '/live/closures.json':{target:'https://calyx.hr',changeOrigin:true,rewrite:(path:string)=>'/zgviz'+path},
};
export default defineConfig({server:{proxy},preview:{proxy}});
