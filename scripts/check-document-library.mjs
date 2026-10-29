import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('lib/document-library.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
const textExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/document-text.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:textExports});
vm.runInNewContext(compiled, { exports, Intl, Date, require: name => { assert.equal(name,'@/lib/document-text'); return textExports; } });
const { filterLibrary, documentDay } = exports;
const docs = [
  { id: 1, name: 'Invoice.pdf', documentNumber: 'DOC-001', category: 'Invoices', ownerName: 'Aline', tags: [], ocrText: 'Paid by Cedar', type: 'pdf', status: 'Completed', createdAt: '2026-10-25T23:30:00Z', date: '' },
  { id: 2, name: 'Contract.jpg', documentNumber: 'DOC-002', category: 'Contracts', ownerName: 'Mahdi', tags: ['legal'], ocrText: 'Invoice reference', type: 'jpg', status: 'Processing', createdAt: '2026-10-24T09:00:00Z', date: '' },
];
const defaults = { query: '', scope: 'Everything', category: '', status: '', type: '', from: '', to: '', sort: 'Newest first' };
const find = patch => Array.from(filterLibrary(docs, { ...defaults, ...patch }), doc => doc.id).join(',');
assert.equal(find({}), '1,2');
assert.equal(find({ query: '  INVOICE ' }), '1,2');
assert.equal(find({ query: 'invoice', scope: 'File names' }), '1');
assert.equal(find({ query: 'invoice', scope: 'Recognized text' }), '2');
assert.equal(find({ query: 'DOC-002', scope: 'Document details' }), '2');
assert.equal(find({ query: 'Mahdi', scope: 'Document details' }), '2');
assert.equal(find({ query: 'no match' }), '');
assert.equal(find({ category: 'Invoices', status: 'Completed', type: 'pdf' }), '1');
assert.equal(find({ type: 'image' }), '2');
assert.equal(documentDay(docs[0]), '2026-10-26', 'Dates use Beirut, not UTC');
assert.equal(find({ from: '2026-10-26', to: '2026-10-26' }), '1', 'Date endpoints are inclusive');
assert.equal(find({ from: '2026-10-27', to: '2026-10-24' }), '');
assert.equal(find({ sort: 'Oldest first' }), '2,1');
assert.equal(find({ sort: 'Name' }), '2,1');
const unprocessed = [{...docs[0],ocrText:'Text recognition has not been run for this document.',status:'Not processed'}];
assert.equal(filterLibrary(unprocessed,{...defaults,query:'recognition',scope:'Recognized text'}).length,0,'Placeholder status must not match paper text');
assert.equal(filterLibrary(unprocessed,{...defaults,query:'recognition'}).length,0,'Everything must not match placeholder status');
const multilingual = [{...docs[0],ocrText:'Référence de facture\n عَقْد الإِدارة'}];
assert.equal(filterLibrary(multilingual,{...defaults,query:'reference facture',scope:'Recognized text'}).length,1);
assert.equal(filterLibrary(multilingual,{...defaults,query:'عقد الادارة',scope:'Recognized text'}).length,1,'Arabic marks and alef forms must not hide matches');
assert(textExports.documentTextSnippet({ocrText:'First line\nA hidden invoice word\nFollowing context'},'invoice').includes('hidden invoice'));
assert.equal(find({ query: 'invoice', sort: 'Most relevant' }), '1,2');
console.log('Document library search, scope, filters, Beirut dates, and sorting checks passed.');
