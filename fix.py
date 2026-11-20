from pathlib import Path
import re
root=Path('artifacts/fta-game/src/pages')
for name in ('Match.tsx','OnlineMatch.tsx'):
 p=root/name
 s=p.read_text()
 s=re.sub(r'(import\s*\{)([^}]*)(\}\s*from\s*["\']\.\./engine/constants["\'])',lambda m:m.group(1)+re.sub(r'\s*,\s*speedToTiles\b','',m.group(2))+m.group(3),s,flags=re.S)
 def sim(m):
  names=m.group(2)
  return m.group(1)+names+( '' if re.search(r'\bspeedToTiles\b',names) else ', speedToTiles ')+m.group(3)
 s=re.sub(r'(import\s*\{)([^}]*)(\}\s*from\s*["\']\.\./engine/simulation["\'])',sim,s,flags=re.S)
 p.write_text(s)
 print('Updated',p)
