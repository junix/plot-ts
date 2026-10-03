#!/usr/bin/env python3
"""Parse rendered SVGs only; rejected inputs are outcomes, not SVG files."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'out/svg-edge-audit-run')
report = json.loads((root / 'classified-results.json').read_text())
rendered = [case for case in report['cases'] if case['outcome'] == 'rendered']
parsed = 0
for case in rendered:
    document = ET.parse(root / case['svgFile']).getroot()
    if document.tag != '{http://www.w3.org/2000/svg}svg':
        raise ValueError('Unexpected root in ' + case['svgFile'])
    parsed += 1
print(f"Parsed {parsed} SVG documents; evaluated {len(report['cases'])} corpus outcomes")
print('XML parsing alone does not validate numeric geometry or chart semantics; see classified-results.json')
