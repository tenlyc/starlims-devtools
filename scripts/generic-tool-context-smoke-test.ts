import assert from 'node:assert/strict';
import {genericToolContext,isGenericCacheableRead} from '../src/services/genericToolContext';
const context=genericToolContext([
 {entryType:'message',output:'unrelated'},
 {entryType:'activity',title:'starlims.get_item_code',status:'completed',detail:'{"uri":"/known"}',output:'{"code":"example","version":"v1"}'},
 {entryType:'activity',title:'starlims.save_item',status:'failed',output:'{"error":"stale"}'}
]);
assert.match(context,/known/);assert.match(context,/stale/);assert.match(context,/historical results/);assert.doesNotMatch(context,/unrelated/);
assert.match(genericToolContext([{entryType:'activity',title:'starlims.get_item_code',status:'completed',output:'x'.repeat(10000)}],300),/resultOmitted/);
assert.equal(isGenericCacheableRead(true,'get_item_code',{error:'failed'}),false);
assert.equal(isGenericCacheableRead(true,'get_item_code',{code:'valid'}),true);
assert.equal(isGenericCacheableRead(false,'save_item',{saved:true}),false);
assert.equal(isGenericCacheableRead(true,'plan_menu_item',{}),false);
console.log('Generic tool context and failed-result cache regression passed.');
