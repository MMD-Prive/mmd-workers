// Offline exact-candidate tests; no service calls or release CLI execution.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root='release/events-model-rotation/';
const code=readFileSync(root+'history-review-local-candidate.mjs','utf8');
const files=['compcard-history-review.test.mjs','compcard-policy.test.mjs','compcard-journal.test.mjs','compcard-intake.test.mjs','compcard-cadence.test.mjs','history-review-fixture.mjs'];
const names=new Set();
for(const file of files){
 let text=readFileSync('events-worker/'+file,'utf8');
 for(const match of text.matchAll(/import\s*{([^}]+)}\s*from\s*["']\.\/src\/[^"']+["']/gs)) for(const name of match[1].split(',').map(s=>s.trim()).filter(Boolean)) names.add(name);
 text=text.replace(/(["'])\.\/src\/[^"']+\1/g,"'./history-review-testable.mjs'");
 writeFileSync(root+file,text);
}
const closure=['threeMonthReviewWindow','reviewModelPublication','REVIEW_ROOT','REVIEW_SCHEMA'];
for(const name of closure)names.delete(name);
writeFileSync(root+'history-review-testable.mjs',code+'\nexport {publicationHistoryReview,'+[...names].join(',')+'};\nexport const {'+closure.join(',')+'}=publicationHistoryReview;\n');
execFileSync(process.execPath,['--test','--test-skip-pattern=the approved manifest',...files.slice(0,4).map(f=>root+f)],{stdio:'inherit'});
execFileSync(process.execPath,['--test','--test-name-pattern=excluded Tinn|frozen not_sent|one remaining|legacy frozen plan is|pending legacy Tinn|already sent legacy Tinn|single-room|afternoon and Standard|Standard repeats|uncertain Standard|empty Standard|legacy frozen sibling',root+files[4]],{stdio:'inherit'});
