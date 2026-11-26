import re, os
from playwright.sync_api import sync_playwright
errs=[]; res=[]
def ok(name, cond, extra=''):
    res.append(('PASS' if cond else 'FAIL', name, extra))
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844}, accept_downloads=True, permissions=['clipboard-read','clipboard-write'])
    pg=ctx.new_page()
    pg.on('console',lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.on('pageerror',lambda e: errs.append('pageerror:'+str(e)+' | '+(getattr(e,'stack','') or '')[:400]))
    B='http://localhost:8080/'
    pg.goto(B); pg.wait_for_timeout(700)
    pg.fill('input[type=text]','Owen'); pg.click('text=Continue'); pg.click('text=Continue'); pg.click('text=Start cooking'); pg.wait_for_timeout(800)

    # --- recipe detail + favorite
    pg.goto(B+'#/recipes'); pg.wait_for_timeout(500)
    pg.locator('.rcard, article, a.card').first.click(); pg.wait_for_timeout(600)
    ok('recipe detail opens', '#/recipe/' in pg.url, pg.url)
    ok('recipe has steps', pg.locator('text=Steps').count()>0 or pg.locator('ol').count()>0)
    pg.screenshot(path='/tmp/f_recipe.png')

    # --- create custom recipe
    pg.goto(B+'#/recipe/new'); pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/f_editor.png')
    inputs=pg.locator('input[type=text]'); print('editor text inputs', inputs.count())

    # --- grocery
    pg.goto(B+'#/grocery'); pg.wait_for_timeout(600)
    pg.screenshot(path='/tmp/f_grocery.png')
    cb=pg.locator('input[type=checkbox]'); n=cb.count(); ok('grocery has rows', n>5, str(n))
    cb.first.click(); pg.wait_for_timeout(300)
    # pdf download
    pg.locator('button:has-text("More"), button:has-text("Export"), button:has-text("PDF")').first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/f_grocery_menu.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)

    # --- planner tabs
    pg.goto(B+'#/planner'); pg.wait_for_timeout(600)
    for t in ['Overview','Meal prep','Calendar']:
        loc=pg.locator(f'[role=tab]:has-text("{t}"), button:has-text("{t}")').first
        if loc.count(): loc.click(); pg.wait_for_timeout(300)
    pg.screenshot(path='/tmp/f_planner_tabs.png', full_page=True)

    # --- insights/profile
    pg.goto(B+'#/insights'); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/f_insights.png', full_page=True)
    pg.goto(B+'#/profile'); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/f_profile.png', full_page=True)

    # --- coach
    pg.locator('.coach-fab').first.click(); pg.wait_for_timeout(500)
    pg.screenshot(path='/tmp/f_coach.png')
    b.close()
print('\n'.join(map(str,res))); print('ERRORS',errs)
