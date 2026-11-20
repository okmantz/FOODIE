import sys
from playwright.sync_api import sync_playwright
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844})
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('pageerror:'+str(e)+' | '+(getattr(e,'stack','') or '')[:600]))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(1500)
    pg.screenshot(path='/tmp/boot.png')
    print(pg.inner_text('body')[:400])
    b.close()
print('ERRORS',errs)
