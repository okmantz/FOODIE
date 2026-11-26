from playwright.sync_api import sync_playwright
errs=[]; res=[]
def ok(n,c,x=''): res.append(('PASS' if c else 'FAIL',n,x))
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':390,'height':844})
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('pageerror:'+str(e)+' | '+(getattr(e,'stack','') or '')[:400]))
    B='http://localhost:8080/'
    pg.goto(B); pg.wait_for_timeout(600); pg.fill('input[type=text]','Owen'); pg.click('text=Continue'); pg.click('text=Continue'); pg.click('text=Start cooking'); pg.wait_for_timeout(700)
    # quiz
    pg.goto(B+'#/discover'); pg.wait_for_timeout(500); pg.click('text=Start the quiz'); pg.wait_for_timeout(400)
    pg.screenshot(path='/tmp/q1.png')
    for i in range(7):
        btns=pg.locator('button.vs-card')
        if btns.count()==0: break
        btns.first.click(); pg.wait_for_timeout(450)
    pg.wait_for_timeout(500); pg.screenshot(path='/tmp/q_done.png')
    txt=pg.inner_text('#app'); ok('quiz finishes to results', 'For you' in txt or 'match' in txt.lower() or 'taste' in txt.lower(), txt[:80].replace('\n',' '))
    # restaurants tab
    pg.click('[role=tab]:has-text("Restaurants"), button:has-text("Restaurants")'); pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/q_rest.png'); ok('restaurant cards', pg.locator('#app >> text=Sample').count()>0)
    # create recipe
    pg.goto(B+'#/recipe/new'); pg.wait_for_timeout(500)
    pg.locator('input[type=text]').first.fill('Test Toast')
    ing=pg.locator('input[placeholder="Ingredient"]'); ing.nth(0).fill('Bread'); pg.locator('input[aria-label="Amount '+str(0+1)+'"]').fill('2')
    ing.nth(1).fill('Avocado'); pg.locator('input[aria-label="Amount '+str(1+1)+'"]').fill('1')
    pg.locator('textarea').first.fill('Toast the bread.\nMash the avocado on top.')
    pg.screenshot(path='/tmp/ed.png', full_page=True)
    pg.locator('button:has-text("Save")').first.click(); pg.wait_for_timeout(700)
    pg.screenshot(path='/tmp/ed_saved.png'); ok('save recipe navigates', '#/recipe/' in pg.url and 'new' not in pg.url, pg.url)
    b.close()
print('\n'.join(map(str,res))); print('ERRORS',errs)
