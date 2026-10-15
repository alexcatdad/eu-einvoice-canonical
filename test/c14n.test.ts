import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DOMParser } from '@xmldom/xmldom';
import { type C14nOptions, canonicalize } from '../src/signature/c14n.js';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml');
const c14n = (xml: string, opts: Partial<C14nOptions> = {}, pick?: string) => {
  const doc = parse(xml);
  const node = pick ? doc.getElementsByTagName(pick).item(0)! : doc;
  return canonicalize(node, { exclusive: false, withComments: false, ...opts });
};

describe('Canonical XML 1.0 (W3C REC examples, without DTD)', () => {
  const ex31 =
    '<?xml version="1.0"?>\n\n<?xml-stylesheet   href="doc.xsl"\n   type="text/xsl"   ?>\n\n<doc>Hello, world!<!-- Comment 1 --></doc>\n\n<?pi-without-data     ?>\n\n<!-- Comment 2 -->\n\n<!-- Comment 3 -->';

  test('3.1 PIs and comments, comments omitted', () => {
    assert.equal(c14n(ex31), '<?xml-stylesheet href="doc.xsl"\n   type="text/xsl"   ?>\n<doc>Hello, world!</doc>\n<?pi-without-data?>');
  });

  test('3.1 PIs and comments, comments kept', () => {
    assert.equal(
      c14n(ex31, { withComments: true }),
      '<?xml-stylesheet href="doc.xsl"\n   type="text/xsl"   ?>\n<doc>Hello, world!<!-- Comment 1 --></doc>\n<?pi-without-data?>\n<!-- Comment 2 -->\n<!-- Comment 3 -->',
    );
  });

  test('3.2 whitespace in document content is kept as is', () => {
    const doc =
      '<doc>\n   <clean>   </clean>\n   <dirty>   A   B   </dirty>\n   <mixed>\n      A\n      <clean>   </clean>\n      B\n      <dirty>   A   B   </dirty>\n      C\n   </mixed>\n</doc>';
    assert.equal(c14n(doc), doc);
  });

  test('3.4 character references, CDATA, quotes and attribute whitespace', () => {
    const input = `<doc>
   <text>First line&#x0d;&#10;Second line</text>
   <value>&#x32;</value>
   <compute><![CDATA[value>"0" && value<"10" ?"valid":"error"]]></compute>
   <compute expr='value>"0" &amp;&amp; value&lt;"10" ?"valid":"error"'>valid</compute>
   <norm attr=' &apos;   &#x20;&#13;&#xa;&#9;   &apos; '/>
</doc>`;
    const expected = `<doc>
   <text>First line&#xD;
Second line</text>
   <value>2</value>
   <compute>value&gt;"0" &amp;&amp; value&lt;"10" ?"valid":"error"</compute>
   <compute expr="value>&quot;0&quot; &amp;&amp; value&lt;&quot;10&quot; ?&quot;valid&quot;:&quot;error&quot;">valid</compute>
   <norm attr=" '    &#xD;&#xA;&#x9;   ' "></norm>
</doc>`;
    assert.equal(c14n(input), expected);
  });

  test('3.6 non-ASCII characters are output as is', () => {
    assert.equal(c14n('<doc>&#169;</doc>'), '<doc>©</doc>');
  });

  test('empty elements are expanded and attributes sorted (no namespace first, then by URI, then local name)', () => {
    assert.equal(
      c14n('<r xmlns:a="urn:b" xmlns:b="urn:a"><x a:z="1" b:y="2" m="3" c="4"/></r>', {}, 'x'),
      '<x xmlns:a="urn:b" xmlns:b="urn:a" c="4" m="3" b:y="2" a:z="1"></x>',
    );
  });

  test('inclusive: a subtree carries every in-scope namespace and inherited xml:* attributes', () => {
    const xml = '<r xmlns:a="urn:a" xmlns="urn:d" xml:lang="en"><a:x><y/></a:x></r>';
    assert.equal(c14n(xml, {}, 'a:x'), '<a:x xmlns="urn:d" xmlns:a="urn:a" xml:lang="en"><y></y></a:x>');
  });

  test('inclusive: a redundant redeclaration is dropped, an undeclaration is kept', () => {
    assert.equal(c14n('<r xmlns="urn:d"><x xmlns="urn:d"><y xmlns=""/></x></r>'), '<r xmlns="urn:d"><x><y xmlns=""></y></x></r>');
  });

  test('document level comments follow the withComments flag; a root-only subtree has no document newlines', () => {
    assert.equal(c14n('<!--a--><r/><!--b-->', { withComments: true }), '<!--a-->\n<r></r>\n<!--b-->');
    assert.equal(c14n('<!--a--><r/><!--b-->'), '<r></r>');
  });
});

describe('Exclusive XML Canonicalization 1.0', () => {
  const spec = `<n0:local xmlns:n0="foo:bar" xmlns:n3="ftp://example.org">
  <n1:elem2 xmlns:n1="http://example.net" xml:lang="en">
    <n3:stuff xmlns:n3="ftp://example.org"/>
  </n1:elem2>
</n0:local>`;

  test('spec example: only visibly used namespaces, xml:lang not inherited from ancestors', () => {
    assert.equal(
      c14n(spec, { exclusive: true }, 'n1:elem2'),
      '<n1:elem2 xmlns:n1="http://example.net" xml:lang="en">\n    <n3:stuff xmlns:n3="ftp://example.org"></n3:stuff>\n  </n1:elem2>',
    );
  });

  test('the same subtree canonicalised inclusively keeps all in-scope namespaces once', () => {
    assert.equal(
      c14n(spec, {}, 'n1:elem2'),
      '<n1:elem2 xmlns:n0="foo:bar" xmlns:n1="http://example.net" xmlns:n3="ftp://example.org" xml:lang="en">\n    <n3:stuff></n3:stuff>\n  </n1:elem2>',
    );
  });

  test('an inherited xml:lang is not added to an exclusive subtree', () => {
    assert.equal(c14n('<r xml:lang="en"><c/></r>', { exclusive: true }, 'c'), '<c></c>');
    assert.equal(c14n('<r xml:lang="en"><c/></r>', {}, 'c'), '<c xml:lang="en"></c>');
  });

  test('InclusiveNamespaces PrefixList forces declarations that are not visibly used', () => {
    const xml = '<foo:Root xmlns:foo="urn:foo" xmlns:bar="urn:bar"><foo:Child/></foo:Root>';
    assert.equal(c14n(xml, { exclusive: true }), '<foo:Root xmlns:foo="urn:foo"><foo:Child></foo:Child></foo:Root>');
    assert.equal(
      c14n(xml, { exclusive: true, inclusivePrefixes: ['bar'] }),
      '<foo:Root xmlns:bar="urn:bar" xmlns:foo="urn:foo"><foo:Child></foo:Child></foo:Root>',
    );
  });

  test('PrefixList #default emits the default namespace even when only prefixed names are used', () => {
    const xml = '<a:r xmlns:a="urn:a" xmlns="urn:d"><a:x/></a:r>';
    assert.equal(c14n(xml, { exclusive: true }), '<a:r xmlns:a="urn:a"><a:x></a:x></a:r>');
    assert.equal(c14n(xml, { exclusive: true, inclusivePrefixes: ['#default'] }), '<a:r xmlns="urn:d" xmlns:a="urn:a"><a:x></a:x></a:r>');
  });

  test('a prefix used only by an attribute is declared where the attribute is', () => {
    assert.equal(c14n('<r xmlns:p="urn:p"><x p:a="1" b="2"/></r>', { exclusive: true }, 'x'), '<x xmlns:p="urn:p" b="2" p:a="1"></x>');
  });

  test('the default namespace is undeclared where an unprefixed child leaves it', () => {
    assert.equal(c14n('<r xmlns="urn:d"><x xmlns=""><y/></x></r>', { exclusive: true }), '<r xmlns="urn:d"><x xmlns=""><y></y></x></r>');
    assert.equal(c14n('<r xmlns="urn:d"><x xmlns=""><y/></x></r>', { exclusive: true }, 'x'), '<x><y></y></x>');
  });

  test('a namespace is redeclared once when a descendant rebinds the prefix', () => {
    assert.equal(
      c14n('<a:r xmlns:a="urn:1"><a:x xmlns:a="urn:2"><a:y/></a:x></a:r>', { exclusive: true }),
      '<a:r xmlns:a="urn:1"><a:x xmlns:a="urn:2"><a:y></a:y></a:x></a:r>',
    );
  });
});

describe('enveloped-signature omission and comments inside elements', () => {
  const xml = '<r xmlns:ds="urn:ds"><a>1</a><ds:Signature><ds:x/></ds:Signature><b>2</b></r>';

  test('omit removes the given element and its subtree, nothing else', () => {
    const doc = parse(xml);
    const sig = doc.getElementsByTagName('ds:Signature').item(0)!;
    assert.equal(canonicalize(doc, { exclusive: false, withComments: false, omit: sig }), '<r xmlns:ds="urn:ds"><a>1</a><b>2</b></r>');
    assert.equal(canonicalize(doc, { exclusive: true, withComments: false, omit: sig }), '<r><a>1</a><b>2</b></r>');
  });

  test('comments and PIs inside elements', () => {
    const x = '<r><!--c--><?p d?>t</r>';
    assert.equal(c14n(x), '<r><?p d?>t</r>');
    assert.equal(c14n(x, { withComments: true }), '<r><!--c--><?p d?>t</r>');
  });
});
