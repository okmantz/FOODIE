from playwright.sync_api import sync_playwright
errs=[]
routes=['#/','#/planner','#/recipes','#/grocery','#/pantry','#/discover','#/insights','#/profile']
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844})
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('pageerror:'+str(e)+' | '+(getattr(e,'stack','') or '')[:500]))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(800)
    pg.fill('input[type=text]','Owen')
    pg.click('text=Continue'); pg.click('text=Continue'); pg.click('text=Start cooking'); pg.wait_for_timeout(1200)
    for r in routes:
        pg.goto('http://localhost:8080/'+r); pg.wait_for_timeout(700)
        n=r.strip('#/') or 'home'
        pg.screenshot(path=f'/tmp/s_{n}.png',full_page=False)
        print(r, len(pg.inner_text('#app')), 'chars')
    b.close()
print('ERRORS',errs)
