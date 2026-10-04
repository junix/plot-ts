#!/usr/bin/env python3
"""Structurally check generated canonical HTML, without a browser or dependencies.

Pass the *.html files retained by tests/native-canonical-themes.test.mjs.
This checks markup/style integration only, not browser layout or interaction.
"""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / 'assets/canonical/theme.json').read_text())


class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.styles = []
        self.in_style = False
        self.container = False

    def handle_starttag(self, tag, attrs):
        if tag == 'style':
            assert self.stack == ['html', 'head'], 'stylesheet must be a direct head child'
            self.styles.append('')
            self.in_style = True
        if tag == 'div' and dict(attrs).get('class') == 'chart-container':
            assert self.stack == ['html', 'body'], 'chart container must be a direct body child'
            self.container = True
        if tag not in ('meta', 'br', 'hr', 'img', 'link', 'input'):
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass  # SVG self-closing geometry does not change nesting.

    def handle_endtag(self, tag):
        assert self.stack and self.stack[-1] == tag, f'unbalanced closing tag {tag}'
        self.stack.pop()
        if tag == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.styles[-1] += data


def check(path):
    name = path.name.removesuffix('-svg-gallery.html')
    family, mode = (name[:-5], 'dark') if name.endswith('-dark') else (name, 'light')
    tokens = REGISTRY['themes'][family][mode]
    doc = Document()
    doc.feed(path.read_text())
    doc.close()
    assert not doc.stack, 'unclosed HTML tags'
    assert len(doc.styles) == 1 and doc.container, 'one stylesheet and a chart container required'
    css = doc.styles[0]
    assert '<' not in css and '>' not in css, 'HTML markup inside stylesheet'
    # Verify declarations in their selector blocks, not arbitrary substrings.
    blocks = dict(re.findall(r'([^{}]+)\{([^{}]*)\}', re.sub(r'/\*.*?\*/', '', css, flags=re.S)))
    blocks = {selector.strip(): body for selector, body in blocks.items()}
    declarations = lambda selector: dict((key.strip(), value.strip()) for key, value in re.findall(r'([^:;]+):([^;]+);', blocks[selector]))
    variables = declarations(':root')
    for css_name, token in (('--ink', '--ink'), ('--accent', '--accent'), ('--paper', '--paper'), ('--neutral', '--grid')):
        assert variables[css_name] == tokens[token], f'wrong {css_name}'
    assert declarations('body')['background'] == tokens['--paper']
    assert declarations('.chart-container')['background'] == tokens['--paper']
    assert declarations('.plt-chart')['background'] == 'var(--paper)'
    assert declarations('.plt-chart text')['fill'] == 'var(--ink-body)'
    print(f'{name}: valid HTML nesting, canonical variables and surface rules')


if __name__ == '__main__':
    if len(sys.argv) == 1:
        raise SystemExit('usage: python3 tools/check-canonical-html.py out/canonical/*-svg-gallery.html')
    for filename in sys.argv[1:]:
        check(Path(filename))
