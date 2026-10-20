#!/usr/bin/env python3
"""WARFRONT: DOMINION — end-to-end UI test in headless Chromium with a phone-sized landscape
viewport and touch input. Drives the real interface: menus, selection, build placement,
production, orders, pan/pinch/box gestures, pause/save/load, campaign, victory screen."""
import asyncio, sys, json, os
from playwright.async_api import async_playwright

URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/wf_e2e'
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, cond, info=''):
    results.append((name, bool(cond)))
    print(('  PASS ' if cond else '  FAIL ') + name + (('  [' + str(info) + ']') if info != '' else ''))

TOUCH = """
window.__touch = (type, id, x, y) => {
  const cv = document.getElementById('view');
  const ev = new PointerEvent(type, {pointerId: id, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true, button: 0});
  cv.dispatchEvent(ev);
};
"""

async def touch_drag(pg, x0, y0, x1, y1, steps=8, hold_ms=0):
    await pg.evaluate("([x,y])=>__touch('pointerdown',1,x,y)", [x0, y0])
    if hold_ms: await pg.wait_for_timeout(hold_ms)
    for i in range(1, steps + 1):
        await pg.evaluate("([x,y])=>__touch('pointermove',1,x,y)", [x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps])
        await pg.wait_for_timeout(16)
    await pg.evaluate("([x,y])=>__touch('pointerup',1,x,y)", [x1, y1])

async def screen_of(pg, expr):
    return await pg.evaluate("""(expr)=>{const e=(new Function('G','WF','return '+expr))(WF.G,WF); if(!e) return null; const s=WF.G.renderer.worldToScreen(e.x,e.y); const r=document.getElementById('view').getBoundingClientRect(); return {x:s.x+r.left,y:s.y+r.top,id:e.id};}""", expr)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto(URL)
        await pg.add_script_tag(content=TOUCH)
        await pg.wait_for_timeout(1500)
        check('main menu renders', await pg.is_visible('text=Skirmish'))
        await pg.screenshot(path=OUT + '/01_menu.png')

        # ---------------- skirmish setup
        await pg.tap('[data-a=skirmish]'); await pg.wait_for_timeout(300)
        await pg.tap('[data-a="map:twin_rivers"]'); await pg.tap('[data-a="myfac:aegis"]'); await pg.tap('[data-a="ai:1:easy"]')
        await pg.screenshot(path=OUT + '/02_skirmish.png')
        await pg.tap('[data-a=start]')
        await pg.wait_for_function('WF.G.running === true', timeout=20000)
        await pg.wait_for_timeout(500)
        check('match started from menu', await pg.evaluate('WF.G.world.map.id') == 'twin_rivers')
        await pg.screenshot(path=OUT + '/03_ingame.png')

        # ---------------- tap-select a builder
        pos = await screen_of(pg, "G.myUnits().find(u=>u.type==='builder')")
        await pg.evaluate("([x,y])=>{const R=WF.G.renderer;}", [0, 0])
        if pos:
            # center camera on builder first so it's on screen
            await pg.evaluate("(id)=>{const e=WF.G.world.get(id); WF.G.renderer.cam.x=e.x; WF.G.renderer.cam.y=e.y; WF.G.renderer.clampCam();}", pos['id'])
            await pg.wait_for_timeout(100)
            pos = await screen_of(pg, "G.world.get(%d)" % pos['id'])
            await pg.touchscreen.tap(pos['x'], pos['y']); await pg.wait_for_timeout(250)
        check('tap selects builder', await pg.evaluate("[...WF.G.sel].some(id=>WF.G.world.get(id) && WF.G.world.get(id).type==='builder')"))

        # ---------------- build a power plant through the UI
        await pg.tap('#btn-build'); await pg.wait_for_timeout(250)
        check('build drawer opens', await pg.is_visible('[data-build=power]'))
        await pg.tap('[data-build=power]'); await pg.wait_for_timeout(250)
        check('placement mode active', await pg.evaluate('!!WF.G.placing'))
        # tap candidate spots until valid
        ok = False
        for dx, dy in [(150, 0), (0, 150), (-150, 0), (0, -150), (220, 100), (-200, 120), (120, -180)]:
            spot = await pg.evaluate("([dx,dy])=>{const h=WF.G.world.ents.find(e=>e.owner===0&&e.type==='hq'); const s=WF.G.renderer.worldToScreen(h.x+dx,h.y+dy); return s;}", [dx, dy])
            await pg.touchscreen.tap(spot['x'], spot['y']); await pg.wait_for_timeout(120)
            if await pg.evaluate('WF.G.placing && WF.G.placing.valid'): ok = True; break
        check('valid placement found by tapping', ok)
        await pg.screenshot(path=OUT + '/04_placing.png')
        await pg.tap('#place-ok'); await pg.wait_for_timeout(200)
        site = await pg.evaluate("WF.G.world.ents.some(e=>!e.dead&&e.owner===0&&e.type==='power')")
        check('power plant construction site created', site)
        await pg.evaluate("()=>{const w=WF.G.world; for(let i=0;i<20*20;i++){w.step();WF.G.afterStep();}}")
        await pg.wait_for_timeout(300)
        check('power plant completed by builder', await pg.evaluate("WF.G.world.ents.some(e=>!e.dead&&e.owner===0&&e.type==='power'&&e.built)"))

        # ---------------- select HQ, queue production
        hqpos = await pg.evaluate("()=>{const h=WF.G.world.ents.find(e=>e.owner===0&&e.type==='hq'); WF.G.renderer.cam.x=h.x; WF.G.renderer.cam.y=h.y; WF.G.renderer.clampCam(); return h.id;}")
        await pg.wait_for_timeout(100)
        pos = await screen_of(pg, "G.world.get(%d)" % hqpos)
        await pg.touchscreen.tap(pos['x'], pos['y']); await pg.wait_for_timeout(300)
        check('tap selects HQ and opens production', await pg.is_visible('[data-prod=builder]'))
        await pg.tap('[data-prod=builder]'); await pg.wait_for_timeout(200)
        check('production queued via button', await pg.evaluate("WF.G.world.get(%d).queue.length===1" % hqpos))
        await pg.screenshot(path=OUT + '/05_production.png')

        # ---------------- move order by tapping ground
        rid = await pg.evaluate("()=>{const u=WF.G.myUnits().find(u=>u.type==='rifle'); WF.G.select([u]); const R=WF.G.renderer; R.cam.x=u.x; R.cam.y=u.y; R.clampCam(); return u.id;}")
        await pg.wait_for_timeout(100)
        tgt = await pg.evaluate("(id)=>{const u=WF.G.world.get(id); for (const [dx,dy] of [[90,-70],[-90,-70],[120,0],[-120,0]]) { const s=WF.G.renderer.worldToScreen(u.x+dx,u.y+dy); const el=document.elementFromPoint(s.x,s.y); if(el&&el.id==='view'&&!WF.G.pick(s.x,s.y)) return s; } return null;}", rid)
        await pg.touchscreen.tap(tgt['x'], tgt['y']); await pg.wait_for_timeout(150)
        check('tap ground issues move order', await pg.evaluate("(id)=>{const u=WF.G.world.get(id); return u.orders.length>0 && u.orders[0].t==='move';}", rid))

        # ---------------- gestures: pan, pinch, long-press box select
        cam0 = await pg.evaluate("({...WF.G.renderer.cam})")
        await pg.evaluate("WF.G.deselect()")
        await touch_drag(pg, 500, 200, 380, 150)
        cam1 = await pg.evaluate("({...WF.G.renderer.cam})")
        check('one-finger drag pans camera', abs(cam1['x'] - cam0['x']) > 30, (cam0['x'], cam1['x']))
        check('drag did not issue orders/select', await pg.evaluate('WF.G.sel.size') == 0)
        z0 = cam1['zoom']
        await pg.evaluate("""()=>{__touch('pointerdown',1,400,200); __touch('pointerdown',2,500,200);}""")
        for i in range(1, 9):
            await pg.evaluate("(i)=>{__touch('pointermove',1,400-i*12,200); __touch('pointermove',2,500+i*12,200);}", i)
            await pg.wait_for_timeout(16)
        await pg.evaluate("""()=>{__touch('pointerup',1,304,200); __touch('pointerup',2,596,200);}""")
        z1 = await pg.evaluate('WF.G.renderer.cam.zoom')
        check('pinch zooms in', z1 > z0 * 1.2, (z0, z1))
        # box select around starting army
        await pg.evaluate("()=>{const us=WF.G.myUnits(); let x=0,y=0; for(const u of us){x+=u.x;y+=u.y;} const R=WF.G.renderer; R.cam.zoom=0.8; R.cam.x=x/us.length; R.cam.y=y/us.length; R.clampCam();}")
        await pg.wait_for_timeout(100)
        await touch_drag(pg, 150, 60, 800, 380, steps=10, hold_ms=500)
        n = await pg.evaluate('WF.G.sel.size')
        check('long-press + drag box-selects several units', n >= 2, n)
        await pg.screenshot(path=OUT + '/06_boxselect.png')

        # ---------------- attack-move via command button
        if n:
            await pg.tap('[data-act=amove]'); await pg.wait_for_timeout(100)
            await pg.touchscreen.tap(600, 220); await pg.wait_for_timeout(100)
            check('attack-move command via button + tap', await pg.evaluate("[...WF.G.sel].map(id=>WF.G.world.get(id)).filter(Boolean).some(u=>u.orders[0]&&u.orders[0].t==='amove')"))
        # groups: long-press group 1
        await pg.dispatch_event('.grp[data-g="1"]', 'pointerdown'); await pg.wait_for_timeout(650); await pg.dispatch_event('.grp[data-g="1"]', 'pointerup')
        check('long-press assigns group', await pg.evaluate("(WF.G.groups[1]||[]).length") >= 1)

        # ---------------- minimap tap moves camera
        mm = await pg.evaluate("(()=>{const r=document.getElementById('minimap').getBoundingClientRect(); return {x:r.left+r.width*0.8,y:r.top+r.height*0.2};})()")
        await pg.touchscreen.tap(mm['x'], mm['y']); await pg.wait_for_timeout(100)
        cx = await pg.evaluate('WF.G.renderer.cam.x')
        check('minimap tap moves camera', cx > 1500, cx)

        # ---------------- pause, save, load
        await pg.tap('#btn-pause'); await pg.wait_for_timeout(200)
        check('pause menu opens', await pg.is_visible('text=Save Game'))
        await pg.tap('[data-a=save]'); await pg.wait_for_timeout(100); await pg.tap('[data-a="save:1"]'); await pg.wait_for_timeout(200)
        t_saved = await pg.evaluate('WF.G.world.time')
        cnt_saved = await pg.evaluate('WF.G.world.ents.filter(e=>!e.dead).length')
        await pg.screenshot(path=OUT + '/07_pause.png')
        await pg.tap('[data-a=load]'); await pg.wait_for_timeout(100); await pg.tap('[data-a="load:1"]')
        await pg.wait_for_function('WF.G.running === true', timeout=20000); await pg.wait_for_timeout(300)
        t_loaded = await pg.evaluate('WF.G.world.time'); cnt_loaded = await pg.evaluate('WF.G.world.ents.filter(e=>!e.dead).length')
        check('load restores saved match', abs(t_loaded - t_saved) < 1.0 and cnt_loaded == cnt_saved, (t_saved, t_loaded, cnt_saved, cnt_loaded))

        # ---------------- rotate / resize
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        await pg.set_viewport_size({'width': 932, 'height': 430}); await pg.wait_for_timeout(300)
        check('HUD survives resize', await pg.is_visible('#topbar') and await pg.evaluate('WF.G.renderer.sw') == 932)

        # ---------------- victory screen
        await pg.evaluate("()=>{const w=WF.G.world; for(const e of w.ents) if(e.owner===1&&(e.type==='hq'||e.type==='factory'||e.type==='builder')){e.hp=0;w.removeEntity(e,0);} }")
        await pg.wait_for_selector('text=Victory', timeout=15000)
        check('victory screen shown', True)
        await pg.screenshot(path=OUT + '/08_victory.png')
        await pg.tap('[data-a=menu]'); await pg.wait_for_timeout(600)
        check('return to main menu', await pg.is_visible('text=Campaign'))

        # ---------------- campaign mission 1
        await pg.tap('[data-a=campaign]'); await pg.wait_for_timeout(200)
        await pg.tap('[data-a="m:0"]'); await pg.wait_for_timeout(200)
        check('briefing shown', await pg.is_visible('text=Begin Mission'))
        await pg.screenshot(path=OUT + '/09_briefing.png')
        await pg.tap('[data-a=go]')
        await pg.wait_for_function('WF.G.running === true', timeout=20000); await pg.wait_for_timeout(500)
        check('campaign objectives visible', await pg.is_visible('#objectives'))
        await pg.screenshot(path=OUT + '/10_mission.png')
        # defeat path: destroy own HQ + builders
        await pg.evaluate("()=>{const w=WF.G.world; for(const e of w.ents) if(e.owner===0){e.hp=0;w.removeEntity(e,1);} }")
        await pg.wait_for_selector('text=Defeat', timeout=15000)
        check('defeat screen shown', True)
        await pg.tap('[data-a=menu]'); await pg.wait_for_timeout(400)

        # ---------------- settings persist
        await pg.tap('[data-a=settings]'); await pg.wait_for_timeout(200)
        await pg.tap('[data-a="quality:low"]'); await pg.wait_for_timeout(100)
        q = await pg.evaluate("JSON.parse(localStorage.getItem('wf_settings')).quality")
        check('settings persisted', q == 'low', q)
        await pg.tap('[data-a="quality:medium"]')

        real = [e for e in errors if 'favicon' not in e]
        check('no JavaScript errors', len(real) == 0, real[:5])
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d/%d E2E checks passed' % (len(results) - len(failed), len(results)))
    sys.exit(1 if failed else 0)

asyncio.run(main())
