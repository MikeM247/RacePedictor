// Preserve the approved option 09 cascade; only scope selectors and relocate assets.
const fs=require('node:fs');const path=require('node:path');const postcss=require('postcss');
const root=path.resolve(__dirname,'..');
const sources=['concepts.css','more-concepts.css'];
const css=sources.map(name=>fs.readFileSync(path.join(root,'docs/plans/references/milestone-home',name),'utf8')).join('\n');
const ast=postcss.parse(css);
ast.walkRules(rule=>{rule.selectors=rule.selectors.map(selector=>{
 if(selector.startsWith(':root'))return selector.replace(':root','.option-nine-home');
 if(selector.startsWith('body'))return selector.replace(/^body/,'.option-nine-home');
 if(/^\.(spotlight|hybrid|with-achievements|with-training|journey|focus|next-set|race-card|route|goal-board)(?=[ .:#>\[]|$)/.test(selector))return '.option-nine-home'+selector;
 return '.option-nine-home '+selector;
});});
const output='/* Generated from approved option 09. Run node scripts/build-milestone-home-css.cjs. */\n'+ast.toString().replaceAll("url('assets/road.webp')","var(--home-hero-image,url('/road-to-comrades-v2.webp'))").replaceAll("assets/DejaVuSansCondensed","/fonts/DejaVuSansCondensed");
fs.writeFileSync(path.join(root,'apps/web/components/dashboard/option-nine-reference.css'),output);
