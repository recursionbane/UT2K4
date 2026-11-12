from playwright.sync_api import sync_playwright
import json, os
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, **({'executable_path': os.environ['CHROME_PATH']} if os.environ.get('CHROME_PATH') else {}))
 for mobile in [False,True]:
  context=browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},has_touch=mobile,is_mobile=mobile)
  page=context.new_page(); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(os.environ.get('ARENA_URL','http://localhost:8014/arena/'));page.wait_for_function("document.querySelector('#hud').textContent.includes('WASM')")
  if mobile:
   assert page.locator('.touch').is_visible()
   page.locator('[data-action="jump"]').first.tap()
  else:
   page.get_by_role('button',name='Enter arena',exact=True).click()
   page.keyboard.press('Space')
  page.wait_for_timeout(150)
  hud=page.locator('#hud').inner_text()
  assert 'HEIGHT 0.0 m' not in hud,hud
  page.screenshot(path='/tmp/ut2k4-arena-'+('touch' if mobile else 'desktop')+'.png',full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'horizontal overflow'
  assert not errors,errors
  print(json.dumps({'mobile':mobile,'hud':hud,'errors':errors}))
  context.close()
 browser.close()
