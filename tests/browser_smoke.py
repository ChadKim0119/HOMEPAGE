"""Run against a running dev/preview server: python3 tests/browser_smoke.py.
Requires Python Playwright and Chromium (available in the cloud environment).
"""
import json
import io
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

BASE = os.environ.get('YEOBAEK_TEST_URL', 'http://127.0.0.1:5173/')
ARTIFACTS = Path('/workspace/artifacts')
ARTIFACTS.mkdir(exist_ok=True)

def go(page, index):
    page.evaluate("i=>{const s=document.querySelectorAll('.scene')[i];document.querySelector('.scenes').scrollTo({top:s.offsetTop,behavior:'instant'});}", index)
    page.wait_for_function("i=>document.querySelector('#current-number').textContent===String(i+1).padStart(2,'0')", arg=index)
    page.wait_for_timeout(70)

def finish_art(page):
    page.locator('.scene.is-active .calligraphy, .scene.is-active .typed-letter, .scene.is-active .brush-track, .scene.is-active .brush-complete').evaluate_all('(els)=>els.forEach(el=>el.getAnimations().forEach(a=>a.finish()))')

def english_only(page):
    assert page.locator('html').get_attribute('lang') == 'en'
    assert not re.search('[가-힣]', page.locator('body').inner_text()), 'Korean text leaked into English UI'
    attrs=page.locator('[aria-label], [placeholder], [title]').evaluate_all("els=>els.map(el=>[el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.getAttribute('title')].join(' ')).join(' ')")
    assert not re.search('[가-힣]', attrs), 'Korean accessible label or placeholder in English UI'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1349,'height':757})
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda e:errors.append(str(e)))
    page.goto(BASE, wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    assert page.locator('.scene').count()==21
    assert page.locator('body').get_attribute('data-reference')=='true'
    english_only(page)
    assert page.locator('#scene-01 .calligraphy').get_attribute('aria-label')=='A Pause beyond Efficiency.'
    assert 'IBM Plex Mono' in page.locator('.reference-footer').evaluate('el=>getComputedStyle(el).fontFamily')
    finish_art(page)
    page.screenshot(path=str(ARTIFACTS/'v2-reference-desktop.png'))

    # Brush paths really progress, and finish as complete glyphs.
    page.locator('.reference-replay').click()
    page.wait_for_timeout(180)
    early=page.locator('#scene-01 .brush-track').evaluate_all("els=>els.filter(el=>parseFloat(getComputedStyle(el).strokeDashoffset)>.01).length")
    assert early>0
    page.wait_for_timeout(600)
    later=page.locator('#scene-01 .brush-track').evaluate_all("els=>els.filter(el=>parseFloat(getComputedStyle(el).strokeDashoffset)>.01).length")
    assert later<early
    finish_art(page)
    assert page.locator('#scene-01 .brush-track').evaluate_all("els=>els.every(el=>parseFloat(getComputedStyle(el).strokeDashoffset)===0)")

    # The shortcut works even when a control has focus; native fullscreen is used.
    page.keyboard.press('f')
    page.wait_for_function("document.body.classList.contains('is-focus')")
    assert page.locator('.guide:visible').count()==0
    assert page.evaluate('!!document.fullscreenElement')
    page.screenshot(path=str(ARTIFACTS/'v2-focus-desktop.png'))
    page.keyboard.press('f')
    page.wait_for_function("!document.body.classList.contains('is-focus')")
    assert not page.evaluate('!!document.fullscreenElement')
    page.locator('#signup-form input').focus()
    page.keyboard.press('f')
    assert not page.locator('body').evaluate("el=>el.classList.contains('is-focus')")
    page.locator('#signup-form input').fill('preview@example.com')
    page.locator('#signup-form button').click()
    assert 'NO EMAIL WAS SENT' in page.locator('.signup-note').inner_text()

    # Ink actually diffuses at the input position on the full-scene canvas.
    go(page,1)
    page.mouse.click(220,280)
    page.wait_for_timeout(500)
    alpha=page.locator('#scene-02 canvas').evaluate("c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===3&&v>0)}")
    assert alpha
    before=page.locator('#scene-02 canvas').evaluate('c=>c.toDataURL()')
    page.mouse.move(1100,450)
    page.wait_for_timeout(500)
    assert before!=page.locator('#scene-02 canvas').evaluate('c=>c.toDataURL()')

    # Glow fills the viewport and follows the pointer beyond the artwork region.
    go(page,2)
    rect=page.locator('#scene-03 .ambient-layer').bounding_box()
    assert abs(rect['x'])<1 and abs(rect['y'])<1 and rect['width']==1349 and rect['height']==757
    page.mouse.move(30,150)
    page.wait_for_timeout(350)
    before=page.locator('#scene-03').evaluate("el=>el.style.getPropertyValue('--px')")
    page.mouse.move(1310,650)
    page.wait_for_timeout(350)
    after=page.locator('#scene-03').evaluate("el=>el.style.getPropertyValue('--px')")
    assert float(after[:-1])>float(before[:-1])+30
    page.screenshot(path=str(ARTIFACTS/'v2-light-full-scene.png'))

    # Paper and patterns have observable transforms, rather than inert hints.
    for index,selector in [(3,'.art-composition'),(4,'.word-pattern'),(12,'.art-composition')]:
        go(page,index)
        page.mouse.move(200,250)
        page.wait_for_timeout(250)
        before=page.locator('.scene').nth(index).locator(selector).evaluate('el=>getComputedStyle(el).transform')
        page.mouse.move(1100,550)
        page.wait_for_timeout(350)
        after=page.locator('.scene').nth(index).locator(selector).evaluate('el=>getComputedStyle(el).transform')
        assert before!=after,(index,'transform did not move')

    # The typed effect is a sequence of letters, not a single fade.
    go(page,8)
    page.locator('#scene-09 [data-action="replay"]').click()
    page.wait_for_timeout(60)
    early=page.locator('#scene-09 .typed-letter').evaluate_all('els=>els.filter(el=>getComputedStyle(el).opacity==="1").length')
    page.wait_for_timeout(650)
    later=page.locator('#scene-09 .typed-letter').evaluate_all('els=>els.filter(el=>getComputedStyle(el).opacity==="1").length')
    total=page.locator('#scene-09 .typed-letter').count()
    assert early<later<total,(early,later,total)
    finish_art(page)
    assert page.locator('#scene-09 .typed-letter').evaluate_all('els=>els.every(el=>getComputedStyle(el).opacity==="1")')

    # Both language modes preserve the current scene and persist the choice.
    page.get_by_role('button',name='Switch to Korean',exact=True).click()
    page.wait_for_function('document.documentElement.lang==="ko"')
    assert page.locator('#current-number').inner_text()=='09'
    assert '꽃 한 송이' in page.locator('#scene-09 .calligraphy').get_attribute('aria-label')
    page.reload(wait_until='networkidle')
    assert page.locator('html').get_attribute('lang')=='ko'
    assert page.locator('#current-number').inner_text()=='09'
    page.get_by_role('button',name='영어로 전환',exact=True).click()
    page.wait_for_function('document.documentElement.lang==="en"')
    english_only(page)
    page.locator('.site-header [data-action="gallery"]').click()
    english_only(page)
    for label,count in [('Light',7),('Dark',5),('Paper & texture',5),('Patterns',4),('All scenes',21)]:
        page.get_by_role('button',name=label,exact=True).click()
        assert page.locator('.gallery-card').count()==count,(label,count)
    page.screenshot(path=str(ARTIFACTS/'v2-gallery-en.png'))
    page.keyboard.press('Escape')
    page.get_by_role('button',name='The studio',exact=True).click()
    english_only(page)
    page.get_by_role('button',name='Tell us your story',exact=True).click()
    english_only(page)
    page.locator('#contact-dialog').get_by_label('Your name',exact=True).fill('Preview')
    page.locator('#contact-dialog').get_by_label('Email address',exact=True).fill('preview@example.com')
    page.locator('#contact-dialog').get_by_label('Your story',exact=True).fill('<script>A quiet thought</script>')
    page.get_by_role('button',name='Preview your message',exact=True).click()
    assert 'Nothing was sent.' in page.locator('.form-result').inner_text()
    assert page.locator('.form-result script').count()==0
    page.keyboard.press('Escape')

    # Check final artwork bounds in both languages at desktop and phone sizes.
    clipping=[]
    for locale in ['en','ko']:
        if page.locator('html').get_attribute('lang')!=locale:
            page.locator(f'[data-language="{locale}"]').click()
            page.wait_for_function('(lang)=>document.documentElement.lang===lang',arg=locale)
        for width,height in [(1349,757),(1440,900),(390,844),(375,667),(320,568)]:
            page.set_viewport_size({'width':width,'height':height})
            page.mouse.move(width/2,height/2)
            for index in range(21):
                go(page,index)
                finish_art(page)
                bounds=page.locator('.scene').nth(index).locator('.calligraphy').bounding_box()
                if bounds['x'] < -1 or bounds['x']+bounds['width'] > width+1 or bounds['y'] < 65 or bounds['y']+bounds['height'] > height-65:
                    clipping.append({'locale':locale,'size':[width,height],'scene':index+1,'bounds':bounds})
            go(page,0)
            finish_art(page)
            if width==390:
                page.screenshot(path=str(ARTIFACTS/f'v2-reference-mobile-{locale}.png'))
            if width==1349:
                go(page,5)
                finish_art(page)
                page.screenshot(path=str(ARTIFACTS/f'v2-brush-{locale}.png'))
    print('LAYOUT:',json.dumps(clipping),flush=True)
    assert not clipping,clipping

    # Completed brush masks must leave the original glyphs fully visible.
    page.set_viewport_size({'width':1349,'height':757})
    for locale in ['en','ko']:
        if page.locator('html').get_attribute('lang')!=locale:
            page.locator(f'[data-language="{locale}"]').click()
            page.wait_for_function('(lang)=>document.documentElement.lang===lang',arg=locale)
        go(page,5)
        page.evaluate('document.fonts.ready')
        finish_art(page)
        artwork=page.locator('#scene-06 .calligraphy')
        completed=artwork.screenshot()
        page.locator('#scene-06 .brush-glyph').evaluate_all("els=>els.forEach(el=>el.removeAttribute('mask'))")
        unmasked=artwork.screenshot()
        original=Image.open(io.BytesIO(completed)).convert('RGB')
        restored=Image.open(io.BytesIO(unmasked)).convert('RGB')
        assert original.size==restored.size
        # Chromium's masked compositing rounds antialiased edge pixels by up to
        # six levels. Missing strokes produce much larger luminance differences.
        delta=max(channel[1] for channel in ImageChops.difference(original,restored).getextrema())
        assert delta<=8,f'Completed mask clipped {locale} glyphs (maximum delta {delta})'

    # Existing bookmarks keep their original scenes after adding a cover.
    migration=browser.new_page(viewport={'width':1349,'height':757})
    migration.goto(BASE,wait_until='networkidle')
    migration.evaluate("localStorage.setItem('yeobaek-saved','[0,19]');localStorage.removeItem('yeobaek-saved-v2')")
    migration.reload(wait_until='networkidle')
    migration.locator('.reference-gallery').click()
    migration.locator('.saved-filter').click()
    assert migration.locator('.gallery-card').count()==2
    assert migration.locator('.gallery-card h3').all_inner_texts()==['The art of empty space','Every ending, a beginning']
    migration.close()

    # Embedded browsers without the fullscreen API retain a keyboard-exitable view.
    fallback=browser.new_page()
    fallback.add_init_script('Element.prototype.requestFullscreen = undefined')
    fallback.goto(BASE,wait_until='networkidle')
    fallback.keyboard.press('f')
    assert fallback.locator('body').evaluate("el=>el.classList.contains('is-focus')")
    fallback.keyboard.press('Escape')
    assert not fallback.locator('body').evaluate("el=>el.classList.contains('is-focus')")
    fallback.close()

    # Reduced motion shows completed content and disables all replay controls.
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("document.querySelector('.replay-button').disabled")
    go(page,0)
    assert page.locator('.reference-replay').is_disabled()
    assert not page.locator('#scene-01 .brush-track').evaluate_all('els=>els.some(el=>el.getAnimations().length)')
    go(page,8)
    assert page.locator('#scene-09 .typed-letter').evaluate_all('els=>els.every(el=>getComputedStyle(el).opacity==="1")')
    assert page.locator('#scene-09 .replay-button').is_disabled()
    assert not errors,errors
    print(json.dumps({'result':'passed','layouts':210,'locales':['en','ko'],'native_fullscreen':True,'embedded_fallback':True,'effects':['brush','type','ink','glow','tilt','drift','float'],'javascript_errors':errors}),flush=True)
    browser.close()
