#!/usr/bin/env python3
"""Regenerate the independent Decimal reference corpus; Python standard library only."""
import decimal, json, math, pathlib, random, struct
D = decimal.Decimal
decimal.getcontext().prec = 180
randomizer = random.Random(20261005)
minimum = float.fromhex('0x0.0000000000001p-1022')
maximum = float.fromhex('0x1.fffffffffffffp+1023')
cases = []
def add(lo, value, hi):
    if not (0 < lo < hi <= maximum and lo <= value <= hi): return
    dl, dv, dh = map(D.from_float, (lo, value, hi))
    span = (dh / dl).ln()
    numerator = (dv / dl).ln() if value != lo else D(0)
    cases.append({'min': lo, 'value': value, 'max': hi, 'logRatio': str(span), 'fraction': str(numerator / span)})
for value in [minimum,2*minimum, float.fromhex('0x1p-1022'), 1e-300, 1e-100, 0.1, 1, 2, 10, 1e100, 1e300, math.nextafter(maximum, 0)]:
    lower = math.nextafter(value, 0)
    upper = math.nextafter(value, math.inf)
    if lower > 0: add(lower, value, upper)
    add(value, value, upper)
for lower,upper in [(minimum,maximum),(minimum,1),(1,maximum),(1,1000),(1e-300,1e300),(1,math.nextafter(2,0)),(1,2),(1,math.nextafter(2,math.inf))]:
    for fraction in [0.1,0.5,0.9]:
        dl,dh=map(D.from_float,(lower,upper))
        mid=float(((dl.ln()*(1-D(str(fraction))))+dh.ln()*D(str(fraction))).exp())
        add(lower,mid,upper)
for exponent in [-1074,-1073,-1023,-1022,-1021,-1000,-100,-1,0,1,100,1000,1023]:
    value=math.ldexp(1.0,exponent)
    add(math.nextafter(value,0),value,math.nextafter(value,math.inf))
for _ in range(256):
    bits=sorted(randomizer.sample(range(1,0x7ff0000000000000),3))
    add(*(struct.unpack('>d',struct.pack('>Q',b))[0] for b in bits))
# The transform's most cancellation-sensitive triples: adjacent binary64 values.
for _ in range(128):
    bits=randomizer.randrange(1,0x7feffffffffffffd)
    add(*(struct.unpack('>d',struct.pack('>Q',bits+i))[0] for i in range(3)))
output=pathlib.Path(__file__).resolve().parents[2]/'tests/fixtures/scaled-axes-reference.json'
output.write_text(json.dumps({'reference':'Python Decimal precision 180; exact binary64 inputs via Decimal.from_float; natural logs of high-precision ratios','cases':cases},indent=2)+'\n')
print(len(cases),'cases',output)
