import json, re
from datetime import date, datetime
from collections import Counter

data = json.load(open('payload.json', encoding='utf-8'))
notes, mre, sev = data['notes'], data['mre'], data['sev']
today = date.today()

def active(s):
    ex = sev.get(s, {}).get('ex')
    if not ex: return True
    return datetime.strptime(ex, '%d/%m/%Y').date() >= today

def norm(s):
    return re.sub(r'\s+', ' ', (s or '').strip()).upper()

groups = {}
for num in sorted(mre.keys()):
    m = mre[num]
    act = [s for s in sorted(set(m['sv'])) if active(s)]
    if not act: continue
    key = (norm(m['mk']), norm(m['md']), norm(m['b']))
    g = groups.setdefault(key, {'makes': Counter(), 'models': Counter(), 'build': m['b'] or '', 'mres': [], 'sevs': set()})
    g['makes'][m['mk'] or ''] += 1
    g['models'][m['md'] or ''] += 1
    g['mres'].append({'num': num, 'h': m['h'] or '', 'mn': notes[m['mn']] if m['mn'] >= 0 else '', 'cn': notes[m['cn']] if m['cn'] >= 0 else '', 'sv': act})
    g['sevs'].update(act)

cards = []
for key, g in groups.items():
    mk = g['makes'].most_common(1)[0][0]
    md = g['models'].most_common(1)[0][0]
    sevs = []
    for s in sorted(g['sevs']):
        v = sev[s]
        sevs.append({'n': s, 'mc': v.get('mc') or '', 'v': v.get('v') or '', 'vd': v.get('vd') or '', 'ex': v.get('ex') or '', 'cr': (v.get('cr') or '').replace(' Criterion',''), 'br': v.get('br') or ''})
    cards.append({'mk': mk, 'md': md, 'b': g['build'], 'sevs': sevs, 'mres': g['mres']})
cards.sort(key=lambda c: (norm(c['mk']), norm(c['md']), norm(c['b'])))
json.dump({'built': today.strftime('%d/%m/%Y'), 'cards': cards}, open('groups.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('groups:', len(cards), '| multi-MRE:', len([c for c in cards if len(c['mres'])>1]))
