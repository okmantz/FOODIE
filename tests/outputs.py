import base64, subprocess
from playwright.sync_api import sync_playwright
JS="""
async () => {
  const S=await import('/js/store.js'); const Pl=await import('/js/views/planner.js'); const Sh=await import('/js/lib/share.js'); const C=await import('/js/lib/calendar.js');
  const plan=S.activePlan(); const out={};
  const link=await Sh.shareLink('recipe', S.recipeById('veggie-scramble')); out.link=link; const code=link.split('#/import/')[1];
  const back=await Sh.unpack(code); out.roundtrip=back && back.d && back.d.id;
  out.ics=C.buildICS([{title:'Test, dinner; x', date:'2026-11-20', start:'18:30', minutes:45, description:'Line1 Line2'}]);
  return out;
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8080/'); pg.wait_for_timeout(600); pg.fill('input[type=text]','O'); pg.click('text=Start cooking'); pg.wait_for_timeout(600)
    o=pg.evaluate(JS)
    pg.goto('http://localhost:8080/#/planner'); pg.wait_for_timeout(500)
    pg.locator('button:has-text("Calendar")').first.click(); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.locator('button:has-text("Download PDF")').first.click()
    d.value.save_as('/tmp/plan.pdf')
    pg.goto('http://localhost:8080/#/grocery'); pg.wait_for_timeout(500)
    with pg.expect_download() as d2: pg.locator('button:has-text("PDF")').first.click()
    d2.value.save_as('/tmp/list.pdf')
    print('roundtrip',o['roundtrip'],'link len',len(o['link'])); print(o['ics'][:260]); print(errs)
    # import flow via hash
    pg.goto(o['link']); pg.wait_for_timeout(1200); print('modal:', pg.locator('.modal, .sheet').first.inner_text()[:120] if pg.locator('.modal, .sheet').count() else 'NO MODAL')
    b.close()
