'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('./neural-coverage.cjs');
test('Training selects the parent that actually encounters the new neural feature, not its score or pose',()=>{
  const c={values:[.8,.8],radius:.1},a={observations:[{raw:[.2,.2],progress:9999}],fitness:9999},b={observations:[{raw:[.8,.8],progress:10}],fitness:-9999};assert.equal(P.chooseParent(a,b,c).parent,'explorer');assert.equal(P.chooseParent(b,b,c).parent,'champion');assert.equal(P.coverage([],c),0);
});
